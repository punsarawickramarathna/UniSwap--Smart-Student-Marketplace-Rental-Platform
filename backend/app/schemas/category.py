import uuid
from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    icon: str | None = None
    count: int = 0

    model_config = ConfigDict(from_attributes=True)
