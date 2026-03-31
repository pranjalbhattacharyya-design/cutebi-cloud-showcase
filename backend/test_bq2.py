import sys, os
from google.cloud import bigquery
from google.oauth2 import service_account

key_path = os.path.join(os.path.dirname(__file__), "keys", "temporal-falcon-467210-m4-9ce5c4b82d43.json")
creds = service_account.Credentials.from_service_account_file(key_path)
client = bigquery.Client(credentials=creds, project="temporal-falcon-467210-m4")

query = """
SELECT Quarter, Month_Name, COUNT(*) as c
FROM `temporal-falcon-467210-m4.cutebi_gold.Calender`
GROUP BY 1, 2
LIMIT 5
"""
results = client.query(query).result()
for row in results:
    print(dict(row))
