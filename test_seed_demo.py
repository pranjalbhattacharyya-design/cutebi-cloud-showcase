import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

# Ensure stdout can handle emojis
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Mock VERCEL environment
os.environ["VERCEL"] = "1"

from backend.main import app, database, models
from sqlalchemy.orm import Session

# Run startup events manually or simulate them
print("Simulating app startup...")
db = database.SessionLocal()
try:
    # Trigger seeding directly
    from backend.main import seed_demo_data
    seed_demo_data(db)
    
    # Check results
    workspaces = db.query(models.Workspace).all()
    print(f"Workspaces: {[ws.name for ws in workspaces]}")
    
    reports = db.query(models.Report).all()
    print(f"Reports: {[r.name for r in reports]}")
    
    datasets = db.query(models.WorkspaceDataset).all()
    print(f"Datasets: {[ds.name for ds in datasets]}")
    
    if len(workspaces) > 0 and len(reports) > 0:
        print("SEEDING SUCCESSFUL!")
    else:
        print("SEEDING FAILED!")
finally:
    db.close()
