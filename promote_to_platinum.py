import os, sqlite3, json, re, shutil
import duckdb

DATA_DIR = "backend/data"
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
DB_PATH = "dev_governance.db"

def promote():
    if not os.path.exists(ARCHIVE_DIR): os.makedirs(ARCHIVE_DIR)
    
    conn_db = sqlite3.connect(DB_PATH)
    cursor = conn_db.cursor()
    
    conn_duck = duckdb.connect(':memory:')
    try: conn_duck.execute("INSTALL spatial; LOAD spatial;")
    except: pass
    
    files = os.listdir(DATA_DIR)
    for f in files:
        if f.endswith('.parquet') or os.path.isdir(os.path.join(DATA_DIR, f)): continue
        
        match = re.search(r'(ds_[a-f0-9]{8})', f)
        if match:
            ds_id = match.group(1)
            old_path = os.path.join(DATA_DIR, f)
            new_path = os.path.join(DATA_DIR, f"{ds_id}.parquet")
            
            # Skip if already converted
            if os.path.exists(new_path):
                # Still archive the old one if it exists
                if os.path.exists(old_path):
                     shutil.move(old_path, os.path.join(ARCHIVE_DIR, f))
                continue

            print(f"Promoting {f} to Platinum Parquet...")
            try:
                loader = f"st_read('{old_path.replace('\\', '/')}')" if f.lower().endswith(('.xlsx', '.xls')) else f"'{old_path.replace('\\', '/')}'"
                conn_duck.execute(f"COPY (SELECT * FROM {loader}) TO '{new_path.replace('\\', '/')}' (FORMAT PARQUET)")
                cursor.execute("UPDATE datasets SET file_path=? WHERE id=?", (new_path, ds_id))
                shutil.move(old_path, os.path.join(ARCHIVE_DIR, f))
                print(f"  OK: {ds_id}.parquet created.")
            except Exception as e:
                print(f"  FAILED: {str(e)}")
                
    conn_db.commit()
    conn_db.close()
    conn_duck.close()
    print("\n--- GLOBAL PLATINUM PROMOTION COMPLETED ---")

if __name__ == "__main__":
    promote()
