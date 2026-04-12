import os
import sys

# Add backend to path so we can import models and database
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    sys.exit(1)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    ws_count = db.query(models.Workspace).count()
    ds_count = db.query(models.Dataset).count()
    ws_ds_count = db.query(models.WorkspaceDataset).count()
    pm_count = db.query(models.PublishedModel).count()
    report_count = db.query(models.Report).count()

    print(f"Workspaces: {ws_count}")
    print(f"Datasets (Global): {ds_count}")
    print(f"Workspace Datasets: {ws_ds_count}")
    print(f"Published Models: {pm_count}")
    print(f"Reports: {report_count}")

    print("\nRecent Workspaces:")
    for ws in db.query(models.Workspace).limit(5).all():
        print(f" - {ws.id}: {ws.name}")

    print("\nRecent Workspace Datasets:")
    for wds in db.query(models.WorkspaceDataset).limit(5).all():
        print(f" - {wds.id}: {wds.name} (WS: {wds.workspace_id})")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
