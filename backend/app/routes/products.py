import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user
from app.dependencies.database import get_session
from app.models.product import Product, ProductImage
from app.models.user import User
from app.schemas.product import (
    ProductCreate,
    ProductImageResponse,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)
from app.services.product import ProductService
from app.services.storage import StorageService

router = APIRouter(prefix="/api/products", tags=["products"])


def get_storage_service(request: Request) -> StorageService:
    storage_svc = getattr(request.app.state, "storage_service", None)
    if storage_svc is not None:
        return storage_svc
    return StorageService()


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    data: ProductCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProductResponse:
    return await ProductService.create_product(
        session=session, current_user=current_user, data=data
    )


@router.get("", response_model=ProductListResponse)
async def get_products(
    session: Annotated[AsyncSession, Depends(get_session)],
    q: str | None = Query(default=None, description="Search query"),
    category: str | None = Query(default=None, description="Category filter"),
    product_type: str | None = Query(default=None, description="Type filter"),
    condition: str | None = Query(default=None, description="Condition filter"),
    status: str | None = Query(default=None, description="Status filter"),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    seller_id: uuid.UUID | None = Query(default=None, description="Seller ID"),
    sort: str = Query(default="newest", description="Sorting criteria"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> ProductListResponse:
    return await ProductService.get_products(
        session=session,
        query=q,
        category=category,
        product_type=product_type,
        condition=condition,
        status=status,
        min_price=min_price,
        max_price=max_price,
        seller_id=seller_id,
        sort=sort,
        page=page,
        limit=limit,
    )


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product_by_id(
    product_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProductResponse:
    return await ProductService.get_product_by_id(
        session=session, product_id=product_id
    )


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProductResponse:
    return await ProductService.update_product(
        session=session,
        current_user=current_user,
        product_id=product_id,
        data=data,
    )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await ProductService.delete_product(
        session=session,
        current_user=current_user,
        product_id=product_id,
    )


@router.post("/images/upload")
async def upload_image(
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> dict[str, str]:
    image_url = await storage_service.upload_file(file)
    return {"url": image_url}


@router.post("/{product_id}/images", response_model=ProductImageResponse)
async def add_product_image(
    product_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> ProductImageResponse:
    stmt = (
        select(Product)
        .options(selectinload(Product.images))
        .where(Product.id == product_id)
    )
    res = await session.execute(stmt)
    product = res.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product.seller_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to add images to this product.",
        )

    image_url = await storage_service.upload_file(file)
    is_primary = len(product.images) == 0
    img = ProductImage(
        product_id=product.id,
        image_url=image_url,
        is_primary=is_primary,
    )
    session.add(img)
    await session.commit()
    await session.refresh(img)

    return ProductImageResponse(
        id=img.id,
        image_url=img.image_url,
        is_primary=img.is_primary,
        created_at=img.created_at,
    )


@router.delete("/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> None:
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product.seller_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to delete images from this product.",
        )

    img = await session.get(ProductImage, image_id)
    if not img or img.product_id != product_id:
        raise HTTPException(status_code=404, detail="Product image not found.")

    await storage_service.delete_file(img.image_url)
    await session.delete(img)
    await session.commit()
