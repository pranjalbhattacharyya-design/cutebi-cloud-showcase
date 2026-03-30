import sqlite3, json, re

DB_PATH = "dev_governance.db"

def clean_id(raw_id):
    if not isinstance(raw_id, str): return raw_id
    # Rule 1: Eliminate double-prefix ds_ds_...
    raw_id = re.sub(r'ds_(ds_[a-f0-9]{8})', r'\1', raw_id)
    # Rule 2: Eliminate descriptive suffix ds_XXXXXXXX_...
    match = re.search(r'(ds_[a-f0-9]{8})', raw_id)
    return match.group(1) if match else raw_id

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, data FROM reports")
    reports = cursor.fetchall()
    
    for r_id, raw_data in reports:
        try:
            # We must parse the JSON to navigate the structure correctly
            data = json.loads(raw_data)
            
            # 1. datasetsMeta
            if 'datasetsMeta' in data:
                for entry in data['datasetsMeta']:
                    if 'id' in entry: entry['id'] = clean_id(entry['id'])
            
            # 2. relationships
            if 'relationships' in data:
                for rel in data['relationships']:
                    if 'fromDatasetId' in rel: rel['fromDatasetId'] = clean_id(rel['fromDatasetId'])
                    if 'toDatasetId' in rel: rel['toDatasetId'] = clean_id(rel['toDatasetId'])
            
            # 3. semanticModels (Key & Field Internal Metadata)
            if 'semanticModels' in data:
                new_models = {}
                for old_ds_id, fields in data['semanticModels'].items():
                    new_ds_id = clean_id(old_ds_id)
                    for f in fields:
                        if 'datasetId' in f: f['datasetId'] = clean_id(f['datasetId'])
                        if 'originDatasetId' in f: f['originDatasetId'] = clean_id(f['originDatasetId'])
                        # If a field's ID is the joint format dsId::fieldId, fix the dsId part
                        if '::' in f.get('id', ''):
                           parts = f['id'].split('::', 1)
                           if len(parts) == 2:
                               f['id'] = f"{clean_id(parts[0])}::{parts[1]}"
                    
                    new_models[new_ds_id] = fields
                data['semanticModels'] = new_models
            
            # Save the object back as JSON
            cursor.execute("UPDATE reports SET data=? WHERE id=?", (json.dumps(data), r_id))
            print(f"Successfully repaired metadata for report: {r_id} ({data.get('name')})")
            
        except Exception as e:
            print(f"Failed to migrate report {r_id}: {e}")
            
    conn.commit()
    conn.close()
    print("\n--- DEEP METADATA REPAIR COMPLETED ---")

if __name__ == "__main__":
    migrate()
