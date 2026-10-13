import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProductImageResponse(BaseModel):
    id: uuid.UUID
    image_url: str
    is_primary: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=5000)
    category: str = Field(min_length=1, max_length=100)
    condition: str = Field(pattern=r"^(New|Like New|Used - Good|Good|Fair)$")
    product_type: str = Field(pattern=r"^(For Sale|For Rent|Exchange|Buy|Rent)$")
    price: float = Field(default=0.0, ge=0)
    rental_price_per_day: float | None = Field(default=None, ge=0)
    rental_duration: str | None = None
    location: str | None = None
    status: str = Field(default="available", pattern=r"^(available|rented|sold|inactive|Active|Sold|Rented)$")
    images: list[str] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    category: str | None = None
    condition: str | None = Field(default=None, pattern=r"^(New|Like New|Used - Good|Good|Fair)$")
    product_type: str | None = Field(default=None, pattern=r"^(For Sale|For Rent|Exchange|Buy|Rent)$")
    price: float | None = Field(default=None, ge=0)
    rental_price_per_day: float | None = Field(default=None, ge=0)
    rental_duration: str | None = None
    location: str | None = None
    status: str | None = Field(default=None, pattern=r"^(available|rented|sold|inactive|Active|Sold|Rented)$")
    images: list[str] | None = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    seller_name: str
    seller_student_id: str | None = None
    seller_score: int = 100
    seller_rating: float = 5.0
    seller_reviews_count: int = 0
    title: str
    description: str
    category: str
    condition: str
    product_type: str
    price: float
    rental_price_per_day: float | None = None
    rental_duration: str | None = None
    location: str | None = None
    status: str
    rating: float = 0.0
    reviews_count: int = 0
    images: list[ProductImageResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int
    limit: int
    pages: int
