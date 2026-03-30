import sqlite3
import os

DB_PATH = 'dev_governance.db'
DATA_DIR = 'backend/data'

def cleanup_ghosts():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Get the list of IDs that SHOULD exist (from physical files)
    # We remove the .parquet extension to get the canonical ID
    valid_ids = [os.path.splitext(f)[0] for f in os.listdir(DATA_DIR) if f.endswith('.parquet')]
    print(f"Valid IDs from folder: {valid_ids}")

    # 2. Get all active workspace datasets
    cur.execute("SELECT id, name FROM workspace_datasets WHERE is_deleted = 0")
    ws_datasets = cur.fetchall()

    ghost_ids = []
    for ds_id, ds_name in ws_datasets:
        if ds_id not in valid_ids:
            ghost_ids.append((ds_id, ds_name))

    if not ghost_ids:
        print("No ghost entries found in Workspace Library.")
    else:
        print(f"Found {len(ghost_ids)} ghost entries to clean:")
        for ds_id, ds_name in ghost_ids:
            print(f" - {ds_name} (ID: {ds_id})")

        # 3. Targeted soft-delete
        # We only delete the IDs that aren't in the folder
        placeholders = ','.join(['?'] * len(ghost_ids))
        target_ids = [g[0] for g in ghost_ids]
        
        cur.execute(f"UPDATE workspace_datasets SET is_deleted = 1 WHERE id IN ({placeholders})", target_ids)
        conn.commit()
        print(f"\nSuccessfully soft-deleted {len(ghost_ids)} ghost entries.")

    conn.close()

if __name__ == "__main__":
    cleanup_ghosts()
