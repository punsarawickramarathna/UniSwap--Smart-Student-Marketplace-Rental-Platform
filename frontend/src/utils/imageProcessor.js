/**
 * Client-side image processor for UniSwap product images.
 *
 * Handles:
 *  - HEIC / HEIF → JPEG conversion  (via heic2any, loaded on demand)
 *  - Resize to max 1920 px on the longest side
 *  - Compress to ≤ 4.5 MB (safely under the 5 MB backend limit)
 *  - Preserves aspect ratio — no stretching / distortion
 */
import imageCompression from "browser-image-compression";

const MAX_WIDTH_OR_HEIGHT = 1920;
const MAX_SIZE_MB = 4.5; // target — leaves headroom under 5 MB
const INITIAL_QUALITY = 0.9;

/* ------------------------------------------------------------------ */
/*  Single image                                                       */
/* ------------------------------------------------------------------ */

/**
 * Process one image file: convert unsupported formats, resize, compress.
 *
 * @param {File} file  – raw file from the file picker
 * @returns {Promise<{ file: File, previewUrl: string }>}
 */
export async function processImage(file) {
  let workingFile = file;

  /* ---------- HEIC / HEIF conversion ---------- */
  const lowerName = file.name.toLowerCase();
  const isHeic =
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif";

  if (isHeic) {
    try {
      const { default: heic2any } = await import("heic2any");
      const result = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: INITIAL_QUALITY,
      });
      const converted = Array.isArray(result) ? result[0] : result;
      workingFile = new File(
        [converted],
        lowerName.replace(/\.(heic|heif)$/i, ".jpg"),
        { type: "image/jpeg" },
      );
    } catch {
      throw new Error(
        `Cannot convert "${file.name}". HEIC is not supported in this browser.`,
      );
    }
  }

  /* ---------- BMP / TIFF — canvas round-trip ---------- */
  const needsConvert =
    workingFile.type === "image/bmp" ||
    workingFile.type === "image/tiff" ||
    lowerName.endsWith(".bmp") ||
    lowerName.endsWith(".tiff") ||
    lowerName.endsWith(".tif");

  if (needsConvert) {
    workingFile = await canvasConvert(workingFile);
  }

  /* ---------- Resize + compress ---------- */
  try {
    const compressed = await imageCompression(workingFile, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
      useWebWorker: true,
      initialQuality: INITIAL_QUALITY,
      preserveExif: false,
    });

    const outputName = compressed.name || workingFile.name;
    const outputFile = new File([compressed], outputName, {
      type: compressed.type || workingFile.type || "image/jpeg",
    });

    const previewUrl = URL.createObjectURL(outputFile);
    return { file: outputFile, previewUrl };
  } catch (err) {
    throw new Error(
      `Failed to process "${file.name}": ${err.message || "Unknown error"}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Batch helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Process many files sequentially, reporting progress.
 *
 * @param {File[]} files
 * @param {(info: {current:number,total:number,fileName:string})=>void} [onProgress]
 * @returns {Promise<Array<{file:File,previewUrl:string}|{error:string,fileName:string}>>}
 */
export async function processImages(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.({ current: i + 1, total: files.length, fileName: f.name });
    try {
      results.push(await processImage(f));
    } catch (err) {
      results.push({ error: err.message, fileName: f.name });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Convert an unsupported format to JPEG via an off-screen canvas. */
function canvasConvert(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      c.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas conversion failed"));
          const newName = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], newName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        INITIAL_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Browser cannot read "${file.name}".`));
    };
    img.src = url;
  });
}
