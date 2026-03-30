import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Cloud Identity: Postgres (Supabase/Neon)
# ---------------------------------------------------------------------------

# Use DATABASE_URL from environment
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    # Fallback to local memory only if no cloud DB is provided, 
    # but the primary expectation for Project 2 is Cloud Postgres.
    SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

# SQLAlchemy requires 'postgresql://' but many providers (like Heroku/Supabase) 
# provide 'postgres://'. Handle the rewrite here.
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
