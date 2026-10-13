"""FastAPI routers."""

from app.routes.auth import router as auth_router
from app.routes.categories import router as categories_router
from app.routes.products import router as products_router
from app.routes.reviews import router as reviews_router
from app.routes.sellers import router as sellers_router

__all__ = [
    "auth_router",
    "categories_router",
    "products_router",
    "reviews_router",
    "sellers_router",
]
