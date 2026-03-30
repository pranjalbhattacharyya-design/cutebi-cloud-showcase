import os, sqlite3, json, re, shutil
import duckdb

DATA_DIR = "backend/data"
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
# Check multiple locations for both current and legacy databases
DB_FILES = ["dev_governance.db", "backend/dev_governance.db", "cutebi.db", "backend/cutebi.db"]

def clean():
    if not os.path.exists(ARCHIVE_DIR): os.makedirs(ARCHIVE_DIR)
    
    conn_duck = duckdb.connect(':memory:')
    try: conn_duck.execute("INSTALL spatial; LOAD spatial;")
    except: pass
    
    print("\n--- PLATINUM JANITOR: STARTING SCRUB ---")
    
    # 1. Physical Scrub
    files = os.listdir(DATA_DIR)
    mapping = {} # ID -> final_parquet_path
    
    for f in files:
        if os.path.isdir(os.path.join(DATA_DIR, f)): continue
        
        # Regex to find ds_ID
        match = re.search(r'(ds_[a-f0-9]{8})', f)
        if not match: continue
        
        ds_id = match.group(1)
        src_path = os.path.join(DATA_DIR, f)
        clean_name = f"{ds_id}.parquet"
        clean_path = os.path.join(DATA_DIR, clean_name)
        
        # Check if it's legacy (XLS/CSV or descriptive name)
        is_legacy = (not f.endswith('.parquet')) or (f != clean_name)
        
        if is_legacy:
            print(f"Found Legacy/Ghost file: {f}")
            try:
                # Convert if not already done
                if not os.path.exists(clean_path):
                    loader = f"st_read('{src_path.replace('\\', '/')}')" if f.lower().endswith(('.xlsx', '.xls')) else f"'{src_path.replace('\\', '/')}'"
                    conn_duck.execute(f"COPY (SELECT * FROM {loader}) TO '{clean_path.replace('\\', '/')}' (FORMAT PARQUET)")
                    print(f"  -> Created {clean_name}")
                
                # Move original to archive
                shutil.move(src_path, os.path.join(ARCHIVE_DIR, f))
                print(f"  -> Archived {f}")
            except Exception as e:
                # If file is already archived or missing, ignore
                pass
        
        mapping[ds_id] = clean_path

    # 2. Database Reconciliation: Sync all possible SQLite files
    for db_name in DB_FILES:
        if not os.path.exists(db_name): continue
        print(f"\nReconciling database: {db_name}")
        try:
            conn_db = sqlite3.connect(db_name)
            cursor = conn_db.cursor()
            
            # Check for necessary tables
            tables = [t[0] for t in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            
            for ds_id, path in mapping.items():
                if 'datasets' in tables:
                    # Update both the file path (to .parquet) and table name (to strict ds_ID)
                    cursor.execute("UPDATE datasets SET file_path=?, table_name=? WHERE id LIKE ?", (path, ds_id, f"%{ds_id}%"))
                if 'workspace_datasets' in tables:
                    cursor.execute("UPDATE workspace_datasets SET table_name=? WHERE id LIKE ?", (ds_id, f"%{ds_id}%"))
                
            conn_db.commit()
            conn_db.close()
            print(f"  OK: Database {db_name} synchronized.")
        except Exception as e:
            print(f"  FAILED: {str(e)}")
            
    conn_duck.close()
    print("\n--- PLATINUM JANITOR: FULL SYSTEM ALIGNMENT COMPLETE ---")

if __name__ == "__main__":
    clean()
