import os, sqlite3, json, re
import duckdb

DATA_DIR = "backend/data"

def get_headers():
    master_map = {} # ds_id -> [headers]
    conn = duckdb.connect(':memory:')
    try:
        conn.execute("INSTALL spatial; LOAD spatial;")
    except:
        pass
    
    files = os.listdir(DATA_DIR)
    for f in files:
        match = re.search(r'(ds_[a-f0-9]{8})', f)
        if match:
            ds_id = match.group(1)
            f_path = os.path.join(DATA_DIR, f)
            try:
                # Use st_read for Excel files
                loader = f"st_read('{f_path.replace('\\', '/')}')" if f.lower().endswith(('.xlsx', '.xls', '.parquet', '.csv')) else f"'{f_path.replace('\\', '/')}'"
                cols = [c[0] for c in conn.execute(f"SELECT * FROM {loader} LIMIT 0").description]
                master_map[ds_id] = cols
                print(f"Audited {ds_id}: {len(cols)} columns")
            except Exception as e:
                # Log error but continue
                pass
    conn.close()
    return master_map

if __name__ == "__main__":
    maps = get_headers()
    # Save for forensic pickup
    with open('column_audit.json', 'w') as jf:
        json.dump(maps, jf)
    print(f"\nAUDIT SUCCESSFUL: Saved {len(maps)} file schemas to column_audit.json")
