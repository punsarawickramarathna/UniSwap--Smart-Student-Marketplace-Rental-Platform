from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import session_from_factory


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async for session in session_from_factory(request.app.state.session_factory):
        yield session
