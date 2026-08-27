import asyncio
import os
from sqlalchemy import text
from app.config import get_settings
from app.database import create_database_engine


async def run_migration():
    settings = get_settings()
    db_url = settings.database_url
    print(f"Connecting to database...")
    engine = create_database_engine(db_url)
    
    # Path to the migration file
    migration_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../supabase/migrations/20260826233000_create_payments_and_deliveries.sql")
    )
    
    if not os.path.exists(migration_path):
        print(f"Migration file not found at: {migration_path}")
        return

    print(f"Reading migration file: {migration_path}")
    with open(migration_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # Split statements by semicolon, ignoring comments and empty lines
    statements = []
    current_statement = []
    for line in sql_content.splitlines():
        if line.strip().startswith("--") or not line.strip():
            continue
        current_statement.append(line)
        if line.strip().endswith(";"):
            statements.append("\n".join(current_statement))
            current_statement = []

    async with engine.begin() as conn:
        print("Executing migration statements on the database...")
        for stmt in statements:
            # Clean statement and execute
            clean_stmt = stmt.strip()
            if clean_stmt:
                print(f"Running:\n{clean_stmt[:120]}...\n")
                try:
                    await conn.execute(text(clean_stmt))
                except Exception as e:
                    # Ignore table already exists errors to allow safe reruns
                    if "already exists" in str(e):
                        print("Table already exists, skipping...")
                    else:
                        print(f"Error executing statement: {e}")
                        raise e
                        
    print("Database migration completed successfully!")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_migration())
