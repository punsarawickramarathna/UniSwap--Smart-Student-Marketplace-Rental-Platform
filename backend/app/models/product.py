import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import utc_now


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price >= 0", name="products_price_check"),
        CheckConstraint(
            "rental_price_per_day is null or rental_price_per_day >= 0",
            name="products_rental_price_check",
        ),
        CheckConstraint(
            "condition in ('New', 'Like New', 'Used - Good', 'Good', 'Fair')",
            name="products_condition_check",
        ),
        CheckConstraint(
            "product_type in ('For Sale', 'For Rent', 'Exchange', 'Buy', 'Rent')",
            name="products_product_type_check",
        ),
        CheckConstraint(
            "status in ('available', 'rented', 'sold', 'inactive', 'Active', 'Sold', 'Rented')",
            name="products_status_check",
        ),
        Index("products_seller_id_idx", "seller_id"),
        Index("products_category_name_idx", "category_name"),
        Index("products_product_type_idx", "product_type"),
        Index("products_status_idx", "status"),
        Index("products_created_at_idx", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    category_name: Mapped[str] = mapped_column(Text, nullable=False, default="Other")
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    condition: Mapped[str] = mapped_column(Text, nullable=False, default="Used - Good")
    product_type: Mapped[str] = mapped_column(Text, nullable=False, default="For Sale")
    rental_price_per_day: Mapped[float | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    rental_duration: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="available")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    seller = relationship("User", lazy="joined")
    category_rel = relationship("Category", back_populates="products")
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.created_at",
        lazy="selectin",
    )
    reviews = relationship(
        "Review",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="Review.created_at.desc()",
        lazy="selectin",
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        Index("product_images_product_id_idx", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    product = relationship("Product", back_populates="images")
