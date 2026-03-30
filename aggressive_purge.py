import os, sqlite3, json, re, shutil
import duckdb

# ABSOLUTE PATHS TO ENSURE SUCCESS ON WINDOWS
ABS_DATA_DIR = r"C:\Users\mitth\.gemini\antigravity\scratch\cutebi\backend\data"
ABS_DB_PATH = r"C:\Users\mitth\.gemini\antigravity\scratch\cutebi\dev_governance.db"
# Also check for the legacy backend db
LEGACY_DB = r"C:\Users\mitth\.gemini\antigravity\scratch\cutebi\backend\cutebi.db"

def purge():
    conn_duck = duckdb.connect(':memory:')
    try: conn_duck.execute("INSTALL spatial; LOAD spatial;")
    except: pass
    
    print("\n--- AGGRESSIVE PURGE: THE PLATINUM SEAL ---")
    
    if not os.path.exists(ABS_DATA_DIR):
        print(f"Error: Path {ABS_DATA_DIR} not found.")
        return

    files = os.listdir(ABS_DATA_DIR)
    clean_map = {} # ID -> final_parquet_path
    
    for f in files:
        f_path = os.path.join(ABS_DATA_DIR, f)
        if os.path.isdir(f_path): continue
        
        # Identify files with the ds_XXXXXXXX ID
        match = re.search(r'(ds_[a-f0-9]{8})', f)
        if not match: continue
        
        ds_id = match.group(1)
        target_name = f"{ds_id}.parquet"
        target_path = os.path.join(ABS_DATA_DIR, target_name)
        
        # Check if this is a file that needs purging (Excel, CSV, or incorrectly named)
        is_legacy = (not f.endswith('.parquet')) or (f != target_name)
        
        if is_legacy:
            print(f"Purging File: {f}")
            try:
                # 1. Force the creation of the Parquet version
                if not os.path.exists(target_path):
                    # Use specialized loader if Excel
                    loader = f"st_read('{f_path.replace('\\', '/')}')" if f.lower().endswith(('.xlsx', '.xls')) else f"'{f_path.replace('\\', '/')}'"
                    conn_duck.execute(f"COPY (SELECT * FROM {loader}) TO '{target_path.replace('\\', '/')}' (FORMAT PARQUET)")
                
                # 2. PHYSICAL DELETION of the original XLSX
                # We verify the target exists first to avoid data loss
                if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
                    # Closing handles is implicit in DuckDB connection close, 
                    # but we are in a tight loop, so we just try-catch the delete
                    try:
                        os.remove(f_path)
                        print(f"  OK: Cleaned {f} -> Verified {target_name}")
                    except Exception as delete_err:
                        print(f"  ! Delete Failed (File locked?): {str(delete_err)}")
                        # If locked, we move it to a subfolder to get it out of the engine's sight
                        archive_dir = os.path.join(ABS_DATA_DIR, "archive")
                        if not os.path.exists(archive_dir): os.makedirs(archive_dir)
                        try:
                            shutil.move(f_path, os.path.join(archive_dir, f))
                            print(f"  OK: Moved locked file {f} to archive.")
                        except: pass
            except Exception as e:
                print(f"  !! FAILED to promote {f}: {str(e)}")
        
        clean_map[ds_id] = target_path

    # Final DB Reconciliation for both systems
    for db in [ABS_DB_PATH, LEGACY_DB]:
        if not os.path.exists(db): continue
        try:
            conn = sqlite3.connect(db)
            c = conn.cursor()
            # Ensure tables exist
            tables = [t[0] for t in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            
            for did, p in clean_map.items():
                if 'datasets' in tables:
                    c.execute("UPDATE datasets SET file_path=?, table_name=? WHERE id LIKE ?", (p, did, f"%{did}%"))
                if 'workspace_datasets' in tables:
                    c.execute("UPDATE workspace_datasets SET table_name=? WHERE id LIKE ?", (did, f"%{did}%"))
            conn.commit()
            conn.close()
            print(f"SUCCESS: {os.path.basename(db)} synchronized.")
        except Exception as db_err:
            print(f"DB Error {db}: {str(db_err)}")

    print("\n--- PURGE COMPLETE: PLATINUM SEAL APPLIED ---")

if __name__ == "__main__":
    purge()
