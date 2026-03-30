from sqlalchemy.orm import Session
from backend import database, models
import os
db = database.SessionLocal()
report = db.query(models.Report).filter(models.Report.name == 'Last Report').first()
if report:
    active_ids = [ds['id'] for ds in report.data.get('datasetsMeta', [])]
    # Delete unused Datasets
    unused_ds = db.query(models.Dataset).filter(models.Dataset.id.notin_(active_ids)).all()
    for ds in unused_ds:
        if os.path.exists(ds.file_path): os.remove(ds.file_path)
        db.delete(ds)
    
    # Delete unused WorkspaceDatasets
    db.query(models.WorkspaceDataset).filter(models.WorkspaceDataset.id.notin_(active_ids)).delete(synchronize_session=False)
    db.commit()
    print("Cleanup complete.")
else:
    print("Report 'Last Report' not found")
