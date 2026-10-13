import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.review import Review
from app.models.user import User
from app.schemas.seller import SellerReputationResponse


class SellerService:
    @staticmethod
    async def get_seller_reputation(
        session: AsyncSession, seller_id: uuid.UUID
    ) -> SellerReputationResponse:
        user = await session.get(User, seller_id)
        if not user:
            return SellerReputationResponse(
                seller_id=seller_id,
                seller_name="Unknown Seller",
                student_id=None,
                score=100,
                average_rating=5.0,
                total_reviews=0,
                total_products=0,
                active_listings=0,
                rented_out=0,
            )

        # Name fallback: Student ID or user email prefix
        seller_name = user.student_id or user.email.split("@")[0].title()

        # Query products stats
        products_stmt = select(
            func.count(Product.id).label("total_products"),
            func.count(Product.id)
            .filter(Product.status.in_(["available", "Active"]))
            .label("active_listings"),
            func.count(Product.id)
            .filter(Product.status.in_(["rented", "Rented"]))
            .label("rented_out"),
        ).where(Product.seller_id == seller_id)
        prod_result = await session.execute(products_stmt)
        prod_row = prod_result.one()
        total_products = prod_row.total_products or 0
        active_listings = prod_row.active_listings or 0
        rented_out = prod_row.rented_out or 0

        # Query reviews across all products of this seller
        reviews_stmt = (
            select(
                func.count(Review.id).label("total_reviews"),
                func.avg(Review.rating).label("avg_rating"),
            )
            .select_from(Review)
            .join(Product, Review.product_id == Product.id)
            .where(Product.seller_id == seller_id)
        )
        rev_result = await session.execute(reviews_stmt)
        rev_row = rev_result.one()
        total_reviews = rev_row.total_reviews or 0
        avg_rating_val = rev_row.avg_rating

        if total_reviews > 0 and avg_rating_val is not None:
            average_rating = round(float(avg_rating_val), 1)
            # Reputation score scaled to 0-100
            score = max(0, min(100, round((average_rating / 5.0) * 100)))
        else:
            average_rating = 5.0
            score = 100

        return SellerReputationResponse(
            seller_id=seller_id,
            seller_name=seller_name,
            student_id=user.student_id,
            score=score,
            average_rating=average_rating,
            total_reviews=total_reviews,
            total_products=total_products,
            active_listings=active_listings,
            rented_out=rented_out,
        )
