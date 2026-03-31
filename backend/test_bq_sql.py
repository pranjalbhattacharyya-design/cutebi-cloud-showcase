import os
from google.cloud import bigquery
from google.oauth2 import service_account

key_path = os.path.join(os.path.dirname(__file__), "keys", "temporal-falcon-467210-m4-9ce5c4b82d43.json")
if not os.path.exists(key_path):
    print("No BQ credentials found locally. Cannot test.")
    exit(1)

creds = service_account.Credentials.from_service_account_file(key_path)
client = bigquery.Client(credentials=creds, project="temporal-falcon-467210-m4")

# Test 1: Let's see Calender data directly
query1 = """
SELECT `Quarter`, `Month_Name`, COUNT(*) as count 
FROM `temporal-falcon-467210-m4.cutebi_gold.Calender`
GROUP BY 1, 2
LIMIT 5
"""

print("--- Calender Data Sample ---")
try:
    results1 = list(client.query(query1).result())
    for r in results1: print(dict(r))
except Exception as e:
    print(f"Error querying Calender: {e}")

# Test 2: The exact CTE and slicer query
query2 = """
WITH ds_unified AS (
  SELECT `Calender`.*, `Insights`.* EXCEPT (`Calender_Key`) 
  FROM `temporal-falcon-467210-m4.cutebi_gold.Calender` AS `Calender` 
  LEFT JOIN `temporal-falcon-467210-m4.cutebi_gold.Insights` AS `Insights` 
    ON `Calender`.`Calender_Key` = `Insights`.`Calender_Key`
) 
SELECT `ds_unified`.`FY` AS `FY`, `ds_unified`.`Quarter` AS `Quarter`, SUM(`ds_unified`.`Enquiry`) AS `Enquiry` 
FROM `ds_unified` 
WHERE `ds_unified`.`Month_Name` IN ('April') 
GROUP BY 1, 2
"""

print("\n--- Unified Query with Slicer ---")
try:
    results2 = list(client.query(query2).result())
    print(f"Returned {len(results2)} rows:")
    for r in results2: print(dict(r))
except Exception as e:
    print(f"Error executing unified query: {e}")

# Test 3: What if we query with IN (1) just in case Quarter is INT64 and the user pressed 1?
query3 = """
SELECT `Quarter`, COUNT(*) as c
FROM `temporal-falcon-467210-m4.cutebi_gold.Calender`
WHERE `Quarter` IN ('1', 'Q1', 1)
GROUP BY 1
LIMIT 5
"""
print("\n--- Quarter Slicer Types ---")
try:
    results3 = list(client.query(query3).result())
    for r in results3: print(dict(r))
except Exception as e:
    print(f"Error on Quarter types: {e}")
