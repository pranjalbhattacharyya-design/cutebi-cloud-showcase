from sqlalchemy.orm import Session
from backend import database, models
import os
import json

db = database.SessionLocal()

print("=== REPORTS ===")
reports = db.query(models.Report).filter(models.Report.is_deleted == False).all()
for r in reports:
    datasets_meta = r.data.get('datasetsMeta', []) if r.data else []
    ds_ids = [d.get('id') for d in datasets_meta]
    print(f"  [{r.id}] '{r.name}' -> datasets: {ds_ids}")

print("\n=== DATASETS (Catalog) ===")
datasets = db.query(models.Dataset).all()
for d in datasets:
    print(f"  [{d.id}] '{d.name}' -> file: {d.file_path}")

print("\n=== FILES ON DISK ===")
data_dir = "backend/data"
if os.path.exists(data_dir):
    for f in os.listdir(data_dir):
        fp = os.path.join(data_dir, f)
        if os.path.isfile(fp):
            size_kb = os.path.getsize(fp) // 1024
            print(f"  {f} ({size_kb} KB)")

db.close()
