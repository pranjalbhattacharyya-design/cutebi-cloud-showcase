from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os
import re as _re
import shutil
import uuid
import threading
import duckdb
import httpx

from . import models, database, engine
from supabase import create_client, Client
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime

# ---------------------------------------------------------------------------
# BigQuery Client Initialization
# ---------------------------------------------------------------------------
BQ_PROJECT  = os.getenv("BQ_PROJECT",  "temporal-falcon-467210-m4")
BQ_DATASET  = os.getenv("BQ_DATASET",  "cutebi_gold")
BQ_KEY_PATH = os.path.expanduser(os.getenv("BQ_KEY_PATH", "~/bq-key.json"))

bq_client = None
try:
    from google.cloud import bigquery as _bq
    if os.path.exists(BQ_KEY_PATH):
        bq_client = _bq.Client.from_service_account_json(BQ_KEY_PATH, project=BQ_PROJECT)
        print(f"[BQ] Client initialized — project={BQ_PROJECT}, dataset={BQ_DATASET}")
    else:
        print(f"[BQ] Key file not found at {BQ_KEY_PATH}. BigQuery mode disabled.")
except ImportError:
    print("[BQ] google-cloud-bigquery not installed. BigQuery mode disabled.")
except Exception as e:
    print(f"[BQ] Failed to initialize BigQuery client: {e}")



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
    """Register every cloud-hosted (Supabase/HTTP) dataset as a DuckDB view.
    BQ-backed datasets are skipped — queries against them go to BigQuery directly."""
    global _registered_views
    if conn is None:
        conn = _get_conn()

    registered = set()
    db = database.SessionLocal()
    try:
        cloud_datasets = db.query(models.Dataset).all()
        for ds in cloud_datasets:
            fp = ds.file_path or ""
            # BigQuery datasets: file_path = "project.dataset.Table" (no http)
            if not fp.startswith("http"):
                print(f"[Engine] Skipping BQ dataset '{ds.id}' — queries go to BigQuery.")
                continue
            try:
                view_name = ds.id.strip().replace('"', '')
                safe_url  = fp.replace(" ", "%20")
                if '.csv' in safe_url:
                    loader = f"read_csv('{safe_url}', header=true, auto_detect=true)"
                else:
                    loader = f"read_parquet('{safe_url}')"
                conn.execute(f'CREATE OR REPLACE VIEW "{view_name}" AS SELECT * FROM {loader}')
                registered.add(view_name)
                print(f"[Engine] Registered cloud view '{view_name}'")
            except Exception as e:
                err = str(e)
                if "HTTP" in err or "No such file" in err:
                    print(f"[Engine] Skipping dead URL for '{ds.id}'")
                else:
                    print(f"[Engine] Could not register view '{ds.id}': {e}")
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
            fp = catalog_entry.file_path or ""

            # ---  BigQuery dataset: sample via BQ client  ---
            if not fp.startswith("http") and bq_client:
                row["public_url"] = None  # no Supabase URL for BQ datasets
                try:
                    bq_sample_sql = f"SELECT * FROM `{fp}` LIMIT 5"
                    bq_rows = list(bq_client.query(bq_sample_sql).result())
                    row["sample_data"] = [dict(r.items()) for r in bq_rows]
                except Exception as e:
                    print(f"[WorkspaceDatasets/BQ] Sample fetch failed for {ws_ds.id}: {e}")
                    row["sample_data"] = []
            else:
                # --- Supabase/Parquet dataset: sample via DuckDB ---
                row["public_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{ws_ds.id}.parquet"
                try:
                    with _db_lock:
                        conn = _get_conn()
                        sample_cursor = conn.execute(
                            f'SELECT * FROM "{catalog_entry.table_name}" LIMIT 5'
                        )
                        cols = [c[0] for c in sample_cursor.description]
                        rows_raw = sample_cursor.fetchall()
                        row["sample_data"] = [dict(zip(cols, r)) for r in rows_raw]
                except Exception as e:
                    print(f"[WorkspaceDatasets/DuckDB] Could not fetch sample for {ws_ds.id}: {e}")
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


# ---------------------------------------------------------------------------
# BigQuery Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/bq/tables")
def list_bq_tables():
    """List all tables in the cutebi_gold BigQuery dataset with schema + row count."""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized.")
    try:
        from google.cloud import bigquery as _bq
        tables = list(bq_client.list_tables(f"{BQ_PROJECT}.{BQ_DATASET}"))
        result = []
        for t_ref in tables:
            t = bq_client.get_table(f"{BQ_PROJECT}.{BQ_DATASET}.{t_ref.table_id}")
            result.append({
                "table_id":    t.table_id,
                "display_name": t.table_id.replace("_", " "),
                "full_ref":    f"{BQ_PROJECT}.{BQ_DATASET}.{t.table_id}",
                "num_rows":    t.num_rows,
                "schema":      [{"name": f.name, "type": str(f.field_type)} for f in t.schema],
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BQ list tables failed: {e}")


@app.post("/api/bq/register")
def register_bq_table(payload: dict, db: Session = Depends(database.get_db)):
    """
    Register a BigQuery table as a CuteBI dataset.
    Expects: { bq_table: "Fact_Sale", display_name: "Fact Sale" }
    The display_name becomes the ds_id — preserving compatibility with saved reports.
    """
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized.")

    bq_table     = payload.get("bq_table")     # e.g. "Fact_Sale"
    display_name = payload.get("display_name") # e.g. "Fact Sale"

    if not bq_table or not display_name:
        raise HTTPException(status_code=400, detail="bq_table and display_name are required.")

    # ds_id is the CuteBI identifier (friendly name, e.g. "Fact Sale")
    ds_id   = display_name
    bq_ref  = f"{BQ_PROJECT}.{BQ_DATASET}.{bq_table}"  # fully-qualified BQ path

    try:
        t = bq_client.get_table(bq_ref)
        headers     = [f.name for f in t.schema]
        schema_info = [{"name": f.name, "type": str(f.field_type)} for f in t.schema]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch BQ schema: {e}")

    # Fetch 5 sample rows for semantic model generation
    sample_data = []
    try:
        rows = list(bq_client.query(f"SELECT * FROM `{bq_ref}` LIMIT 5").result())
        sample_data = [dict(r.items()) for r in rows]
    except Exception as e:
        print(f"[BQ] Sample fetch failed for {bq_table}: {e}")

    # Persist to Postgres — file_path stores the BQ full reference (not an http URL)
    try:
        db_dataset = db.query(models.Dataset).filter(models.Dataset.id == ds_id).first()
        if db_dataset:
            db_dataset.name               = ds_id
            db_dataset.original_file_name = display_name
            db_dataset.file_path          = bq_ref   # BQ reference, not http
            db_dataset.table_name         = ds_id
            db_dataset.headers            = headers
            db_dataset.timestamp          = datetime.utcnow()
        else:
            db_dataset = models.Dataset(
                id=ds_id, name=ds_id, original_file_name=display_name,
                file_path=bq_ref, table_name=ds_id, headers=headers
            )
            db.add(db_dataset)
        db.commit()
        db.refresh(db_dataset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB registration failed: {e}")

    print(f"[BQ] Registered '{ds_id}' → {bq_ref} ({len(headers)} columns, {t.num_rows:,} rows)")
    return {
        "id":                ds_id,
        "name":             ds_id,
        "original_file_name": display_name,
        "table_name":       ds_id,
        "bq_table":         bq_table,
        "bq_ref":           bq_ref,
        "headers":          headers,
        "schema":           schema_info,
        "sample_data":      sample_data,
        "num_rows":         t.num_rows,
        "engine":           "BigQuery",
    }


@app.post("/api/bq/maxdates")
def bq_max_dates(payload: dict):
    """
    Fetch MAX(date_col) for a list of BQ dataset/column pairs.
    Used by the frontend engine warmup (replaces browser WASM DuckDB date scan).
    Input:  { queries: [{key, ds_id, col}] }
    Output: { "Fact Sale::Date": "2026-03-31", ... }
    """
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized.")

    queries = payload.get("queries", [])

    # Load BQ references for all registered datasets
    db = database.SessionLocal()
    try:
        all_ds = db.query(models.Dataset).all()
        ds_map = {
            ds.id: ds.file_path
            for ds in all_ds
            if ds.file_path and not ds.file_path.startswith("http")
        }
    finally:
        db.close()

    result = {}
    import concurrent.futures

    def _fetch_max(q):
        key    = q.get("key")
        ds_id  = q.get("ds_id")
        col    = q.get("col")
        bq_ref = ds_map.get(ds_id)
        if not bq_ref:
            return key, None
        sql = f"SELECT MAX(SAFE_CAST(`{col}` AS DATE)) AS m FROM `{bq_ref}`"
        try:
            rows = list(bq_client.query(sql).result())
            val  = rows[0].m if rows and rows[0].m else None
            return key, str(val) if val else None
        except Exception as e:
            print(f"[BQ/maxdates] Failed for {key}: {e}")
            return key, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key, val in pool.map(_fetch_max, queries):
            if val:
                result[key] = val

    return result

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

_query_cache = {}

@app.post("/api/query")
def run_query(query_request: dict, db: Session = Depends(database.get_db)):
    sql = query_request.get("sql")
    if not sql:
        raise HTTPException(status_code=400, detail="Missing SQL query")

    if sql in _query_cache:
        import time as _t
        print(f"[{int(_t.time()*1000)}] [Batch] Cache Hit! Serving instantly.")
        return _query_cache[sql]

    # ── BigQuery path ────────────────────────────────────────────────────────
    if bq_client:
        # Build ds_map from Postgres: ds_id → BQ full reference
        all_ds = db.query(models.Dataset).all()
        ds_map = {
            ds.id: ds.file_path
            for ds in all_ds
            if ds.file_path and not ds.file_path.startswith("http")
        }

        if ds_map:  # At least one BQ dataset is registered → use BQ
            bq_sql = sql
            for friendly_name, bq_ref in ds_map.items():
                bq_sql = bq_sql.replace(f"FROM `{friendly_name}`", f"FROM `{bq_ref}` AS `{friendly_name}`")
                bq_sql = bq_sql.replace(f"JOIN `{friendly_name}`", f"JOIN `{bq_ref}` AS `{friendly_name}`")

            print(f"[BQ Query] Transformed SQL (first 400 chars):\n{bq_sql[:400]}")
            try:
                from google.cloud import bigquery as _bq
                job    = bq_client.query(bq_sql)
                rows   = job.result()
                cols   = [f.name for f in rows.schema]
                data   = [{c: row[c] for c in cols} for row in rows]
                # Serialize dates/decimals to strings for JSON
                import datetime as _dt
                import decimal as _dec
                for record in data:
                    for k, v in record.items():
                        if isinstance(v, (_dt.date, _dt.datetime)):
                            record[k] = v.isoformat()
                        elif isinstance(v, _dec.Decimal):
                            record[k] = float(v)
                
                res = {"data": data, "engine": "BigQuery", "sql": bq_sql}
                
                # Cache management (keep max 1000 items)
                if len(_query_cache) > 1000:
                    _query_cache.pop(next(iter(_query_cache)))
                _query_cache[sql] = res
                
                return res
            except Exception as e:
                print(f"[BQ Query] FAILED: {e}\nSQL:\n{bq_sql}")
                return {"error": str(e), "sql": bq_sql, "engine": "BigQuery"}

    # ── DuckDB fallback path (legacy Supabase/Parquet datasets) ─────────────
    def execute_with_retry(retry_on_missing=True):
        with _db_lock:
            try:
                conn = _get_conn()
            except Exception as conn_err:
                print(f"[Backend Query] Connection FAILED: {conn_err}")
                return {"error": f"Database initialization failed: {conn_err}", "sql": sql}

            try:
                cursor = conn.execute(sql)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                results = [dict(zip(columns, row)) for row in rows]
                return {"data": results, "active_views": sorted(_registered_views)}
            except Exception as sql_err:
                err_str = str(sql_err)
                if retry_on_missing and ("Table with name" in err_str or "does not exist" in err_str):
                    print(f"[Engine] Table missing. Triggering self-healing refresh...")
                    try:
                        _refresh_views(conn)
                    except Exception as refresh_err:
                        return {"error": f"Self-healing failed: {refresh_err}", "sql": sql}
                    return execute_with_retry(retry_on_missing=False)
                print(f"[Backend Query] SQL Execution FAILED: {err_str}")
                return {"error": err_str, "sql": sql, "active_views": sorted(_registered_views)}

    return execute_with_retry()


from pydantic import BaseModel
from typing import List
import asyncio
import concurrent.futures

class BatchQueryRequest(BaseModel):
    queries: List[str]

@app.post("/api/query/batch")
async def run_query_batch(request: BatchQueryRequest, db: Session = Depends(database.get_db)):
    if not request.queries:
        return {"data": []}

    def execute_single(sql: str):
        try:
            res = run_query({"sql": sql}, db)
            if "error" in res:
                print(f"[Batch] Error in query: {res['error']}")
                return []
            return res.get("data", [])
        except Exception as e:
            print(f"[Batch] Exception in query: {e}")
            return []
            
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [
            loop.run_in_executor(executor, execute_single, sql)
            for sql in request.queries
        ]
        results = await asyncio.gather(*futures)
        
    return {"data": list(results)}

@app.get("/api/engine/status")
def engine_status():
    """Dev endpoint — returns what views the persistent engine has registered."""
    return {
        "active_views": sorted(_registered_views),
        "engine":       "BigQuery" if (bq_client) else "persistent-duckdb",
        "bq_project":   BQ_PROJECT if bq_client else None,
        "bq_dataset":   BQ_DATASET if bq_client else None,
    }


# ---------------------------------------------------------------------------
# AI Proxy Endpoints — Gemini & Imagen
# The API key lives ONLY on the server. Never exposed to the browser.
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL   = "gemini-2.5-flash"
IMAGEN_MODEL   = "imagen-4.0-generate-001"


class AIFieldDim(BaseModel):
    id: str
    label: str
    description: Optional[str] = ""


class AIFieldMeasure(BaseModel):
    id: str
    label: str
    description: Optional[str] = ""
    aggType: Optional[str] = "sum"
    isTimeIntelligence: Optional[bool] = False
    timePeriod: Optional[str] = None


class AIExploreRequest(BaseModel):
    query: Optional[str] = ""
    phase: Optional[str] = ""                            # "sql_gen" | "fast_answer" | "micro" | "meso" | "macro" | "preflight" | "micro_slice" | "dimension_trend"
    model_description: Optional[str] = ""
    dimensions: Optional[List[AIFieldDim]] = []
    measures: Optional[List[AIFieldMeasure]] = []
    data_table: Optional[List[Dict[str, Any]]] = []
    prior_output: Optional[str] = ""     # Phase 1 text for Meso; Phase 2 text for Macro
    macro_dim: Optional[str] = ""        # Broadest hierarchy level (e.g. Zone, Region)
    meso_dim: Optional[str] = ""         # Mid-tier hierarchy level (e.g. Area Office)
    micro_dim: Optional[str] = ""        # Finest grain level (e.g. Dealer, Location)
    selected_analytical_dims: Optional[List[Dict[str, Any]]] = []
    selected_facts: Optional[List[str]] = []
    selected_months: Optional[List[str]] = []
    geo_filter_zones: Optional[List[str]] = []
    geo_filter_areas: Optional[List[str]] = []
    analysis_mode: Optional[str] = "full"  # "full" | "dimension_trend"
    trend_dim: Optional[str] = ""
    trend_time_grain: Optional[str] = ""
    dataset_id: Optional[str] = ""
class AIImageRequest(BaseModel):
    verdict_text: str


def _build_explore_prompt(req: AIExploreRequest) -> str:
    """Build the correct Gemini prompt based on which phase is being executed."""
    dim_list  = [{"id": d.id, "label": d.label, "description": d.description} for d in req.dimensions]
    meas_list = [{
        "id": m.id, "label": m.label, "description": m.description,
        "aggType": m.aggType,
        "isTimeIntelligence": m.isTimeIntelligence,
        "timePeriod": m.timePeriod
    } for m in req.measures]

    model_ctx    = f"Model: {req.model_description}\n" if req.model_description else ""
    data_snippet = str(req.data_table)[:4000] if req.data_table else ""

    if req.phase == "sql_gen":
        hierarchy_hint = ""
        if req.macro_dim or req.meso_dim or req.micro_dim:
            hierarchy_hint = f"\nUser's reporting hierarchy: {req.macro_dim} (broadest) → {req.meso_dim} → {req.micro_dim} (finest grain).\n"
        return f"""{model_ctx}You are a Data Analyst. The user is querying a unified semantic model.
{hierarchy_hint}
Dimensions (category fields — each has a business description):
{dim_list}

Measures (numeric fields — each has a business description; aggType indicates aggregation; isTimeIntelligence=true means it is a time-period calculation):
{meas_list}

User question: "{req.query}"

RULES:
1. If data fetch is needed, set action="query" and populate sql_query with EXACT field IDs from the lists above.
2. If answerable without data, set action="answer" and provide the text.
3. NEVER invent field IDs. Only use exact IDs provided.
4. For time-based questions, prefer fields where isTimeIntelligence=true.
5. Match aggType when describing results (sum=total, avg=average, count=number of).
6. CRITICAL — READ the description of every dimension and measure before selecting.
   Choose fields whose descriptions are semantically relevant to the user's question.
   Do NOT exclude a field just because its name does not match a keyword in the question.
   A question about "sales performance" must include any dimension whose description mentions
   geography, time period, product, or organisational hierarchy — even if not explicitly named.
7. CRITICAL — If a reporting hierarchy is provided above, ALWAYS include those dimension IDs
   in sql_query so the data is grouped at the correct grain for downstream analysis.
   Also always include any time dimension (e.g. FY, Month, Quarter) relevant to the question.
8. EXHAUSTIVE FIELD IDENTIFICATION — If the user is requesting a deep-dive, identify ALL relevant semantic fields (especially dimensions like Product, Category, Customer, and Time) so they can be provided as analytical axes. Do NOT attempt to generate a full SQL query that groups by ALL of them at once. The system will handle the Cartesian aggregations. Just list the relevant field IDs in the sql_query.dimensions and sql_query.measures arrays.

Return JSON: {{ "action": "query"|"answer", "text": "...", "sql_query": {{ "dimensions": [], "measures": [], "filters": [] }} }}"""

    if req.phase == "fast_answer":
        meas_ctx = [{"id": m.id, "label": m.label, "aggType": m.aggType} for m in req.measures]
        return f"""{model_ctx}The user asked: "{req.query}".
Data returned: {data_snippet}
Measure context (use aggType to frame values): {meas_ctx}

Provide a concise 1-2 sentence natural language answer based STRICTLY on this data.
Use aggType to describe values correctly (sum → "total X was...", avg → "average X was...").
Do NOT mention JSON, databases, or technical field IDs."""

    if req.phase == "micro_slice":
        return f"""{model_ctx}You are a senior business analyst.

Data snippet (filtered to specific analytical dimension value):
{data_snippet}

Identify standout performers, declining units, and seasonal anomalies. Be specific with numbers. Do NOT output markdown. Write 3-5 sentences maximum."""

    if req.phase == "dimension_trend":
        return f"""{model_ctx}You are an expert data analyst.

Data snippet (showing {req.trend_dim} over {req.trend_time_grain}):
{data_snippet}

Write a comprehensive business analysis identifying trending dimensions, declining dimensions, seasonal patterns, and notable cross-dimensional comparisons. Be specific with numbers."""

    if req.phase == "meso":
        macro_dim = req.macro_dim or "Macro Level"
        meso_dim  = req.meso_dim  or "Meso Level"
        return f"""You are a senior business analyst. Below are granular findings from many micro-level analyses across various products and facts:
{req.prior_output}

Reporting hierarchy:
- Macro Level (broadest): {macro_dim}
- Meso Level (mid-tier): {meso_dim}

Write one dedicated analytical paragraph for EACH unique {meso_dim} value.
1. Open by naming the {meso_dim} and which {macro_dim} it belongs to.
2. Consolidate findings covering all products and facts seen for that area.
3. Identify dominant patterns, best and worst performing elements, and consistent signals.

Write sequential paragraphs — one per {meso_dim}."""

    if req.phase == "macro":
        macro_dim = req.macro_dim or "Macro Level"
        meso_dim  = req.meso_dim  or "Meso Level"
        return f"""You are a senior business analyst. Below are mid-tier findings consolidated from {meso_dim} level analysis:
{req.prior_output}

Write 2-3 concise, forward-looking strategic recommendations at the {macro_dim} (broadest) level.
- Synthesise the key patterns observed across all {meso_dim} units.
- Focus on: growth opportunities, conversion gaps, efficiency levers, and risk areas.
- Do NOT repeat the meso analysis — only provide executive-level strategic guidance."""

    if req.phase == "infographic_data":
        return f"""You are an executive data storyteller. Based on the following business analysis:
{req.prior_output}

Extract the 3 most important business metrics and insights for an executive infographic.
CRITICAL INSTRUCTION: Do NOT invent, hallucinate, or calculate new numbers. ONLY use metrics that actually appear in the text above. If no exact numbers exist in the text, use qualitative descriptors like "High", "Low", or "Increased" instead of imaginary data.

RULES:
- headline: max 10 words, punchy executive summary
- findings: exactly 3 KPI tiles highlighting key insights from the analysis
- value: IF a number is present in the text, use it. IF NO NUMBERS EXIST, you MUST use a short qualitative descriptor (e.g. 'Critical', 'At Risk', 'High Priority', 'Stable'). NEVER invent numbers.
- trend: 'up', 'down', or 'neutral' based on context
- delta: short change label like '+12%' or '-8%' or leave empty if not applicable
- bullets: exactly 3 key findings, max 15 words each, specific and data-driven
- recommendation: 1 actionable sentence, max 20 words

Return ONLY valid JSON with no markdown."""

    if req.phase == "hierarchy_resolve":
        return f"""You are a data dictionary expert. A user has typed their reporting hierarchy in plain English.
Your job is to map each typed label to the EXACT field ID from the available dimensions list.

Available dimensions (use ONLY these IDs):
{dim_list}

User typed (from broadest to finest grain):
- Macro (broadest): "{req.macro_dim}"
- Meso (mid-tier): "{req.meso_dim}"
- Micro (finest): "{req.micro_dim}"

RULES:
1. Match each label to the single best-fitting dimension ID from the list above.
2. Use fuzzy/semantic matching — "Zone" may map to "Zone_Name", "Dealer" to "Dealer_Code" etc.
3. NEVER invent IDs. Only return IDs that exist in the list above.
4. If you cannot confidently match a label, pick the closest dimension by description.

Return ONLY valid JSON with no markdown:
{{ "macro_dim": "<exact_id>", "meso_dim": "<exact_id>", "micro_dim": "<exact_id>" }}"""

    if req.phase == "auto_fill":
        # Pass the exact frontend prompt directly
        return req.query

    raise ValueError(f"Unknown phase: {req.phase}")


@app.post("/api/ai/explore")
async def ai_explore(req: AIExploreRequest):
    """Secure proxy: forwards explore chat requests to Gemini. API key never leaves the server."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured on server.")

    prompt = _build_explore_prompt(req)
    url    = f"{GEMINI_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    body   = {"contents": [{"parts": [{"text": prompt}]}]}

    # SQL gen phase needs structured JSON output
    if req.phase == "sql_gen":
        body["generationConfig"] = {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "action": {"type": "STRING"},
                    "text":   {"type": "STRING"},
                    "sql_query": {
                        "type": "OBJECT", "nullable": True,
                        "properties": {
                            "dimensions": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "measures":   {"type": "ARRAY", "items": {"type": "STRING"}},
                            "filters":    {"type": "ARRAY", "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "field":    {"type": "STRING"},
                                    "operator": {"type": "STRING"},
                                    "value":    {"type": "STRING"}
                                }
                            }}
                        }
                    }
                },
                "required": ["action"]
            }
        }

    # Infographic data phase — returns structured chart data as JSON
    elif req.phase == "infographic_data":
        body["generationConfig"] = {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "headline":       {"type": "STRING"},
                    "findings": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "label": {"type": "STRING"},
                                "value": {"type": "STRING"},
                                "trend": {"type": "STRING"},
                                "delta": {"type": "STRING"}
                            }
                        }
                    },
                    "bullets":        {"type": "ARRAY", "items": {"type": "STRING"}},
                    "recommendation": {"type": "STRING"}
                },
                "required": ["headline", "findings", "bullets", "recommendation"]
            }
        }

    # Auto-fill descriptions phase — returns structured table and column descriptions JSON
    elif req.phase == "auto_fill":
        body["generationConfig"] = {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "tableDescription": {"type": "STRING"},
                    "columns": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "id": {"type": "STRING"},
                                "description": {"type": "STRING"}
                            },
                            "required": ["id", "description"]
                        }
                    }
                },
                "required": ["tableDescription", "columns"]
            }
        }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(url, json=body)

        if response.status_code != 200:
            print(f"[AI/explore] Gemini error {response.status_code}: {response.text[:200]}")
            raise HTTPException(status_code=502, detail=f"Gemini returned {response.status_code}")

        data = response.json()
        text = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

        if not text:
            raise HTTPException(status_code=502, detail="Empty response from Gemini")

        return {"text": text, "error": None}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini request timed out.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI/explore] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/image")
async def ai_image(req: AIImageRequest):
    """Secure proxy: generates infographic via Imagen. API key never leaves the server."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured on server.")

    import re as _re2
    clean       = _re2.sub(r'[^\w\s.,!?\'"-]', '', req.verdict_text)[:400]
    prompt_text = (
        f"Professional business infographic slide. Key insights: {clean}. "
        "Clean, modern, data-driven design with clear hierarchy, minimal text, strong visual contrast."
    )

    url    = f"{GEMINI_BASE}/{IMAGEN_MODEL}:predict?key={GEMINI_API_KEY}"
    body   = {"instances": [{"prompt": prompt_text}], "parameters": {"sampleCount": 1}}
    delays = [1, 2, 4, 8, 16]
    last_err = "Unknown error"

    async with httpx.AsyncClient(timeout=60.0) as client:
        for i, delay in enumerate(delays):
            try:
                response = await client.post(url, json=body)
                if response.status_code == 200:
                    data = response.json()
                    b64  = (data.get("predictions") or [{}])[0].get("bytesBase64Encoded") or \
                           (data.get("predictions") or [{}])[0].get("b64", "")
                    if b64:
                        return {"imageBase64": b64, "error": None}
                    last_err = "No image data in response"
                elif response.status_code in (401, 403):
                    raise HTTPException(status_code=403, detail="Imagen: authentication failed")
                else:
                    last_err = f"Status {response.status_code}: {response.text[:150]}"
            except httpx.TimeoutException:
                last_err = "Imagen request timed out"
            except HTTPException:
                raise
            except Exception as e:
                last_err = str(e)

            if i < len(delays) - 1:
                import asyncio as _asyncio
                await _asyncio.sleep(delay)

    raise HTTPException(status_code=502, detail=f"Imagen failed after retries: {last_err}")

import asyncio
from fastapi.responses import StreamingResponse
import json

@app.post("/api/ai/deep-dive/preflight")
async def deep_dive_preflight(req: AIExploreRequest, db: Session = Depends(database.get_db)):
    """Runs a COUNT DISTINCT query against BQ for all provided dimensions."""
    if not bq_client:
        raise HTTPException(status_code=500, detail="BigQuery not configured.")

    all_ds = db.query(models.Dataset).all()
    ds_map = { ds.id: ds.file_path for ds in all_ds if ds.file_path and not ds.file_path.startswith("http") }
    bq_ref = ds_map.get(req.dataset_id, req.dataset_id)

    # ── Step 0: Fetch actual column names (works for tables AND views) ──────────
    # INFORMATION_SCHEMA only covers base tables. For BQ views (like our unified
    # semantic CTE view) we use SELECT * LIMIT 0 — the schema comes from the
    # query result object, no rows are scanned.
    real_columns: list[str] = []
    try:
        schema_job = bq_client.query(f"SELECT * FROM `{bq_ref}` LIMIT 0")
        schema_result = schema_job.result()
        real_columns = [field.name for field in schema_result.schema]
        print(f"[Preflight] Real BQ columns ({len(real_columns)}): {real_columns[:20]}...")
    except Exception as e:
        print(f"[Preflight] Schema fetch failed (non-fatal): {e}")


    def snap_to_real(candidate: str) -> str:
        """Return the real BQ column whose name best matches the candidate string."""
        if not real_columns or not candidate:
            return candidate
        # 1. Exact match
        for col in real_columns:
            if col.lower() == candidate.lower():
                return col
        # 2. Normalised match (strip underscores/spaces)
        norm = candidate.lower().replace("_", "").replace(" ", "")
        for col in real_columns:
            if col.lower().replace("_", "").replace(" ", "") == norm:
                return col
        # 3. Substring match — candidate words appear in col or vice-versa
        words = set(candidate.lower().replace("_", " ").split())
        best, best_score = candidate, 0
        for col in real_columns:
            col_words = set(col.lower().replace("_", " ").split())
            score = len(words & col_words)
            if score > best_score:
                best, best_score = col, score
        return best if best_score > 0 else candidate

    # Snap hierarchy dims to real column names
    micro_dim = snap_to_real(req.micro_dim) if req.micro_dim else req.micro_dim
    meso_dim  = snap_to_real(req.meso_dim)  if req.meso_dim  else req.meso_dim
    macro_dim = snap_to_real(req.macro_dim) if req.macro_dim else req.macro_dim

    print(f"[Preflight] Snapped hierarchy: {macro_dim} → {meso_dim} → {micro_dim}")

    # Base counts for hierarchy
    selections = []
    if micro_dim: selections.append(f"COUNT(DISTINCT `{micro_dim}`) AS _micro_count")
    if meso_dim:  selections.append(f"COUNT(DISTINCT `{meso_dim}`) AS _meso_count")
    if macro_dim: selections.append(f"COUNT(DISTINCT `{macro_dim}`) AS _macro_count")
    
    # Time dimension values
    time_dim = ""
    for measure in req.measures:
        if measure.isTimeIntelligence and measure.timePeriod:
            time_dim = measure.timePeriod
            break
    if not time_dim:
        time_dim = req.trend_time_grain or next((d.id for d in req.dimensions if "time" in d.id.lower() or "month" in d.id.lower()), "")
    time_dim = snap_to_real(time_dim) if time_dim else time_dim

    if time_dim:
        selections.append(f"COUNT(DISTINCT `{time_dim}`) AS _time_count")
        selections.append(f"ARRAY_AGG(DISTINCT `{time_dim}` IGNORE NULLS ORDER BY `{time_dim}`) AS _time_values")

    # Analytical dimensions (anything non-hierarchy and non-time)
    hierarchy_set = {micro_dim, meso_dim, macro_dim, time_dim}
    analytical_dims_raw = [d for d in req.dimensions if d.id not in hierarchy_set and d.id]
    # Snap analytical dim IDs to real column names too
    analytical_dims = []
    seen = set()
    for d in analytical_dims_raw:
        snapped_id = snap_to_real(d.id)
        if snapped_id not in hierarchy_set and snapped_id not in seen:
            analytical_dims.append((snapped_id, d.label))
            seen.add(snapped_id)
    
    for idx, (dim_id, _) in enumerate(analytical_dims):
        selections.append(f"COUNT(DISTINCT `{dim_id}`) AS _dim_{idx}_count")
        selections.append(f"ARRAY_AGG(DISTINCT `{dim_id}` IGNORE NULLS ORDER BY `{dim_id}` LIMIT 100) AS _dim_{idx}_values")

    if not selections:
        return {"error": "No valid dimensions found to query."}

    sql = f"SELECT {', '.join(selections)} FROM `{bq_ref}`"

    try:
        job = bq_client.query(sql)
        row = list(job.result())[0]
        
        result = {
            "location_count": row.get("_micro_count", 0),
            "area_count": row.get("_meso_count", 0),
            "zone_count": row.get("_macro_count", 0),
            "time_dim": time_dim,
            "time_count": row.get("_time_count", 0),
            "time_values": row.get("_time_values", []),
            "analytical_dims": []
        }
        
        for idx, (dim_id, dim_label) in enumerate(analytical_dims):
            result["analytical_dims"].append({
                "id": dim_id,
                "label": dim_label,
                "count": row.get(f"_dim_{idx}_count", 0),
                "values": row.get(f"_dim_{idx}_values", [])
            })
            
        result["facts"] = [m.id for m in req.measures]
        return result
    except Exception as e:
        print(f"[Preflight] Extracted SQL: {sql}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/deep-dive/preflight-filter")
async def deep_dive_preflight_filter(req: AIExploreRequest, db: Session = Depends(database.get_db)):
    """Re-runs location count when geo filters change."""
    if not bq_client or not req.micro_dim:
        return {"location_count": 0}
        
    all_ds = db.query(models.Dataset).all()
    ds_map = { ds.id: ds.file_path for ds in all_ds if ds.file_path and not ds.file_path.startswith("http") }
    bq_ref = ds_map.get(req.dataset_id, req.dataset_id)
    
    sql = f"SELECT COUNT(DISTINCT `{req.micro_dim}`) as count FROM `{bq_ref}` WHERE 1=1 "
    if req.geo_filter_zones and req.macro_dim:
        z_str = ", ".join([f"'{z}'" for z in req.geo_filter_zones])
        sql += f" AND `{req.macro_dim}` IN ({z_str})"
    if req.geo_filter_areas and req.meso_dim:
        a_str = ", ".join([f"'{a}'" for a in req.geo_filter_areas])
        sql += f" AND `{req.meso_dim}` IN ({a_str})"
        
    try:
        row = list(bq_client.query(sql).result())[0]
        return {"location_count": row.get("count", 0)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _stream_deep_dive(req: AIExploreRequest, ds_map: dict):
    bq_ref = ds_map.get(req.dataset_id, req.dataset_id)
    macro_dim = req.macro_dim
    meso_dim = req.meso_dim
    micro_dim = req.micro_dim
    
    time_dim = ""
    for measure in req.measures:
        if measure.isTimeIntelligence and measure.timePeriod:
            time_dim = measure.timePeriod
            break
    if not time_dim:
        time_dim = req.trend_time_grain or next((d.id for d in req.dimensions if "time" in d.id.lower() or "month" in d.id.lower()), "")

    facts = req.selected_facts or [m.id for m in req.measures]
    months = req.selected_months or []

    # Filter clause
    filter_clause = "1=1"
    if req.geo_filter_zones and macro_dim:
        filter_clause += f" AND `{macro_dim}` IN ({', '.join([f'{chr(39)}{z}{chr(39)}' for z in req.geo_filter_zones])})"
    if req.geo_filter_areas and meso_dim:
        filter_clause += f" AND `{meso_dim}` IN ({', '.join([f'{chr(39)}{a}{chr(39)}' for a in req.geo_filter_areas])})"
    if months and time_dim:
        filter_clause += f" AND `{time_dim}` IN ({', '.join([f'{chr(39)}{m}{chr(39)}' for m in months])})"

    # We need combinations of dimensions
    combinations = []
    for dim_obj in req.selected_analytical_dims:
        dim_id = dim_obj.get("dim_id")
        vals = dim_obj.get("selected_values", [])
        if dim_id and vals:
            for val in vals:
                combinations.append((dim_id, val))

    if not combinations: # fallback if no analytical dims selected
        combinations = [("Total", "Overall")]

    total_runs = len(combinations) * len(facts)
    yield f"event: max_waves\ndata: {{\"total\": {total_runs}}}\n\n"

    # Step 1: Fire all BQ queries in parallel to get data slices
    async def fetch_bq(dim_id, dim_val, fact):
        if dim_id == "Total":
            dim_filter = ""
        else:
            dim_filter = f" AND `{dim_id}` = '{dim_val}'"
        
        # We need CSV format
        sql = (
            f"SELECT `{micro_dim}`, `{meso_dim}`, `{macro_dim}`, `{time_dim}`, SUM(`{fact}`) as _val "
            f"FROM `{bq_ref}` "
            f"WHERE {filter_clause} {dim_filter} "
            f"GROUP BY 1, 2, 3, 4"
        )
        
        try:
            loop = asyncio.get_event_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                def run_q():
                    return list(bq_client.query(sql).result())
                rows = await loop.run_in_executor(pool, run_q)
                
            csv_lines = [f"{micro_dim},{meso_dim},{macro_dim},{time_dim},{fact}"]
            for r in rows:
                csv_lines.append(f"{r[0]},{r[1]},{r[2]},{r[3]},{r[4]}")
            return (dim_id, dim_val, fact, chr(10).join(csv_lines))
        except Exception as e:
            return (dim_id, dim_val, fact, f"Error: {str(e)}")

    import concurrent.futures
    import httpx
    
    tasks = []
    for dim_id, dim_val in combinations:
        for fact in facts:
            tasks.append(fetch_bq(dim_id, dim_val, fact))
            
    bq_results = await asyncio.gather(*tasks)

    # Step 2: Batched Gemini Calls
    async def call_gemini_micro(dim_id, dim_val, fact, csv_data):
        if csv_data.startswith("Error"):
            return f"Error evaluating {fact} for {dim_id}={dim_val}: {csv_data}"
            
        req_micro = AIExploreRequest(
            query="Analyze this slice",
            phase="micro_slice",
            data_table=[{"csv": csv_data}], # we pass it as a generic snippet
        )
        prompt = _build_explore_prompt(req_micro)
        url = f"{GEMINI_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        body = {"contents": [{"parts": [{"text": prompt}]}]}
        
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=body)
                if res.status_code == 200:
                    text = (res.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    return f"== {dim_id}: {dim_val} | FACT: {fact} ==\\n{text}\\n\\n"
        except Exception:
            pass
        return f"== {dim_id}: {dim_val} | FACT: {fact} ==\\nAnalysis failed.\\n\\n"

    stitched = ""
    completed = 0
    
    # Process in batches of 20
    batch_size = 20
    for i in range(0, len(bq_results), batch_size):
        batch = bq_results[i:i+batch_size]
        gem_tasks = [call_gemini_micro(d, v, f, csv) for (d, v, f, csv) in batch]
        results = await asyncio.gather(*gem_tasks)
        for r in results:
            stitched += r
            
        completed += len(batch)
        yield f"event: wave_complete\ndata: {{\"completed\": {completed}, \"total\": {total_runs}}}\n\n"
        
    yield f"event: stitch_complete\ndata: {{\"message\": \"Stitched {len(bq_results)} slices.\"}}\n\n"

    # Step 3: Meso Synth
    req_meso = AIExploreRequest(query="", phase="meso", prior_output=stitched[:150000], macro_dim=macro_dim, meso_dim=meso_dim)
    meso_prompt = _build_explore_prompt(req_meso)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(f"{GEMINI_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}", json={"contents": [{"parts": [{"text": meso_prompt}]}]})
            meso_text = (res.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    except Exception as e:
        meso_text = f"Meso failed: {e}"
    
    yield f"event: meso_complete\ndata: {json.dumps({'text': meso_text})}\n\n"

    # Step 4: Macro Synth
    req_macro = AIExploreRequest(query="", phase="macro", prior_output=meso_text, macro_dim=macro_dim, meso_dim=meso_dim)
    macro_prompt = _build_explore_prompt(req_macro)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(f"{GEMINI_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}", json={"contents": [{"parts": [{"text": macro_prompt}]}]})
            macro_text = (res.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    except Exception as e:
        macro_text = f"Macro failed: {e}"
        
    yield f"event: macro_complete\ndata: {json.dumps({'text': macro_text})}\n\n"
    
    # Final Done
    final_payload = {"micro_stitched_preview": stitched[:1000], "meso": meso_text, "macro": macro_text}
    yield f"event: done\ndata: {json.dumps(final_payload)}\n\n"

@app.post("/api/ai/deep-dive")
async def deep_dive_streaming(req: AIExploreRequest, db: Session = Depends(database.get_db)):
    if not bq_client:
        raise HTTPException(status_code=500, detail="BigQuery not configured.")
    all_ds = db.query(models.Dataset).all()
    ds_map = { ds.id: ds.file_path for ds in all_ds if ds.file_path and not ds.file_path.startswith("http") }
    return StreamingResponse(_stream_deep_dive(req, ds_map), media_type="text/event-stream")

@app.post("/api/ai/dimension-trend")
async def dimension_trend(req: AIExploreRequest, db: Session = Depends(database.get_db)):
    if not bq_client:
        raise HTTPException(status_code=500, detail="BigQuery not configured.")
        
    all_ds = db.query(models.Dataset).all()
    ds_map = { ds.id: ds.file_path for ds in all_ds if ds.file_path and not ds.file_path.startswith("http") }
    bq_ref = ds_map.get(req.dataset_id, req.dataset_id)
    
    time_dim = req.trend_time_grain
    trend_dim = req.trend_dim
    facts = req.selected_facts
    
    if not time_dim or not trend_dim or not facts:
        raise HTTPException(status_code=400, detail="Missing trend dimensions or facts")

    filter_clause = "1=1"
    if req.geo_filter_zones and req.macro_dim:
        filter_clause += f" AND `{req.macro_dim}` IN ({', '.join([f'{chr(39)}{z}{chr(39)}' for z in req.geo_filter_zones])})"
    if req.geo_filter_areas and req.meso_dim:
        filter_clause += f" AND `{req.meso_dim}` IN ({', '.join([f'{chr(39)}{a}{chr(39)}' for a in req.geo_filter_areas])})"

    fact_sels = ", ".join([f"SUM(`{f}`) AS _{idx}" for idx, f in enumerate(facts)])
    sql = f"SELECT `{trend_dim}`, `{time_dim}`, {fact_sels} FROM `{bq_ref}` WHERE {filter_clause} GROUP BY 1, 2 ORDER BY 1, 2"
    
    try:
        rows = list(bq_client.query(sql).result())
        csv_lines = [f"{trend_dim},{time_dim}," + ",".join(facts)]
        for r in rows:
            line_vals = [str(r[0]), str(r[1])] + [str(r[i+2]) for i in range(len(facts))]
            csv_lines.append(",".join(line_vals))
            
        csv_data = chr(10).join(csv_lines)
        
        req_trend = AIExploreRequest(
            query="Analyze dimension trend",
            phase="dimension_trend",
            data_table=[{"csv": csv_data}],
            trend_dim=trend_dim,
            trend_time_grain=time_dim
        )
        prompt = _build_explore_prompt(req_trend)
        url = f"{GEMINI_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
            if res.status_code == 200:
                text = (res.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"text": text}
            else:
                raise HTTPException(status_code=502, detail="Gemini failed")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
