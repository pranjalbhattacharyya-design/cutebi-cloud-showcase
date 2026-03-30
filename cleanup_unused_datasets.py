import os
import sys

# Add the project root to the python path so we can import backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import SessionLocal
from backend import models

def cleanup():
    db = SessionLocal()
    try:
        # Find 'Last Report'
        report = db.query(models.Report).filter(models.Report.name == 'Last Report').first()
        
        if not report:
            print("No report named 'Last Report' found. Aborting cleanup to be safe.")
            return

        print(f"Found 'Last Report' (ID: {report.id}). Extracting active datasets...")
        
        # Get active dataset IDs from the report's JSON data
        report_data = report.data or {}
        datasets_meta = report_data.get('datasetsMeta', [])
        active_ids = [ds.get('id') for ds in datasets_meta if ds.get('id')]
        
        if not active_ids:
            print("WARNING: 'Last Report' has no active dataset IDs. Leaving this empty might delete ALL datasets.")
            response = input("Do you want to delete ALL datasets? (y/N): ")
            if response.lower() != 'y':
                print("Aborting.")
                return
                
        print(f"Active Dataset IDs to KEEP: {active_ids}")

        # Find all Datasets NOT in active_ids
        unused_datasets = db.query(models.Dataset).filter(models.Dataset.id.notin_(active_ids)).all()
        print(f"Found {len(unused_datasets)} unused Datasets to delete.")
        
        for ds in unused_datasets:
            file_path = ds.file_path
            print(f"  Deleting dataset row: {ds.id} (Table: {ds.table_name})")
            
            # Delete physical file
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"    -> Deleted physical file: {file_path}")
                except Exception as e:
                    print(f"    -> WARNING: Could not delete physical file {file_path}: {e}")
            else:
                print(f"    -> Physical file not found at {file_path}")
                
            db.delete(ds)
            
        # Delete unused WorkspaceDatasets as well
        unused_ws_datasets = db.query(models.WorkspaceDataset).filter(models.WorkspaceDataset.id.notin_(active_ids)).all()
        print(f"Found {len(unused_ws_datasets)} unused WorkspaceDatasets to delete.")
        for ds in unused_ws_datasets:
            print(f"  Deleting WorkspaceDataset row: {ds.id}")
            db.delete(ds)
            
        db.commit()
        print("Cleanup completed successfully.")
        
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    # Force auto-accept for script execution when testing active_ids logic isn't empty
    cleanup()
