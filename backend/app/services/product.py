import math
import uuid

from fastapi import HTTPException
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.product import Product, ProductImage
from app.models.review import Review
from app.models.user import User
from app.schemas.category import CategoryResponse
from app.schemas.product import (
    ProductCreate,
    ProductImageResponse,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)
from app.services.seller import SellerService


class ProductService:
    @staticmethod
    def _to_response(
        product: Product,
        seller_score: int = 100,
        seller_rating: float = 5.0,
        seller_reviews_count: int = 0,
        rating: float = 0.0,
        reviews_count: int = 0,
    ) -> ProductResponse:
        seller_name = "Campus Student"
        seller_student_id = None
        if product.seller:
            seller_student_id = product.seller.student_id
            seller_name = product.seller.student_id or product.seller.email.split("@")[0].title()

        images = [
            ProductImageResponse(
                id=img.id,
                image_url=img.image_url,
                is_primary=img.is_primary,
                created_at=img.created_at,
            )
            for img in (product.images or [])
        ]

        return ProductResponse(
            id=product.id,
            seller_id=product.seller_id,
            seller_name=seller_name,
            seller_student_id=seller_student_id,
            seller_score=seller_score,
            seller_rating=seller_rating,
            seller_reviews_count=seller_reviews_count,
            title=product.title,
            description=product.description,
            category=product.category_name,
            condition=product.condition,
            product_type=product.product_type,
            price=float(product.price),
            rental_price_per_day=(
                float(product.rental_price_per_day)
                if product.rental_price_per_day is not None
                else None
            ),
            rental_duration=product.rental_duration,
            location=product.location,
            status=product.status,
            rating=rating,
            reviews_count=reviews_count,
            images=images,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    @classmethod
    async def create_product(
        cls,
        session: AsyncSession,
        current_user: User,
        data: ProductCreate,
    ) -> ProductResponse:
        # Check or lookup category
        cat_result = await session.execute(
            select(Category).where(
                or_(
                    Category.name.ilike(data.category),
                    Category.slug.ilike(data.category.lower().replace(" ", "-")),
                )
            )
        )
        category = cat_result.scalars().first()

        product = Product(
            seller_id=current_user.id,
            category_id=category.id if category else None,
            category_name=category.name if category else data.category,
            title=data.title.strip(),
            description=data.description.strip(),
            price=data.price,
            condition=data.condition,
            product_type=data.product_type,
            rental_price_per_day=data.rental_price_per_day,
            rental_duration=data.rental_duration,
            location=data.location,
            status=data.status,
        )
        session.add(product)
        await session.flush()

        # Add images
        for idx, img_url in enumerate(data.images):
            if img_url and img_url.strip():
                image = ProductImage(
                    product_id=product.id,
                    image_url=img_url.strip(),
                    is_primary=(idx == 0),
                )
                session.add(image)

        await session.commit()
        await session.refresh(product, ["images", "seller"])

        rep = await SellerService.get_seller_reputation(session, current_user.id)
        return cls._to_response(
            product,
            seller_score=rep.score,
            seller_rating=rep.average_rating,
            seller_reviews_count=rep.total_reviews,
        )

    @classmethod
    async def get_products(
        cls,
        session: AsyncSession,
        *,
        query: str | None = None,
        category: str | None = None,
        product_type: str | None = None,
        condition: str | None = None,
        status: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        seller_id: uuid.UUID | None = None,
        sort: str = "newest",
        page: int = 1,
        limit: int = 20,
    ) -> ProductListResponse:
        page = max(1, page)
        limit = max(1, min(100, limit))

        stmt = (
            select(Product)
            .options(selectinload(Product.images), selectinload(Product.seller), selectinload(Product.reviews))
        )

        if seller_id is not None:
            stmt = stmt.where(Product.seller_id == seller_id)

        if query:
            clean_q = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    Product.title.ilike(clean_q),
                    Product.description.ilike(clean_q),
                    Product.category_name.ilike(clean_q),
                )
            )

        if category and category != "All":
            stmt = stmt.where(Product.category_name.ilike(category))

        if product_type and product_type != "All Types":
            # Map shorthand or normalized
            stmt = stmt.where(Product.product_type == product_type)

        if condition and condition != "All":
            stmt = stmt.where(Product.condition.ilike(f"%{condition}%"))

        if status:
            stmt = stmt.where(Product.status.ilike(status))

        if min_price is not None:
            stmt = stmt.where(Product.price >= min_price)

        if max_price is not None:
            stmt = stmt.where(Product.price <= max_price)

        # Count total matching products
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await session.execute(count_stmt)
        total = total_result.scalar_one()

        # Sorting
        if sort == "price_asc":
            stmt = stmt.order_by(Product.price.asc(), Product.created_at.desc())
        elif sort == "price_desc":
            stmt = stmt.order_by(Product.price.desc(), Product.created_at.desc())
        elif sort == "top_rated":
            # Will sort by reviews if needed, or by created_at
            stmt = stmt.order_by(Product.created_at.desc())
        else:
            stmt = stmt.order_by(Product.created_at.desc())

        # Pagination
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        results = await session.execute(stmt)
        products = results.scalars().all()

        # Fetch seller reputations
        items: list[ProductResponse] = []
        for p in products:
            reviews = p.reviews or []
            rev_count = len(reviews)
            rating = (
                round(sum(r.rating for r in reviews) / rev_count, 1)
                if rev_count > 0
                else 0.0
            )

            rep = await SellerService.get_seller_reputation(session, p.seller_id)
            items.append(
                cls._to_response(
                    p,
                    seller_score=rep.score,
                    seller_rating=rep.average_rating,
                    seller_reviews_count=rep.total_reviews,
                    rating=rating,
                    reviews_count=rev_count,
                )
            )

        if sort == "top_rated":
            items.sort(key=lambda x: (x.rating, x.reviews_count), reverse=True)

        pages = math.ceil(total / limit) if total > 0 else 1

        return ProductListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=pages,
        )

    @classmethod
    async def get_product_by_id(
        cls, session: AsyncSession, product_id: uuid.UUID
    ) -> ProductResponse:
        stmt = (
            select(Product)
            .options(
                selectinload(Product.images),
                selectinload(Product.seller),
                selectinload(Product.reviews),
            )
            .where(Product.id == product_id)
        )
        result = await session.execute(stmt)
        product = result.scalars().first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found.")

        reviews = product.reviews or []
        rev_count = len(reviews)
        rating = (
            round(sum(r.rating for r in reviews) / rev_count, 1)
            if rev_count > 0
            else 0.0
        )

        rep = await SellerService.get_seller_reputation(session, product.seller_id)
        return cls._to_response(
            product,
            seller_score=rep.score,
            seller_rating=rep.average_rating,
            seller_reviews_count=rep.total_reviews,
            rating=rating,
            reviews_count=rev_count,
        )

    @classmethod
    async def update_product(
        cls,
        session: AsyncSession,
        current_user: User,
        product_id: uuid.UUID,
        data: ProductUpdate,
    ) -> ProductResponse:
        stmt = (
            select(Product)
            .options(selectinload(Product.images), selectinload(Product.seller), selectinload(Product.reviews))
            .where(Product.id == product_id)
        )
        result = await session.execute(stmt)
        product = result.scalars().first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found.")

        if product.seller_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to edit this product.",
            )

        if data.title is not None:
            product.title = data.title.strip()
        if data.description is not None:
            product.description = data.description.strip()
        if data.category is not None:
            cat_result = await session.execute(
                select(Category).where(Category.name.ilike(data.category))
            )
            cat = cat_result.scalars().first()
            product.category_id = cat.id if cat else None
            product.category_name = cat.name if cat else data.category
        if data.condition is not None:
            product.condition = data.condition
        if data.product_type is not None:
            product.product_type = data.product_type
        if data.price is not None:
            product.price = data.price
        if data.rental_price_per_day is not None:
            product.rental_price_per_day = data.rental_price_per_day
        if data.rental_duration is not None:
            product.rental_duration = data.rental_duration
        if data.location is not None:
            product.location = data.location
        if data.status is not None:
            product.status = data.status

        # If image URLs were supplied, replace product images
        if data.images is not None:
            # Delete existing images
            for img in list(product.images):
                await session.delete(img)
            # Add new images
            for idx, img_url in enumerate(data.images):
                if img_url and img_url.strip():
                    image = ProductImage(
                        product_id=product.id,
                        image_url=img_url.strip(),
                        is_primary=(idx == 0),
                    )
                    session.add(image)

        await session.commit()
        await session.refresh(product, ["images", "seller", "reviews"])

        rep = await SellerService.get_seller_reputation(session, current_user.id)
        reviews = product.reviews or []
        rev_count = len(reviews)
        rating = (
            round(sum(r.rating for r in reviews) / rev_count, 1)
            if rev_count > 0
            else 0.0
        )
        return cls._to_response(
            product,
            seller_score=rep.score,
            seller_rating=rep.average_rating,
            seller_reviews_count=rep.total_reviews,
            rating=rating,
            reviews_count=rev_count,
        )

    @classmethod
    async def delete_product(
        cls,
        session: AsyncSession,
        current_user: User,
        product_id: uuid.UUID,
    ) -> None:
        product = await session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found.")

        if product.seller_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to delete this product.",
            )

        await session.delete(product)
        await session.commit()

    @classmethod
    async def get_categories_with_counts(
        cls, session: AsyncSession
    ) -> list[CategoryResponse]:
        # Preload or fetch default categories
        cat_result = await session.execute(select(Category).order_by(Category.name))
        categories = cat_result.scalars().all()

        counts_stmt = select(
            Product.category_name,
            func.count(Product.id).label("cnt"),
        ).where(Product.status.in_(["available", "Active"])).group_by(Product.category_name)
        counts_result = await session.execute(counts_stmt)
        count_map = {row.category_name.lower(): row.cnt for row in counts_result}

        # If categories table is empty (e.g. during fresh test run), provide defaults
        if not categories:
            defaults = [
                ("Academic Books", "academic-books", "BookOpen"),
                ("Calculators", "calculators", "Calculator"),
                ("Laptops & Electronics", "laptops-electronics", "Laptop"),
                ("Furniture", "furniture", "Sofa"),
                ("Hostel Items", "hostel-items", "ShoppingBag"),
                ("Lab Equipment", "lab-equipment", "BarChart3"),
                ("Course Materials", "course-materials", "BookOpen"),
                ("Other", "other", "Tag"),
            ]
            for name, slug, icon in defaults:
                cat = Category(name=name, slug=slug, icon=icon)
                session.add(cat)
            await session.commit()
            cat_result = await session.execute(select(Category).order_by(Category.name))
            categories = cat_result.scalars().all()

        result_list = []
        for c in categories:
            cnt = count_map.get(c.name.lower(), 0)
            result_list.append(
                CategoryResponse(
                    id=c.id,
                    name=c.name,
                    slug=c.slug,
                    icon=c.icon,
                    count=cnt,
                )
            )

        return result_list
