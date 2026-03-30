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
    """(Re-)register every parquet/xlsx file in backend/data as a DuckDB view.
    Safe to call after an upload without restarting the server."""
    global _registered_views
    if conn is None:
        conn = _get_conn()

    # On Vercel/Cloud, we typically rely on Demo Mode or Cloud Storage.
    # We avoid writing to the local app directory.
    data_dir = "backend/data"
    if os.getenv("VERCEL") or not os.path.exists(data_dir):
        # In showcase mode, we might only have pre-bundled data or none.
        if not os.path.exists(data_dir):
            return

    # Sort so .parquet overrides any stale .xlsx view for the same stem
    all_files = sorted(os.listdir(data_dir), key=lambda x: 1 if x.endswith('.parquet') else 0)
    registered = set()

    for filename in all_files:
        file_path = os.path.join(data_dir, filename)
        if os.path.isdir(file_path) or '_temp.' in filename:
            continue

        canonical_name = os.path.splitext(filename)[0]

        if filename.endswith('.parquet'):
            loader = f"read_parquet('{file_path.replace(chr(92), '/')}')"
        elif filename.lower().endswith(('.xlsx', '.xls')):
            loader = f"st_read('{file_path.replace(chr(92), '/')}')"
        elif filename.lower().endswith('.csv'):
            loader = f"read_csv_auto('{file_path.replace(chr(92), '/')}')"
        else:
            continue

        try:
            conn.execute(f'CREATE OR REPLACE VIEW "{canonical_name}" AS SELECT * FROM {loader}')
            registered.add(canonical_name)
        except Exception as e:
            print(f"[Engine] Could not register view '{canonical_name}': {e}")

    # 2. Register Cloud-Hosted Datasets from Database
    db = database.SessionLocal()
    try:
        cloud_datasets = db.query(models.Dataset).all()
        for ds in cloud_datasets:
            if ds.file_path.startswith("http"):
                try:
                    conn.execute(f'CREATE OR REPLACE VIEW "{ds.id}" AS SELECT * FROM read_parquet(\'{ds.file_path}\')')
                    registered.add(ds.id)
                except Exception as e:
                    print(f"[Engine] Could not register cloud view '{ds.id}': {e}")
    finally:
        db.close()

    _registered_views = registered
    print(f"[Engine] Views refreshed — {len(registered)} active: {sorted(registered)}")


app = FastAPI(title="CuteBI Cloud Showcase")

@app.on_event("startup")
async def startup_event():
    """Eagerly initialize the persistent DuckDB connection at server startup.
    This warms up views so the first user query is not cold."""
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
    # We seed if it's a fresh cloud instance (Vercel) or memory DB
    db = database.SessionLocal()
    try:
        if os.getenv("VERCEL") or ":memory:" in str(database.engine.url):
             seed_demo_data(db)
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
def create_workspace(workspace: dict, db: Session = Depends(database.get_db)):
    # Duplicate check
    existing = db.query(models.Workspace).filter(models.Workspace.name == workspace.get("name"), models.Workspace.is_deleted == False).first()
    if existing:
        raise HTTPException(status_code=400, detail="Workspace name already exists")
    
    print(f"Adding new workspace: {workspace.get('name')} with ID {workspace.get('id')}")
    db_workspace = models.Workspace(
        id=workspace.get("id"),
        name=workspace.get("name"),
        description=workspace.get("description"),
        is_deleted=False
    )
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    print(f"Committed workspace: {db_workspace.name}")
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
def create_folder(folder: dict, db: Session = Depends(database.get_db)):
    # Duplicate check
    existing = db.query(models.Folder).filter(
        models.Folder.name == folder.get("name"), 
        models.Folder.workspace_id == folder.get("workspace_id"),
        models.Folder.parent_id == folder.get("parent_id"),
        models.Folder.is_deleted == False
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Folder name already exists in this location")

    print(f"Adding new folder: {folder.get('name')} with ID {folder.get('id')}")
    db_folder = models.Folder(
        id=folder.get("id"),
        name=folder.get("name"),
        workspace_id=folder.get("workspace_id"),
        parent_id=folder.get("parent_id"),
        is_deleted=False
    )
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    print(f"Committed folder: {db_folder.name}")
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
        # Pull live sample_data + original_file_name from the Dataset catalog
        catalog_entry = db.query(models.Dataset).filter(models.Dataset.id == ws_ds.id).first()
        if catalog_entry:
            row["original_file_name"] = catalog_entry.original_file_name
            row["headers"] = catalog_entry.headers or ws_ds.headers or []
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
        
        # 2. Platinum Transformation: XLSX/CSV -> Parquet using a temp connection
        import duckdb as _duckdb_tmp
        conv_conn = _duckdb_tmp.connect(':memory:')
        if extension in ['xlsx', 'xls']:
            try: conv_conn.execute("INSTALL spatial; LOAD spatial;")
            except: pass
            loader = f"st_read('{temp_path}', open_options=['HEADERS=FORCE'])"
        else:
            loader = f"'{temp_path}'"
        
        conv_conn.execute(f"COPY (SELECT * EXCLUDE (OGC_FID) FROM {loader}) TO '{final_path}' (FORMAT PARQUET)")
        headers = [c[0] for c in conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 0").description]
        sample_rows = conv_conn.execute(f"SELECT * FROM '{final_path}' LIMIT 5").fetchall()
        sample_data = [dict(zip(headers, row)) for row in sample_rows]
        conv_conn.close()
        
        # 3. Cloud Extraction: Upload Parquet to Supabase Storage
        public_url = final_path
        if supabase_client:
            try:
                print(f"[Storage] Uploading {ds_id}.parquet to {STORAGE_BUCKET}...")
                with open(final_path, "rb") as f:
                    supabase_client.storage.from_(STORAGE_BUCKET).upload(
                        path=f"{ds_id}.parquet",
                        file=f,
                        file_options={"upsert": "true", "content-type": "application/octet-stream"}
                    )
                # Get Public URL (Assumes bucket is Public)
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{ds_id}.parquet"
                print(f"[Storage] Uploaded! Public URL: {public_url}")
            except Exception as e:
                print(f"[Storage] Upload failed: {e}")
                # Fallback to local path (which will be temporary)
        
        # 4. Refresh persistent engine so the new view is queryable
        with _db_lock:
             # Manually register the new parquet view immediately
             conn = _get_conn()
             conn.execute(f'CREATE OR REPLACE VIEW "{ds_id}" AS SELECT * FROM read_parquet(\'{public_url}\')')
             _registered_views.add(ds_id)
        
        # 5. Register in Catalog (Upsert)
        db_dataset = db.query(models.Dataset).filter(models.Dataset.id == ds_id).first()
        if db_dataset:
            import time
            db_dataset.name = ds_id
            db_dataset.original_file_name = file.filename
            db_dataset.file_path = public_url
            db_dataset.table_name = ds_id
            db_dataset.headers = headers
            db_dataset.timestamp = time.time()
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
            "engine": "Platinum/Cloud"
        }
    except Exception as e:
        print(f"Platinum Conversion Failed: {str(e)}")
        if os.path.exists(final_path): os.remove(final_path)
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

    with _db_lock:
        conn = _get_conn()
        view_list = sorted(_registered_views)
        try:
            cursor = conn.execute(sql)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            results = [dict(zip(columns, row)) for row in rows]
            return {"data": results, "active_views": view_list}
        except Exception as sql_err:
            error_msg = str(sql_err)
            print(f" [Backend Query] SQL Execution FAILED: {error_msg}")
            return {"error": error_msg, "sql": sql, "active_views": view_list}


@app.get("/api/engine/status")
def engine_status():
    """Dev endpoint — returns what views the persistent engine has registered."""
    return {"active_views": sorted(_registered_views), "engine": "persistent-duckdb"}


