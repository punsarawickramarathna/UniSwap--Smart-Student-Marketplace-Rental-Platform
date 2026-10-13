import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5, description="Star rating between 1 and 5")
    comment: str = Field(min_length=1, max_length=2000, description="Review feedback")


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, min_length=1, max_length=2000)


class ReviewResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_title: str
    user_id: uuid.UUID
    user_name: str
    user_student_id: str | None = None
    rating: int
    comment: str
    is_verified_purchase: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReviewListResponse(BaseModel):
    items: list[ReviewResponse]
    total: int
    average_rating: float
