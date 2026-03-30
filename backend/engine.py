import duckdb
import os

def execute_query(sql: str, data_dir: str = "data"):
    conn = duckdb.connect(database=':memory:')
    try:
        cursor = conn.execute(sql)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        
        # Convert to list of dicts manually (pure python)
        results = []
        for row in rows:
            results.append(dict(zip(columns, row)))
        return results
    except Exception as e:
        print(f"DuckDB Execution Error: {e}")
        raise e
    finally:
        conn.close()

def get_table_schema(file_path: str):
    conn = duckdb.connect(database=':memory:')
    try:
        # Load extension for Excel support
        loader = f"'{file_path}'"
        if file_path.lower().endswith(('.xlsx', '.xls')):
            conn.execute("INSTALL spatial; LOAD spatial;")
            loader = f"st_read('{file_path}')"

        # Detect headers/schema using description (pure DuckDB)
        cursor = conn.execute(f"SELECT * FROM {loader} LIMIT 0")
        return [col[0] for col in cursor.description]
    except Exception as e:
        print(f"DuckDB Schema Error: {e} for {file_path}")
        raise e
    finally:
        conn.close()
