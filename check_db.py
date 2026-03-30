import sqlite3
import os

db_path = 'dev_governance.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
else:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name, table_name, file_path FROM datasets")
        rows = cur.fetchall()
        print("Datasets in DB:")
        for r in rows:
            print(r)
    except Exception as e:
        print(f"Query Error: {e}")
    conn.close()
