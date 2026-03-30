import duckdb
import os
from pathlib import Path

# Mock setup
data_dir = "backend/data"
filename = "Fact Sale.xlsx" 
# Just pick one that exists
if not os.path.exists(data_dir):
    os.makedirs(data_dir)

# Create a dummy parquet file
dummy_path = os.path.join(data_dir, "Fact Sale.parquet")
conn = duckdb.connect(':memory:')
conn.execute("CREATE TABLE dummy (FY VARCHAR, Quarter VARCHAR, Net_Retail DOUBLE)")
conn.execute("INSERT INTO dummy VALUES ('2026', 'Q1', 100.0)")
conn.execute(f"COPY dummy TO '{dummy_path.replace('\\', '/')}' (FORMAT PARQUET)")

canonical_name = os.path.splitext(filename)[0]
loader = f"'{dummy_path.replace('\\', '/')}'"

print(f"Registering view: {canonical_name} as {loader}")
conn.execute(f"CREATE OR REPLACE VIEW \"{canonical_name}\" AS SELECT * FROM {loader}")

view_list = conn.execute("SELECT name FROM duckdb_views()").fetchall()
print(f"Current views: {view_list}")

try:
    sql = f'SELECT "Fact Sale"."FY" FROM "Fact Sale"'
    print(f"Executing: {sql}")
    res = conn.execute(sql).fetchall()
    print(f"Success: {res}")
except Exception as e:
    print(f"FAILED: {e}")

conn.close()
if os.path.exists(dummy_path): os.remove(dummy_path)
