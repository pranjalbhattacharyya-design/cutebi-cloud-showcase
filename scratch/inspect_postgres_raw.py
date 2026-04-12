import os
import sys
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    sys.exit(1)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

def check_table(table_name):
    try:
        with engine.connect() as conn:
            # Check if table exists
            exists = conn.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')")).scalar()
            if not exists:
                print(f"Table {table_name}: DOES NOT EXIST")
                return
            
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
            print(f"Table {table_name}: {count} rows")
            
            if count > 0:
                rows = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 3")).mappings().all()
                for r in rows:
                    # Print IDs and basic info
                    info = {k: v for k, v in r.items() if k in ['id', 'name', 'workspace_id', 'is_deleted']}
                    print(f"  - {info}")
    except Exception as e:
        print(f"Error checking {table_name}: {e}")

print("Checking Database Tables...")
tables = ['workspaces', 'folders', 'reports', 'datasets', 'workspace_datasets', 'published_models']
for t in tables:
    check_table(t)
