import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.review import Review
from app.models.user import User
from app.schemas.review import (
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdate,
)


class ReviewService:
    @staticmethod
    def _to_response(review: Review, product_title: str | None = None) -> ReviewResponse:
        user_name = "Student"
        user_student_id = None
        if review.user:
            user_student_id = review.user.student_id
            user_name = review.user.student_id or review.user.email.split("@")[0].title()

        title = product_title or (review.product.title if review.product else "Product")

        return ReviewResponse(
            id=review.id,
            product_id=review.product_id,
            product_title=title,
            user_id=review.user_id,
            user_name=user_name,
            user_student_id=user_student_id,
            rating=review.rating,
            comment=review.comment,
            is_verified_purchase=review.is_verified_purchase,
            created_at=review.created_at,
            updated_at=review.updated_at,
        )

    @classmethod
    async def create_review(
        cls,
        session: AsyncSession,
        current_user: User,
        product_id: uuid.UUID,
        data: ReviewCreate,
    ) -> ReviewResponse:
        product = await session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found.")

        if product.seller_id == current_user.id:
            raise HTTPException(
                status_code=400,
                detail="Sellers cannot submit reviews for their own listings.",
            )

        # Check existing review
        existing = await session.execute(
            select(Review).where(
                Review.product_id == product_id,
                Review.user_id == current_user.id,
            )
        )
        if existing.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="You have already submitted a review for this product.",
            )

        review = Review(
            product_id=product_id,
            user_id=current_user.id,
            rating=data.rating,
            comment=data.comment.strip(),
            is_verified_purchase=True,
        )
        session.add(review)
        await session.commit()
        await session.refresh(review)
        # Ensure relations loaded
        await session.refresh(review, ["user", "product"])

        return cls._to_response(review, product.title)

    @classmethod
    async def get_product_reviews(
        cls, session: AsyncSession, product_id: uuid.UUID
    ) -> ReviewListResponse:
        product = await session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found.")

        result = await session.execute(
            select(Review)
            .options(selectinload(Review.user))
            .where(Review.product_id == product_id)
            .order_by(Review.created_at.desc())
        )
        reviews = result.scalars().all()
        total = len(reviews)
        avg_rating = (
            round(sum(r.rating for r in reviews) / total, 1) if total > 0 else 0.0
        )

        items = [cls._to_response(r, product.title) for r in reviews]
        return ReviewListResponse(items=items, total=total, average_rating=avg_rating)

    @classmethod
    async def get_user_reviews(
        cls, session: AsyncSession, user_id: uuid.UUID
    ) -> ReviewListResponse:
        result = await session.execute(
            select(Review)
            .options(selectinload(Review.user), selectinload(Review.product))
            .where(Review.user_id == user_id)
            .order_by(Review.created_at.desc())
        )
        reviews = result.scalars().all()
        total = len(reviews)
        avg_rating = (
            round(sum(r.rating for r in reviews) / total, 1) if total > 0 else 0.0
        )

        items = [cls._to_response(r) for r in reviews]
        return ReviewListResponse(items=items, total=total, average_rating=avg_rating)

    @classmethod
    async def update_review(
        cls,
        session: AsyncSession,
        current_user: User,
        review_id: uuid.UUID,
        data: ReviewUpdate,
    ) -> ReviewResponse:
        review = await session.get(
            Review,
            review_id,
            options=[selectinload(Review.user), selectinload(Review.product)],
        )
        if not review:
            raise HTTPException(status_code=404, detail="Review not found.")

        if review.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to edit this review.",
            )

        if data.rating is not None:
            review.rating = data.rating
        if data.comment is not None:
            review.comment = data.comment.strip()

        await session.commit()
        await session.refresh(review)
        return cls._to_response(review)

    @classmethod
    async def delete_review(
        cls,
        session: AsyncSession,
        current_user: User,
        review_id: uuid.UUID,
    ) -> None:
        review = await session.get(Review, review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found.")

        if review.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to delete this review.",
            )

        await session.delete(review)
        await session.commit()
