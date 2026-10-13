import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.schemas.seller import SellerReputationResponse
from app.services.seller import SellerService

router = APIRouter(prefix="/api/sellers", tags=["sellers"])


@router.get("/{seller_id}/reputation", response_model=SellerReputationResponse)
async def get_seller_reputation(
    seller_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SellerReputationResponse:
    return await SellerService.get_seller_reputation(session, seller_id)
