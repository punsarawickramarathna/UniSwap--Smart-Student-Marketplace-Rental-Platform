from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.category import CategoryResponse
from app.services.product import ProductService

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def get_categories(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[CategoryResponse]:
    return await ProductService.get_categories_with_counts(session)
