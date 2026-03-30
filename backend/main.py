from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os
import shutil
import uuid
import threading
import duckdb

from . import models, database, engine
from supabase import create_client, Client
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Pydantic Schemas for Strict Parsing ---
class WorkspaceCreate(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""

class FolderCreate(BaseModel):
    id: str
    name: str
    workspace_id: str
    parent_id: Optional[str] = None

# --- Cloud Storage Initialization ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
STORAGE_BUCKET = "cutebi-datasets"

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"[Storage] Supabase client initialized for bucket '{STORAGE_BUCKET}'")
    except Exception as e:
        print(f"[Storage] Failed to initialize Supabase client: {e}")

# Create the database tables - handles both Postgres and SQLite memory
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"[DB] Synchronization warning: {e}")

# ---------------------------------------------------------------------------
# Persistent DuckDB Engine (Option A)
# One warm connection shared across all requests.
# Views are registered once at startup and refreshed only after uploads.
# A reentrant lock guards the connection against concurrent writes.
# ---------------------------------------------------------------------------

_db_lock = threading.RLock()
_db_conn: duckdb.DuckDBPyConnection | None = None
_registered_views: set[str] = set()

def _get_conn() -> duckdb.DuckDBPyConnection:
    """Return (or lazily create) the persistent DuckDB connection."""
    global _db_conn
    if _db_conn is None:
        _db_conn = duckdb.connect(database=':memory:', read_only=False)
        try:
            _db_conn.execute("INSTALL spatial; LOAD spatial;")
        except Exception as e:
            print(f"[Engine] Spatial extension unavailable: {e}")
        _refresh_views(_db_conn)
    return _db_conn

def _refresh_views(conn: duckdb.DuckDBPyConnection | None = None):
    """Register every cloud-hosted parquet dataset from the database as a DuckDB view.
    Safe to call after an upload without restarting the server."""
    global _registered_views
    if conn is None:
        conn = _get_conn()

    registered = set()

    # 1. Register Cloud-Hosted Datasets from Database
    # This is the ONLY source of truth in Cloud mode.
    db = database.SessionLocal()
    try:
        cloud_datasets = db.query(models.Dataset).all()
        for ds in cloud_datasets:
            if ds.file_path.startswith("http"):
                try:
                    # Clean the view name
                    view_name = ds.id.strip().replace('"', '')
                    conn.execute(f'CREATE OR REPLACE VIEW "{view_name}" AS SELECT * FROM read_parquet(\'{ds.file_path}\')')
                    registered.add(view_name)
                    print(f"[Engine] Registered cloud view '{view_name}' from {ds.file_path[:50]}...")
                except Exception as e:
                    print(f"[Engine] Could not register cloud view '{ds.id}': {e}")
    finally:
        db.close()

    _registered_views = registered
    print(f"[Engine] Cloud Registry refreshed — {len(registered)} active views.")



app = FastAPI(title="CuteBI Cloud API")

@app.middleware("http")
async def add_engine_identity(request: Request, call_next):
    response = await call_next(request)
    engine_type = "postgres" if "postgresql" in str(database.engine.url) else "sqlite-transient"
    response.headers["X-Engine-Identity"] = engine_type
    return response

@app.on_event("startup")
async def startup_event():
    """Eagerly initialize the persistent DuckDB connection at server startup."""
    with _db_lock:
        conn = _get_conn()
        # In Demo Mode, register the bundled mock_data.csv if available
        if os.getenv("VERCEL") and os.path.exists("mock_data.csv"):
            try:
                conn.execute(f"CREATE OR REPLACE VIEW SalesData AS SELECT * FROM read_csv_auto('mock_data.csv')")
                _registered_views.add("SalesData")
                print("[Demo Mode] Registered 'SalesData' from mock_data.csv")
            except Exception as e:
                print(f"[Demo Mode] Failed to register SalesData: {e}")

    # Seed initialization for In-Memory/Cloud Database
    # Only seed if the database is EXPLICITLY empty to prevent overwriting cloud data.
    db = database.SessionLocal()
    try:
        # Check if we already have workspaces in Postgres
        has_data = db.query(models.Workspace).first() is not None
        if not has_data:
             print("[Engine] Cloud Database is empty. Seeding demo content...")
             seed_demo_data(db)
        else:
             print("[Engine] Cloud Database contains existing data. Skipping seed.")
    except Exception as e:
        print(f"[Engine] Seeding check failed: {e}")
    finally:
        db.close()

    print(f"[Engine] Startup complete. Active views: {sorted(_registered_views)}")


def seed_demo_data(db: Session):
    """Populate the in-memory database with demo workspaces, reports and datasets."""
    # Check if we already seeded (though in-memory it should be empty each start)
    if db.query(models.Workspace).first():
        return

    print("[Demo Mode] Seeding initial data...")
    
    # 1. Workspace
    demo_ws = models.Workspace(
        id="demo-workspace",
        name="🚀 Demo Workspace",
        description="A pre-configured workspace for exploration.",
        is_deleted=False
    )
    db.add(demo_ws)
    
    # 2. Folder
    demo_folder = models.Folder(
        id="demo-folder",
        name="Sample Reports",
        workspace_id="demo-workspace",
        parent_id=None,
        is_deleted=False
    )
    db.add(demo_folder)
    
    # 3. Dataset Entry
    demo_ds = models.WorkspaceDataset(
        id="SalesData",
        name="Sales Performance",
        workspace_id="demo-workspace",
        folder_id="demo-folder",
        table_name="SalesData",
        headers=["Product", "Category", "Revenue", "Units", "Date"],
        description="Daily sales record across categories.",
        is_deleted=False
    )
    db.add(demo_ds)

    # 4. Mock Dataset for Library
    catalog_ds = models.Dataset(
        id="SalesData",
        name="Sales Performance",
        original_file_name="mock_data.csv",
        file_path="mock_data.csv",
        table_name="SalesData",
        headers=["Product", "Category", "Revenue", "Units", "Date"]
    )
    db.add(catalog_ds)
    
    # 5. Sample Report
    demo_report = models.Report(
        id="demo-report-1",
        name="Quarterly Revenue Growth",
        workspace_id="demo-workspace",
        folder_id="demo-folder",
        data={
            "id": "demo-report-1",
            "name": "Quarterly Revenue Growth",
            "workspaceId": "demo-workspace",
            "folderId": "demo-folder",
            "dashboards": [
                {
                    "id": "dash-1",
                    "name": "Overview",
                    "layout": [
                        {"i": "chart-1", "x": 0, "y": 0, "w": 6, "h": 4},
                        {"i": "chart-2", "x": 6, "y": 0, "w": 6, "h": 4}
                    ],
                    "charts": [
                        {
                            "id": "chart-1",
                            "name": "Revenue by Product",
                            "type": "bar",
                            "config": {
                                "xAxis": "Product",
                                "yAxis": "Revenue",
                                "dataset": "SalesData"
                            }
                        },
                        {
                            "id": "chart-2",
                            "name": "Units by Category",
                            "type": "pie",
                            "config": {
                                "dimensions": "Category",
                                "measures": "Units",
                                "dataset": "SalesData"
                            }
                        }
                    ]
                }
            ]
        },
        is_deleted=False
    )
    db.add(demo_report)
    
    db.commit()
    print("[Demo Mode] Seeding complete.")

# Allow CORS for React frontend (on localhost:5173 or similar)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- System Status ---

@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "version": "2.0-cloud-showcase",
        "engine": "DuckDB/Serverless",
        "deployment": "Vercel/Cloud",
        "data_dir_exists": os.path.exists("backend/data")
    }

# --- Workspaces ---

@app.get("/api/workspaces")
def read_workspaces(db: Session = Depends(database.get_db)):
    return db.query(models.Workspace).filter(models.Workspace.is_deleted == False).all()


@app.post("/api/workspaces")
def create_workspace(workspace: WorkspaceCreate, db: Session = Depends(database.get_db)):
    # Duplicate check
    existing = db.query(models.Workspace).filter(models.Workspace.name == workspace.name, models.Workspace.is_deleted == False).first()
    if existing:
        raise HTTPException(status_code=400, detail="Workspace name already exists")
    
    print(f"[API] Creating Workspace: {workspace.name} ({workspace.id})")
    db_workspace = models.Workspace(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        is_deleted=False
    )
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    return db_workspace

@app.delete("/api/workspaces/{ws_id}")
def delete_workspace(ws_id: str, db: Session = Depends(database.get_db)):
    ws = db.query(models.Workspace).filter(models.Workspace.id == ws_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Soft delete workspace
    ws.is_deleted = True
    
    # Soft delete all folders in this workspace
    db.query(models.Folder).filter(models.Folder.workspace_id == ws_id).update({"is_deleted": True})
    
    # Soft delete all reports in this workspace
    db.query(models.Report).filter(models.Report.workspace_id == ws_id).update({"is_deleted": True})
    print(f"Soft deleting workspace {ws_id} and children...")
    db.commit()
    print(f"Committed soft-delete for workspace {ws_id}")
    return {"status": "ok"}


# --- Folders ---

@app.get("/api/folders")
def read_folders(db: Session = Depends(database.get_db)):
    return db.query(models.Folder).filter(models.Folder.is_deleted == False).all()


@app.post("/api/folders")
def create_folder(folder: FolderCreate, db: Session = Depends(database.get_db)):
    # Duplicate check
    existing = db.query(models.Folder).filter(
        models.Folder.name == folder.name, 
        models.Folder.workspace_id == folder.workspace_id,
        models.Folder.parent_id == folder.parent_id,
        models.Folder.is_deleted == False
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Folder name already exists in this location")

    print(f"[API] Creating Folder: {folder.name} ({folder.id})")
    db_folder = models.Folder(
        id=folder.id,
        name=folder.name,
        workspace_id=folder.workspace_id,
        parent_id=folder.parent_id,
        is_deleted=False
    )
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    return db_folder

def _soft_delete_folder_recursive(f_id: str, db: Session):
    # Find this folder
    folder = db.query(models.Folder).filter(models.Folder.id == f_id).first()
    if not folder:
        return
    
    # Mark this folder as deleted
    folder.is_deleted = True
    
    # Mark all reports in this folder as deleted
    db.query(models.Report).filter(models.Report.folder_id == f_id).update({"is_deleted": True})
    
    # Find and recursively delete subfolders
    subfolders = db.query(models.Folder).filter(models.Folder.parent_id == f_id).all()
    for sub in subfolders:
        _soft_delete_folder_recursive(sub.id, db)

@app.delete("/api/folders/{f_id}")
def delete_folder(f_id: str, db: Session = Depends(database.get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == f_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    print(f"Soft deleting folder {f_id} and children...")
    _soft_delete_folder_recursive(f_id, db)
    db.commit()
    print(f"Committed soft-delete for folder {f_id}")
    return {"status": "ok"}


# --- Datasets ---

@app.get("/api/workspace-datasets")
def read_datasets(workspace_id: str = None, db: Session = Depends(database.get_db)):
    query = db.query(models.WorkspaceDataset).filter(models.WorkspaceDataset.is_deleted == False)
    if workspace_id:
        query = query.filter(models.WorkspaceDataset.workspace_id == workspace_id)
    workspace_datasets = query.all()

    # Enrich with sample_data from the Dataset catalog so the frontend
    # can generate a proper semantic model without requiring a re-upload.
    result = []
    for ws_ds in workspace_datasets:
        row = {
            "id": ws_ds.id,
            "name": ws_ds.name,
            "workspace_id": ws_ds.workspace_id,
            "folder_id": ws_ds.folder_id,
            "table_name": ws_ds.table_name,
            "headers": ws_ds.headers or [],
            "description": ws_ds.description or "",
        }
        # Pull live sample_data + original_file_name + public_url from the Dataset catalog
        catalog_entry = db.query(models.Dataset).filter(models.Dataset.id == ws_ds.id).first()
        if catalog_entry:
            row["original_file_name"] = catalog_entry.original_file_name
            row["headers"] = catalog_entry.headers or ws_ds.headers or []
            # Calculate Public URL based on known storage pattern
            from .main import SUPABASE_URL, STORAGE_BUCKET
            row["public_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{ws_ds.id}.parquet"
            
            # Fetch up to 5 live sample rows from the persistent engine
            try:
                with _db_lock:
                    conn = _get_conn()
                    sample_cursor = conn.execute(
                        f'SELECT * FROM "{catalog_entry.table_name}" LIMIT 5'
                    )
                    cols = [c[0] for c in sample_cursor.description]
                    rows = sample_cursor.fetchall()
                    row["sample_data"] = [dict(zip(cols, r)) for r in rows]
            except Exception as e:
                print(f"[WorkspaceDatasets] Could not fetch sample for {ws_ds.id}: {e}")
                row["sample_data"] = []
        else:
            row["original_file_name"] = ws_ds.name
            row["public_url"] = None
            row["sample_data"] = []
        result.append(row)

    return result

@app.post("/api/workspace-datasets")
def create_dataset(dataset: dict, db: Session = Depends(database.get_db)):
    ds_id = dataset.get("id")
    print(f"Registering dataset: {dataset.get('name')} in workspace {dataset.get('workspace_id')}")
    # Upsert: update if already registered, insert otherwise
    db_ds = db.query(models.WorkspaceDataset).filter(models.WorkspaceDataset.id == ds_id).first()
    if db_ds:
        db_ds.name = dataset.get("name", db_ds.name)
        db_ds.workspace_id = dataset.get("workspace_id", db_ds.workspace_id)
        db_ds.folder_id = dataset.get("folder_id", db_ds.folder_id)
        db_ds.table_name = dataset.get("table_name", db_ds.table_name)
        db_ds.headers = dataset.get("headers", db_ds.headers)
        db_ds.description = dataset.get("description", db_ds.description)
        db_ds.is_deleted = False
    else:
        db_ds = models.WorkspaceDataset(
            id=ds_id,
            name=dataset.get("name"),
            workspace_id=dataset.get("workspace_id"),
            folder_id=dataset.get("folder_id"),
            table_name=dataset.get("table_name"),
            headers=dataset.get("headers"),
            description=dataset.get("description"),
            is_deleted=False
        )
        db.add(db_ds)
    db.commit()
    db.refresh(db_ds)
    return db_ds

@app.delete("/api/workspace-datasets/{ds_id}")
def delete_workspace_dataset(ds_id: str, db: Session = Depends(database.get_db)):
    ds = db.query(models.WorkspaceDataset).filter(models.WorkspaceDataset.id == ds_id).first()
    if not ds:
         raise HTTPException(status_code=404, detail="Dataset not found")
    ds.is_deleted = True
    db.commit()
    return {"status": "ok"}


# --- Reports ---

@app.get("/api/reports")
def read_reports(id: str = None, db: Session = Depends(database.get_db)):
    query = db.query(models.Report).filter(models.Report.is_deleted == False)
    if id:
        query = query.filter(models.Report.id == id)
    return query.all()


@app.post("/api/reports")
def create_report(report: dict, db: Session = Depends(database.get_db)):
    # Check if exists (for update)
    db_report = db.query(models.Report).filter(models.Report.id == report.get("id")).first()
    if db_report:
        db_report.name = report.get("name")
        db_report.data = report # Store full report object
        db_report.workspace_id = report.get("workspaceId")
        db_report.folder_id = report.get("folderId")
        db_report.is_deleted = False # Ensure it's not deleted if it was previously soft-deleted
    else:
        db_report = models.Report(
            id=report.get("id"),
            name=report.get("name"),
            workspace_id=report.get("workspaceId"),
            folder_id=report.get("folderId"),
            data=report, # Store full report object
            is_deleted=False
        )
        db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@app.delete("/api/reports/{r_id}")
def delete_report(r_id: str, db: Session = Depends(database.get_db)):
    report = db.query(models.Report).filter(models.Report.id == r_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.is_deleted = True
    db.commit()
    return {"status": "ok"}


# --- Published Models ---

@app.get("/api/published_models")
def read_published_models(workspace_id: str = None, db: Session = Depends(database.get_db)):
    query = db.query(models.PublishedModel)
    if workspace_id:
        query = query.filter(models.PublishedModel.workspace_id == workspace_id)
    return query.all()

@app.post("/api/published_models")
def create_published_model(model: dict, db: Session = Depends(database.get_db)):
    db_model = models.PublishedModel(
        id=model.get("id"),
        name=model.get("name"),
        workspace_id=model.get("workspace_id"),
        data=model # Store full model payload
    )
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model

@app.get("/api/library")
def read_library(db: Session = Depends(database.get_db)):
    # Returns all 'Platinum' datasets available in the backend
    return db.query(models.Dataset).order_by(models.Dataset.timestamp.desc()).all()

# --- Data Engine ---


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    # Use exact filename stem as the unique identifier and table name
    # e.g., 'Fact Sales.csv' -> ds_id = 'Fact Sales'
    ds_id = os.path.splitext(file.filename)[0].strip()
    extension = file.filename.split(".")[-1].lower()
    # On Vercel, we must use /tmp for transient storage
    storage_root = "/tmp" if os.getenv("VERCEL") else "backend/data"
    os.makedirs(storage_root, exist_ok=True)
    
    temp_path = os.path.join(storage_root, f"{ds_id}_temp.{extension}")
    final_path = os.path.join(storage_root, f"{ds_id}.parquet")
    
    # 1. Save temp file
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 2. Platinum Transformation: XLSX/CSV -> Parquet
        # Excel: openpyxl reads rows → write temp CSV → DuckDB converts CSV→Parquet
        #        (avoids pandas/pyarrow which are too large for Vercel's 50MB limit)
        # CSV:   DuckDB native read_csv_auto → Parquet directly
        import duckdb as _duckdb_tmp
        conv_conn = _duckdb_tmp.connect(':memory:')

        if extension in ['xlsx', 'xls']:
            try:
                import openpyxl
                import csv
                print(f"[Upload] Reading Excel file via openpyxl: {temp_path}")
                wb = openpyxl.load_workbook(temp_path, read_only=True, data_only=True)
                ws = wb.active
                rows = list(ws.iter_rows(values_only=True))
                wb.close()

                if not rows:
                    raise HTTPException(status_code=400, detail="Excel file is empty.")

                # First row = headers; sanitize them
                raw_headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
                data_rows = rows[1:]

                # Write a temp CSV (DuckDB will read it)
                csv_path = os.path.join(storage_root, f"{ds_id}_temp.csv")
                with open(csv_path, "w", newline="", encoding="utf-8") as f_csv:
                    writer = csv.writer(f_csv, quoting=csv.QUOTE_MINIMAL)
                    writer.writerow(raw_headers)
                    for row in data_rows:
                        writer.writerow([("" if v is None else v) for v in row])

                print(f"[Upload] CSV written ({len(data_rows)} rows). Converting to Parquet...")
                conv_conn.execute(
                    f"COPY (SELECT * FROM read_csv_auto('{csv_path}', header=true)) "
                    f"TO '{final_path}' (FORMAT PARQUET)"
                )
                # Clean up temp CSV
                try:
                    os.remove(csv_path)
                except Exception:
                    pass

                headers = [c[0] for c in conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 0").description]
                sample_rows = conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 5").fetchall()
                sample_data = [dict(zip(headers, row)) for row in sample_rows]
                print(f"[Upload] Excel→Parquet complete. Headers: {headers}")

            except ImportError as ie:
                raise HTTPException(status_code=500, detail=f"openpyxl not installed: {ie}")
            except HTTPException:
                raise
            except Exception as xlsx_err:
                import traceback
                detail = f"Failed to parse Excel file: {str(xlsx_err)}"
                print(f"[Upload] Excel error: {traceback.format_exc()}")
                raise HTTPException(status_code=400, detail=detail)
        else:
            # CSV/TXT path — DuckDB native, no extensions needed
            try:
                conv_conn.execute(
                    f"COPY (SELECT * FROM read_csv_auto('{temp_path}', header=true)) "
                    f"TO '{final_path}' (FORMAT PARQUET)"
                )
                headers = [c[0] for c in conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 0").description]
                sample_rows = conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 5").fetchall()
                sample_data = [dict(zip(headers, row)) for row in sample_rows]
            except Exception as csv_err:
                raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(csv_err)}")

        conv_conn.close()

        
        # 3. Cloud Upload: Parquet -> Supabase Storage
        if not supabase_client:
            raise HTTPException(status_code=500, detail="Supabase Storage not configured. Set SUPABASE_URL and SUPABASE_KEY env vars.")

        try:
            print(f"[Storage] Uploading {ds_id}.parquet to bucket '{STORAGE_BUCKET}'...")
            with open(final_path, "rb") as f:
                supabase_client.storage.from_(STORAGE_BUCKET).upload(
                    path=f"{ds_id}.parquet",
                    file=f,
                    file_options={"upsert": "true", "content-type": "application/octet-stream"}
                )
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{ds_id}.parquet"
            print(f"[Storage] Uploaded! Public URL: {public_url}")
        except Exception as e:
            print(f"[Storage] Upload failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to persist dataset to Supabase Storage: {str(e)}")
        
        # 4. Refresh persistent DuckDB engine with the new cloud view
        with _db_lock:
            conn = _get_conn()
            conn.execute(f'CREATE OR REPLACE VIEW "{ds_id}" AS SELECT * FROM read_parquet(\'{public_url}\')')
            _registered_views.add(ds_id)
            print(f"[Engine] Registered cloud view '{ds_id}'")
        
        # 5. Register in Dataset Catalog (Upsert)
        db_dataset = db.query(models.Dataset).filter(models.Dataset.id == ds_id).first()
        if db_dataset:
            db_dataset.name = ds_id
            db_dataset.original_file_name = file.filename
            db_dataset.file_path = public_url
            db_dataset.table_name = ds_id
            db_dataset.headers = headers
            db_dataset.timestamp = datetime.utcnow()
        else:
            db_dataset = models.Dataset(
                id=ds_id,
                name=ds_id,
                original_file_name=file.filename,
                file_path=public_url,
                table_name=ds_id,
                headers=headers
            )
            db.add(db_dataset)
            
        db.commit()
        db.refresh(db_dataset)
        
        return {
            "id": ds_id,
            "name": db_dataset.name,
            "original_file_name": file.filename,
            "table_name": ds_id,
            "headers": headers,
            "sample_data": sample_data,
            "public_url": public_url,
            "engine": "Platinum/Cloud"
        }
    except Exception as e:
        print(f"Platinum Conversion Failed: {str(e)}")
        if os.path.exists(final_path): os.remove(final_path)
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=400, detail=f"Platinum Conversion Failed: {str(e)}")
    finally:
        # ABSOLUTE GUARANTEE: Remove the source file immediately
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"Platinum Guard: Deleted temporary source file {temp_path}")
            except Exception as e:
                print(f"Warning: Failed to delete temp file {temp_path}: {e}")

@app.post("/api/query")
async def run_query(query_request: dict):
    sql = query_request.get("sql")
    if not sql:
        raise HTTPException(status_code=400, detail="Missing SQL query")

    def execute_with_retry(retry_on_missing=True):
        with _db_lock:
            conn = _get_conn()
            try:
                cursor = conn.execute(sql)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                results = [dict(zip(columns, row)) for row in rows]
                return {"data": results, "active_views": sorted(_registered_views)}
            except Exception as sql_err:
                err_str = str(sql_err)
                # SELF-HEALING: If table is missing, refresh views from DB and try one last time
                if retry_on_missing and ("Table with name" in err_str or "does not exist" in err_str):
                    print(f"[Engine] Table missing during query. Triggering self-healing refresh...")
                    _refresh_views(conn)
                    return execute_with_retry(retry_on_missing=False)
                
                print(f" [Backend Query] SQL Execution FAILED: {err_str}")
                return {"error": err_str, "sql": sql, "active_views": sorted(_registered_views)}

    return execute_with_retry()


@app.get("/api/engine/status")
def engine_status():
    """Dev endpoint — returns what views the persistent engine has registered."""
    return {"active_views": sorted(_registered_views), "engine": "persistent-duckdb"}


