import uuid
from pydantic import BaseModel, ConfigDict


class SellerReputationResponse(BaseModel):
    seller_id: uuid.UUID
    seller_name: str
    student_id: str | None = None
    score: int
    average_rating: float
    total_reviews: int
    total_products: int
    active_listings: int
    rented_out: int

    model_config = ConfigDict(from_attributes=True)
