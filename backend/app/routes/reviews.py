import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user
from app.dependencies.database import get_session
from app.models.user import User
from app.schemas.review import (
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdate,
)
from app.services.review import ReviewService

router = APIRouter(tags=["reviews"])


@router.post(
    "/api/products/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_review(
    product_id: uuid.UUID,
    data: ReviewCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewResponse:
    return await ReviewService.create_review(
        session=session,
        current_user=current_user,
        product_id=product_id,
        data=data,
    )


@router.get(
    "/api/products/{product_id}/reviews",
    response_model=ReviewListResponse,
)
async def get_product_reviews(
    product_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewListResponse:
    return await ReviewService.get_product_reviews(session=session, product_id=product_id)


@router.get(
    "/api/reviews/my",
    response_model=ReviewListResponse,
)
async def get_my_reviews(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewListResponse:
    return await ReviewService.get_user_reviews(
        session=session, user_id=current_user.id
    )


@router.put(
    "/api/reviews/{review_id}",
    response_model=ReviewResponse,
)
async def update_review(
    review_id: uuid.UUID,
    data: ReviewUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewResponse:
    return await ReviewService.update_review(
        session=session,
        current_user=current_user,
        review_id=review_id,
        data=data,
    )


@router.delete(
    "/api/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_review(
    review_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await ReviewService.delete_review(
        session=session,
        current_user=current_user,
        review_id=review_id,
    )
