from sqlalchemy.orm import Session
from backend import database, models
import os

db = database.SessionLocal()

# --- IDs to KEEP (new filename-based datasets linked to "First Report") ---
KEEP_DS_IDS = {'Fact Sale', 'Dim Product', 'Dim Dealer', 'Dim Calender'}
KEEP_REPORT_ID = 'report_1774794657670'  # "First Report"

print("=== CLEANUP: Removing stale UUID-based dataset catalog rows ===\n")

# Delete stale UUID catalog entries
all_datasets = db.query(models.Dataset).all()
deleted_ds = []
for ds in all_datasets:
    if ds.id not in KEEP_DS_IDS:
        print(f"  Deleting catalog row: [{ds.id}] '{ds.name}' -> {ds.file_path}")
        # Also delete the physical file if it still exists
        if ds.file_path and os.path.exists(ds.file_path):
            os.remove(ds.file_path)
            print(f"    Deleted file: {ds.file_path}")
        db.delete(ds)
        deleted_ds.append(ds.id)

print(f"\n  Removed {len(deleted_ds)} stale catalog rows: {deleted_ds}")

# Soft-delete all reports EXCEPT "First Report"
all_reports = db.query(models.Report).all()
deleted_reports = []
for r in all_reports:
    if r.id != KEEP_REPORT_ID:
        print(f"  Soft-deleting report: [{r.id}] '{r.name}'")
        r.is_deleted = True
        deleted_reports.append(r.name)

print(f"\n  Soft-deleted {len(deleted_reports)} report(s): {deleted_reports}")

db.commit()
db.close()

print("\n=== POST-CLEANUP STATE ===")
db2 = database.SessionLocal()
print("\nKept Reports:")
for r in db2.query(models.Report).filter(models.Report.is_deleted == False).all():
    print(f"  [{r.id}] '{r.name}'")
print("\nKept Datasets:")
for d in db2.query(models.Dataset).all():
    print(f"  [{d.id}] '{d.name}' -> {d.file_path}")
print("\nFiles on disk:")
data_dir = "backend/data"
for f in sorted(os.listdir(data_dir)):
    fp = os.path.join(data_dir, f)
    if os.path.isfile(fp):
        print(f"  {f} ({os.path.getsize(fp)//1024} KB)")
db2.close()
print("\nCleanup complete.")
