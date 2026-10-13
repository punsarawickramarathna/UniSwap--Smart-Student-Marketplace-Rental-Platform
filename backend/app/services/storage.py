"""Product-image storage: validate → process → upload to Supabase Storage.

Processing pipeline (Pillow):
  1.  Accept uploads up to 20 MB raw.
  2.  Auto-detect actual format (ignore unreliable Content-Type).
  3.  Resize images larger than 1920 px (longest side) while keeping the
      aspect ratio intact.
  4.  Convert HEIC / BMP / TIFF or any Pillow-readable format to JPEG.
  5.  Iteratively lower JPEG / WEBP quality until the file is ≤ 5 MB.
  6.  Upload the processed bytes to Supabase Storage.
"""

from __future__ import annotations

import base64
import io
import uuid

import httpx
from fastapi import HTTPException, UploadFile

try:
    from PIL import Image as PILImage, ImageOps  # type: ignore[import-untyped]

    _PILLOW = True
except ImportError:  # pragma: no cover – only in minimal test envs
    _PILLOW = False

# ---------- constants ----------

# MIME types we accept at the *upload* boundary.  Pillow can handle many more,
# but we gate the initial check so that clearly non-image payloads are rejected
# early.
ACCEPTED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
        "image/heif",
        "image/bmp",
        "image/tiff",
        "image/avif",
        # Browsers sometimes fall back to this for unusual extensions
        "application/octet-stream",
    }
)

# Formats we actually persist in Supabase Storage
STORABLE_MIMES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)

MAX_RAW_SIZE: int = 20 * 1024 * 1024  # 20 MB
MAX_STORED_SIZE: int = 5 * 1024 * 1024  # 5 MB
MAX_DIMENSION: int = 1920
JPEG_INITIAL_QUALITY: int = 90

EXT_FOR_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


# ---------- service ----------


class StorageService:
    """Thin wrapper around Supabase Storage with server-side image processing."""

    def __init__(
        self,
        supabase_url: str | None = None,
        service_role_key: str | None = None,
        bucket_name: str = "product-images",
    ) -> None:
        self.supabase_url = supabase_url.rstrip("/") if supabase_url else None
        self.service_role_key = service_role_key
        self.bucket_name = bucket_name

    # ---------- public API ----------

    async def upload_file(self, file: UploadFile) -> str:
        """Read *file*, validate, process, upload, return the public URL."""

        contents = await file.read()
        raw_size = len(contents)
        content_type = (file.content_type or "application/octet-stream").lower()

        self._validate_raw(content_type, raw_size)

        # Decide whether we need to run the image through Pillow
        needs_processing = (
            raw_size > MAX_STORED_SIZE
            or content_type not in STORABLE_MIMES
        )

        if needs_processing:
            if not _PILLOW:
                # Without Pillow we can only accept already-storable images that
                # are small enough.
                if content_type not in STORABLE_MIMES:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Server cannot convert '{content_type}'. "
                            "Please upload JPG, PNG, WEBP, or GIF."
                        ),
                    )
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Image is too large and server-side compression is "
                        "not available.  Please resize before uploading."
                    ),
                )

            contents, content_type = self._process(contents, content_type)

        # Pick extension for the stored object name
        ext = EXT_FOR_MIME.get(content_type, ".jpg")
        object_path = f"{uuid.uuid4()}{ext}"

        # Upload to Supabase Storage
        if self.supabase_url and self.service_role_key:
            return await self._supabase_upload(object_path, contents, content_type)

        # Fallback: base64 data-URI (local/test environments)
        encoded = base64.b64encode(contents).decode()
        return f"data:{content_type};base64,{encoded}"

    async def delete_file(self, image_url: str) -> None:
        if not self.supabase_url or not self.service_role_key:
            return
        marker = f"/storage/v1/object/public/{self.bucket_name}/"
        if marker not in image_url:
            return
        file_path = image_url.split(marker, 1)[-1]
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{file_path}"
        headers = {"Authorization": f"Bearer {self.service_role_key}"}
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(url, headers=headers)
        except Exception:
            pass  # best-effort

    # ---------- internal ----------

    def _validate_raw(self, content_type: str, file_size: int) -> None:
        if content_type not in ACCEPTED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type '{content_type}'. "
                    "Allowed: JPG, PNG, WEBP, GIF, HEIC, BMP, TIFF, AVIF."
                ),
            )
        if file_size > MAX_RAW_SIZE:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File exceeds the {MAX_RAW_SIZE // (1024 * 1024)} MB "
                    "upload limit."
                ),
            )

    # ---- Pillow processing pipeline ----

    @staticmethod
    def _process(data: bytes, content_type: str) -> tuple[bytes, str]:
        """Resize + compress *data*, returning (new_bytes, new_mime)."""

        try:
            img = PILImage.open(io.BytesIO(data))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot read image data: {exc}",
            ) from exc

        # Auto-orient from EXIF (handles photos taken in landscape, etc.)
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # Detect animated GIFs and pass them through untouched
        if getattr(img, "is_animated", False):
            if len(data) <= MAX_STORED_SIZE:
                return data, "image/gif"
            # Animated GIF too large — take just the first frame
            img = img.convert("RGB")

        # Choose output format
        out_fmt, out_mime = _pick_output_format(img, content_type)

        # Ensure mode is compatible with JPEG
        if out_fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = _convert_to_rgb(img)

        # Resize if either dimension exceeds the cap
        w, h = img.size
        if w > MAX_DIMENSION or h > MAX_DIMENSION:
            ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
            img = img.resize(
                (int(w * ratio), int(h * ratio)),
                PILImage.LANCZOS,
            )

        # Iterative quality reduction until under MAX_STORED_SIZE
        quality = JPEG_INITIAL_QUALITY
        buf = io.BytesIO()
        while quality >= 20:
            buf.seek(0)
            buf.truncate()
            save_kw: dict = {"optimize": True}
            if out_fmt in ("JPEG", "WEBP"):
                save_kw["quality"] = quality
            img.save(buf, format=out_fmt, **save_kw)
            if buf.tell() <= MAX_STORED_SIZE:
                return buf.getvalue(), out_mime
            quality -= 10

        # PNG still too large → fall back to JPEG
        if out_fmt == "PNG":
            if img.mode != "RGB":
                img = _convert_to_rgb(img)
            quality = JPEG_INITIAL_QUALITY
            while quality >= 20:
                buf.seek(0)
                buf.truncate()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
                if buf.tell() <= MAX_STORED_SIZE:
                    return buf.getvalue(), "image/jpeg"
                quality -= 10

        # Return whatever we ended up with (should be rare)
        return buf.getvalue(), out_mime

    async def _supabase_upload(
        self, object_path: str, data: bytes, content_type: str
    ) -> str:
        upload_url = (
            f"{self.supabase_url}/storage/v1/object/"
            f"{self.bucket_name}/{object_path}"
        )
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    upload_url, headers=headers, content=data
                )
                if resp.status_code in (200, 201):
                    return (
                        f"{self.supabase_url}/storage/v1/object/public/"
                        f"{self.bucket_name}/{object_path}"
                    )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"Storage upload failed ({resp.status_code}): "
                        f"{resp.text[:200]}"
                    ),
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Storage upload error: {exc}",
            ) from exc


# ---------- module-level helpers ----------


def _pick_output_format(
    img: "PILImage.Image", content_type: str
) -> tuple[str, str]:
    """Choose the Pillow save format + MIME for the given image."""
    if content_type == "image/webp":
        return "WEBP", "image/webp"
    if content_type == "image/png" and img.mode in ("RGBA", "LA", "PA", "P"):
        # Keep PNG when transparency matters
        return "PNG", "image/png"
    # Everything else (HEIC, BMP, TIFF, AVIF, big PNG, …) → JPEG
    return "JPEG", "image/jpeg"


def _convert_to_rgb(img: "PILImage.Image") -> "PILImage.Image":
    """Flatten alpha / palette to an RGB image on a white background."""
    if img.mode in ("RGBA", "LA", "PA", "P"):
        rgba = img.convert("RGBA")
        bg = PILImage.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return img.convert("RGB")
