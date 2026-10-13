import asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from app.config import get_settings
from app.database import create_database_engine, create_session_factory, Base
from app.models.user import User
from app.models.order import Order
from app.models.payment import Payment
from app.models.delivery import Delivery
from app.services.password import PasswordService

async def main():
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    
    # 1. Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    session_factory = create_session_factory(engine)
    hasher = PasswordService()
    
    test_users = [
        {
            "email": "student@horizoncampus.edu.lk",
            "student_id": "ITBIN12345678",
            "password": "Password123!",
        },
        {
            "email": "student@campus.edu",
            "student_id": "ITBIN87654321",
            "password": "Password123!",
        }
    ]
    
    async with session_factory() as session:
        for u in test_users:
            stmt = select(User).where(User.email == u["email"])
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if not existing:
                user = User(
                    email=u["email"],
                    student_id=u["student_id"],
                    password_hash=hasher.hash(u["password"]),
                    email_verified_at=datetime.now(timezone.utc),
                    is_active=True,
                )
                session.add(user)
                print(f"Created user: {u['email']} (Password: {u['password']})")
            else:
                print(f"User {u['email']} already exists.")
        await session.commit()
        
    await engine.dispose()
    print("Done seeding test student users!")

if __name__ == "__main__":
    asyncio.run(main())
