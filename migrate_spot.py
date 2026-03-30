import os, sqlite3, json, re

# Constants
DATA_DIR = "backend/data"
DB_PATH = "dev_governance.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Map Physical Files
    print("--- STEP 1: RENAMING PHYSICAL FILES ---")
    files = os.listdir(DATA_DIR)
    for f in files:
        # Match ds_xxxxxxxx_...xlsx OR ds_ds_xxxxxxxx_...
        # We want to extract the CORE 'ds_XXXXXXXX'
        match = re.search(r'(ds_[a-f0-9]{8})', f)
        if match:
            clean_id = match.group(1) # ds_xxxxxxxx
            old_path = os.path.join(DATA_DIR, f)
            new_path = os.path.join(DATA_DIR, f"{clean_id}.xlsx")
            
            if old_path == new_path: continue

            print(f"Renaming: {f} -> {clean_id}.xlsx")
            if os.path.exists(new_path): os.remove(new_path) # Overwrite if exists
            os.rename(old_path, new_path)

    # 2. Update Datasets Table (Physical Metadata)
    print("\n--- STEP 2: UPDATING DATASETS TABLE ---")
    cursor.execute("SELECT id, file_path FROM datasets")
    for d_id, path in cursor.fetchall():
        match = re.search(r'(ds_[a-f0-9]{8})', d_id)
        if match:
            clean_id = match.group(1)
            new_path = os.path.join(DATA_DIR, f"{clean_id}.xlsx")
            print(f"Updating Dataset Record: {d_id} -> {clean_id}")
            cursor.execute("UPDATE datasets SET id=?, file_path=?, table_name=? WHERE id=?", 
                           (clean_id, new_path, clean_id, d_id))

    # 3. Update Workspace Datasets Table
    print("\n--- STEP 3: UPDATING WORKSPACE DATASETS TABLE ---")
    cursor.execute("SELECT id FROM workspace_datasets")
    for d_id, in cursor.fetchall():
        match = re.search(r'(ds_[a-f0-9]{8})', d_id)
        if match:
            clean_id = match.group(1)
            cursor.execute("UPDATE workspace_datasets SET id=?, table_name=? WHERE id=?", 
                           (clean_id, clean_id, d_id))

    # 4. Update Reports Table (JSON Payloads)
    print("\n--- STEP 4: CLEANING REPORT JSON PAYLOADS ---")
    cursor.execute("SELECT id, data FROM reports")
    for r_id, raw_data in cursor.fetchall():
        try:
            # We treat the JSON as a string for global replacements to be safe with IDs
            data_str = raw_data
            
            # Replace ds_ds_XXXXXXXX with ds_XXXXXXXX
            data_str = re.sub(r'ds_(ds_[a-f0-9]{8})', r'\1', data_str)
            
            # Replace ds_XXXXXXXX_yyyy with ds_XXXXXXXX
            # This regex looks for ds_XXXXXXXX followed by an underscore and alpha characters/desc
            # We stop at quotes, spaces, closed braces or commas
            data_str = re.sub(r'(ds_[a-f0-9]{8})_[a-zA-Z0-9_\s%]+(?=["\'\},])', r'\1', data_str)
            
            # Save back
            cursor.execute("UPDATE reports SET data=? WHERE id=?", (data_str, r_id))
            print(f"Migrated Report Payload: {r_id}")
        except Exception as e:
            print(f"Error migrating report {r_id}: {e}")

    conn.commit()
    conn.close()
    print("\n--- SPOT MIGRATION COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    migrate()
