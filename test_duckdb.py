import duckdb
conn = duckdb.connect(':memory:')
try:
    conn.execute("INSTALL excel; LOAD excel;")
    print("Excel extension installed and loaded.")
except Exception as e:
    print(f"Excel extension error: {e}")

try:
    # Test reading a sample xlsx filename (even if it doesn't exist, we check syntax)
    conn.execute("CREATE VIEW test AS SELECT * FROM st_read('test.xlsx')")
    print("st_read syntax valid")
except Exception as e:
    print(f"st_read error: {e}")

try:
    conn.execute("CREATE VIEW test2 AS SELECT * FROM read_excel('test.xlsx')")
    print("read_excel syntax valid")
except Exception as e:
    print(f"read_excel error: {e}")
