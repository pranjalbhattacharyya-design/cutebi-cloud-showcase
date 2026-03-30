from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, Query
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
            # Point DuckDB's temp dir at /tmp — the only writable path on Vercel.
            # DO NOT run INSTALL/LOAD extensions here — they write to the filesystem
            # and cause a native SEGFAULT on read-only Lambda environments.
            _db_conn.execute("SET temp_directory='/tmp'")
        except Exception as e:
            print(f"[Engine] Could not set temp_directory: {e}")
        _refresh_views(_db_conn)
    return _db_conn

def _refresh_views(conn: duckdb.DuckDBPyConnection | None = None):
    """Register every cloud-hosted dataset from the database as a DuckDB view.
    Safe to call after an upload without restarting the server.
    Silently skips dead/missing URLs (e.g. old Parquet files from Vercel era)."""
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
                    view_name = ds.id.strip().replace('"', '')
                    # URL-encode spaces so DuckDB can resolve the path correctly
                    safe_url = ds.file_path.replace(" ", "%20")
                    # Smart detection: CSV files stored directly, Parquet for converted ones
                    if safe_url.endswith('.csv') or '.csv' in safe_url:
                        loader = f"read_csv('{safe_url}', header=true, auto_detect=true)"
                    else:
                        # Legacy parquet path — try but expect failure for old Vercel files
                        loader = f"read_parquet('{safe_url}')"
                    conn.execute(f'CREATE OR REPLACE VIEW "{view_name}" AS SELECT * FROM {loader}')
                    registered.add(view_name)
                    print(f"[Engine] Registered cloud view '{view_name}'")
                except Exception as e:
                    err = str(e)
                    # Silently skip dead URLs (old parquet files that no longer exist)
                    if "HTTP" in err or "No such file" in err:
                        print(f"[Engine] Skipping dead URL for '{ds.id}' — file may no longer exist in storage.")
                    else:
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
    import sys
    # Check which packages are available (helps diagnose Vercel dependency issues)
    pkg_status = {}
    for pkg in ["openpyxl", "pandas", "pyarrow", "duckdb"]:
        try:
            mod = __import__(pkg)
            pkg_status[pkg] = getattr(mod, "__version__", "installed")
        except ImportError:
            pkg_status[pkg] = "NOT INSTALLED"

    return {
        "status": "online",
        "version": "2.0-cloud-showcase",
        "python": sys.version,
        "engine": "DuckDB/Serverless",
        "deployment": "Vercel/Cloud",
        "packages": pkg_status,
        "tmp_writable": os.access("/tmp", os.W_OK),
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

# ── NEW: Direct-upload architecture ──────────────────────────────────────────
# Problem: Vercel Hobby plan has a 10-second function timeout.
# Sending a 900KB file browser→Vercel→Supabase takes >10s → FUNCTION_INVOCATION_FAILED.
# Solution: browser uploads DIRECTLY to Supabase Storage via a signed URL.
# Vercel only does two fast operations: generate signed URL (<1s) + save metadata (<1s).

@app.get("/api/upload/prepare")
async def prepare_upload(filename: str = Query(...), display_name: str = Query(None)):
    """
    Step 1 of direct-upload flow.
    Sanitises the filename, generates a Supabase Storage signed upload URL,
    and returns it to the browser. No file bytes are handled here.
    """
    import re
    raw_stem = os.path.splitext(filename)[0].strip()
    # Preserve spaces — DuckDB handles them via double-quoted view names.
    # Only strip truly dangerous characters (quotes, slashes, backslashes).
    ds_id = re.sub(r'[\"\'\\\/]', '', raw_stem).strip()
    storage_path = f"{ds_id}.csv"

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    try:
        # Delete existing file first to avoid 409 Duplicate on re-upload (upsert behaviour)
        try:
            supabase_client.storage.from_(STORAGE_BUCKET).remove([storage_path])
            print(f"[Storage] Removed existing file '{storage_path}' before re-upload.")
        except Exception:
            pass  # File didn't exist — that's fine, continue
        result = supabase_client.storage.from_(STORAGE_BUCKET).create_signed_upload_url(storage_path)
        # supabase-py returns either {'signedUrl': ...} or {'signed_url': ...} depending on version
        signed_url = result.get('signedUrl') or result.get('signed_url') or (result.get('data') or {}).get('signedUrl')
        if not signed_url:
            raise ValueError(f"Supabase returned no signed URL: {result}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not create signed upload URL: {e}")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
    return {
        "ds_id": ds_id,
        "signed_url": signed_url,
        "storage_path": storage_path,
        "public_url": public_url,
        "display_name": display_name or filename,
    }


@app.post("/api/register-dataset")
async def register_dataset(payload: dict, db: Session = Depends(database.get_db)):
    """
    Step 3 of direct-upload flow (step 2 is the browser PUT to Supabase).
    On a VM with a writable /tmp (GCP), converts the CSV to Parquet for
    maximum DuckDB performance. Falls back to CSV on serverless (Vercel).
    """
    ds_id        = payload.get("ds_id")
    display_name = payload.get("display_name", ds_id)
    public_url   = payload.get("public_url")   # CSV URL from the browser
    headers      = payload.get("headers", [])
    sample_data  = payload.get("sample_data", [])

    if not ds_id or not public_url:
        raise HTTPException(status_code=400, detail="ds_id and public_url are required.")

    # ── Parquet Conversion (VM only — falls back to CSV on serverless) ────────
    csv_storage_path     = f"{ds_id}.csv"
    parquet_storage_path = f"{ds_id}.parquet"
    final_url            = public_url   # default: keep CSV
    use_parquet          = False

    try:
        import tempfile as _tf

        # 1. Download CSV from Supabase Storage
        print(f"[Parquet] Downloading CSV '{csv_storage_path}' for conversion...")
        csv_bytes = supabase_client.storage.from_(STORAGE_BUCKET).download(csv_storage_path)

        # 2. Write CSV to temp file
        tmp_csv     = f"/tmp/{ds_id}_upload.csv"
        tmp_parquet = f"/tmp/{ds_id}_upload.parquet"
        with open(tmp_csv, "wb") as f:
            f.write(csv_bytes)

        # 3. DuckDB: CSV → Parquet (columnar, compressed)
        with _db_lock:
            conn = _get_conn()
            conn.execute(
                f"COPY (SELECT * FROM read_csv_auto('{tmp_csv}')) "
                f"TO '{tmp_parquet}' (FORMAT PARQUET, COMPRESSION SNAPPY)"
            )
        print(f"[Parquet] Converted — {len(csv_bytes)} bytes CSV → Parquet")

        # 4. Upload Parquet to Supabase Storage
        with open(tmp_parquet, "rb") as f:
            parquet_bytes = f.read()
        supabase_client.storage.from_(STORAGE_BUCKET).upload(
            parquet_storage_path,
            parquet_bytes,
            file_options={"upsert": "true", "content-type": "application/octet-stream"}
        )

        # 5. Build canonical Parquet public URL (URL-encode spaces)
        parquet_public_url = (
            f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{parquet_storage_path}"
        ).replace(" ", "%20")
        final_url  = parquet_public_url
        use_parquet = True
        print(f"[Parquet] Ready: {parquet_public_url}")

        # 6. Delete interim CSV from Supabase to keep bucket clean
        try:
            supabase_client.storage.from_(STORAGE_BUCKET).remove([csv_storage_path])
            print(f"[Parquet] Removed interim CSV '{csv_storage_path}'")
        except Exception:
            pass  # Non-fatal — CSV can remain as fallback

        # 7. Cleanup temp files
        import os as _os
        for f in [tmp_csv, tmp_parquet]:
            try:
                _os.remove(f)
            except Exception:
                pass

    except Exception as e:
        print(f"[Parquet] Conversion failed (staying on CSV): {e}")
        use_parquet = False
        final_url   = public_url  # Keep original CSV URL

    # ── Register DuckDB view with the best available format ──────────────────
    try:
        with _db_lock:
            conn = _get_conn()
            if use_parquet:
                conn.execute(
                    f'CREATE OR REPLACE VIEW "{ds_id}" AS '
                    f"SELECT * FROM read_parquet('{final_url}')"
                )
            else:
                conn.execute(
                    f'CREATE OR REPLACE VIEW "{ds_id}" AS '
                    f"SELECT * FROM read_csv('{final_url}', header=true, auto_detect=true)"
                )
            _registered_views.add(ds_id)
        engine_label = "Parquet" if use_parquet else "CSV"
        print(f"[Engine] Registered {engine_label} view '{ds_id}'")
    except Exception as e:
        print(f"[Engine] Warning: could not register view '{ds_id}': {e}")

    # ── Persist final URL to Postgres ─────────────────────────────────────────
    try:
        db_dataset = db.query(models.Dataset).filter(models.Dataset.id == ds_id).first()
        if db_dataset:
            db_dataset.name              = ds_id
            db_dataset.original_file_name= display_name
            db_dataset.file_path         = final_url   # Parquet URL if converted
            db_dataset.table_name        = ds_id
            db_dataset.headers           = headers
            db_dataset.timestamp         = datetime.utcnow()
        else:
            db_dataset = models.Dataset(
                id=ds_id, name=ds_id, original_file_name=display_name,
                file_path=final_url, table_name=ds_id, headers=headers
            )
            db.add(db_dataset)
        db.commit()
        db.refresh(db_dataset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB registration failed: {e}")

    return {
        "id": ds_id,
        "name": db_dataset.name,
        "original_file_name": display_name,
        "table_name": ds_id,
        "headers": headers,
        "sample_data": sample_data,
        "public_url": final_url,
        "engine": "Platinum/Parquet" if use_parquet else "Platinum/CSV"
    }


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    original_filename: str = Form(None),
    db: Session = Depends(database.get_db)
):
    """
    Upload pipeline (Cloud/Vercel path):
      1. Read uploaded file bytes via await file.read()
      2. If XLSX: use openpyxl to convert to CSV bytes in-memory
      3. Parse headers + 5 sample rows using Python csv module (NO DuckDB)
      4. Upload the CSV directly to Supabase Storage
      5. Register a DuckDB read_csv() view
      6. Persist to Postgres

    DuckDB is NOT used for conversion — it was SEGFAULTing on Vercel's Lambda.
    DuckDB CAN query the CSV over HTTP later via read_csv().
    """
    import re, csv as _csv, io

    display_name = original_filename or file.filename
    raw_stem = os.path.splitext(file.filename)[0].strip()
    ds_id = re.sub(r'[^\w]', '_', raw_stem)
    ds_id = re.sub(r'_+', '_', ds_id).strip('_')
    extension = file.filename.split('.')[-1].lower()

    print(f"[Upload] Starting: display='{display_name}' ds_id='{ds_id}' ext='{extension}'")

    # ── Step 1: Read file bytes ───────────────────────────────────────────────
    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")
        print(f"[Upload] Received {len(raw_bytes)} bytes")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[Step 1] Read failed: {e}")

    # ── Step 2: Normalise to CSV bytes (no DuckDB, no temp files on Vercel) ──
    try:
        if extension in ['xlsx', 'xls']:
            # XLSX → CSV in-memory using openpyxl
            import openpyxl
            print("[Upload] XLSX detected — converting via openpyxl...")
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
            ws = wb.active
            xl_rows = list(ws.iter_rows(values_only=True))
            wb.close()
            if not xl_rows:
                raise HTTPException(status_code=400, detail="Excel file is empty.")
            out = io.StringIO()
            writer = _csv.writer(out, quoting=_csv.QUOTE_MINIMAL)
            for row in xl_rows:
                writer.writerow([("" if v is None else v) for v in row])
            csv_bytes = out.getvalue().encode('utf-8')
            print(f"[Upload] openpyxl→CSV: {len(csv_bytes)} bytes, {len(xl_rows)} rows")
        else:
            # Already CSV — use as-is
            csv_bytes = raw_bytes
            print(f"[Upload] CSV received: {len(csv_bytes)} bytes")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[Step 2] CSV normalisation failed: {e}")

    # ── Step 3: Parse headers + sample rows (pure Python, no DuckDB) ─────────
    try:
        text = csv_bytes.decode('utf-8-sig')  # strip BOM if present
        reader = _csv.reader(io.StringIO(text))
        headers = [h.strip() for h in next(reader)]
        if not headers:
            raise HTTPException(status_code=400, detail="CSV has no headers.")
        sample_data = []
        for i, row in enumerate(reader):
            if i >= 5:
                break
            sample_data.append(dict(zip(headers, row)))
        print(f"[Upload] Headers parsed: {headers[:5]}...")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[Step 3] Header parsing failed: {e}")

    # ── Step 4: Upload CSV → Supabase Storage ────────────────────────────────
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase not configured (missing env vars).")
    try:
        storage_key = f"{ds_id}.csv"
        print(f"[Storage] Uploading {storage_key} → bucket '{STORAGE_BUCKET}'...")
        supabase_client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_key,
            file=csv_bytes,
            file_options={"upsert": "true", "content-type": "text/csv"}
        )
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_key}"
        # URL-encode spaces so DuckDB can resolve the path correctly
        public_url = public_url.replace(" ", "%20")
        print(f"[Storage] Uploaded! URL: {public_url}")
    except Exception as e:
        import traceback
        print(f"[Storage] FAILED:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"[Step 4] Supabase upload failed: {e}")

    # ── Step 5: Register DuckDB cloud view (read_csv, not read_parquet) ───────
    try:
        with _db_lock:
            conn = _get_conn()
            conn.execute(
                f'CREATE OR REPLACE VIEW "{ds_id}" AS '
                f"SELECT * FROM read_csv('{public_url}', header=true, auto_detect=true)"
            )
            _registered_views.add(ds_id)
        print(f"[Engine] Registered CSV view '{ds_id}'")
    except Exception as e:
        print(f"[Engine] Warning: could not register view '{ds_id}': {e}")

    # ── Step 6: Persist to Postgres dataset catalog ───────────────────────────
    try:
        db_dataset = db.query(models.Dataset).filter(models.Dataset.id == ds_id).first()
        if db_dataset:
            db_dataset.name = ds_id
            db_dataset.original_file_name = display_name
            db_dataset.file_path = public_url
            db_dataset.table_name = ds_id
            db_dataset.headers = headers
            db_dataset.timestamp = datetime.utcnow()
        else:
            db_dataset = models.Dataset(
                id=ds_id,
                name=ds_id,
                original_file_name=display_name,
                file_path=public_url,
                table_name=ds_id,
                headers=headers
            )
            db.add(db_dataset)
        db.commit()
        db.refresh(db_dataset)
    except Exception as e:
        print(f"[DB] Catalog write failed: {e}")
        raise HTTPException(status_code=500, detail=f"[Step 6] DB registration failed: {e}")

    return {
        "id": ds_id,
        "name": db_dataset.name,
        "original_file_name": display_name,
        "table_name": ds_id,
        "headers": headers,
        "sample_data": sample_data,
        "public_url": public_url,
        "engine": "Platinum/Cloud"
    }

@app.post("/api/query")
async def run_query(query_request: dict):
    sql = query_request.get("sql")
    if not sql:
        raise HTTPException(status_code=400, detail="Missing SQL query")

    def execute_with_retry(retry_on_missing=True):
        with _db_lock:
            try:
                conn = _get_conn()
            except Exception as conn_err:
                print(f"[Backend Query] Connection FAILED: {conn_err}")
                return {"error": f"Database initialization failed. Check your DATABASE_URL? {conn_err}", "sql": sql}

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
                    try:
                        _refresh_views(conn)
                    except Exception as refresh_err:
                        return {"error": f"Table missing and self-healing failed: {refresh_err}", "sql": sql}
                    return execute_with_retry(retry_on_missing=False)
                
                print(f" [Backend Query] SQL Execution FAILED: {err_str}")
                return {"error": err_str, "sql": sql, "active_views": sorted(_registered_views)}

    return execute_with_retry()


@app.get("/api/engine/status")
def engine_status():
    """Dev endpoint — returns what views the persistent engine has registered."""
    return {"active_views": sorted(_registered_views), "engine": "persistent-duckdb"}


