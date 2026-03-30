import sqlite3, json, re

DB_PATH = "dev_governance.db"
AUDIT_PATH = "column_audit.json"

def migrate():
    try:
        with open(AUDIT_PATH, 'r') as f:
            master_cols = json.load(f) # ds_id -> [headers]
    except:
        print("Error: column_audit.json not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, data FROM reports")
    reports = cursor.fetchall()
    
    for r_id, raw_data in reports:
        try:
            data = json.loads(raw_data)
            changed = False
            
            sm = data.get('semanticModels', {})
            if not sm: continue

            print(f"\nScanning Report: {r_id} ({data.get('name')})")
            
            # For each dataset referenced in the semantic model
            for ds_id, fields in sm.items():
                physical_headers = master_cols.get(ds_id, [])
                
                # We also need to know all OTHER datasets present in this report to find missing columns
                siblings = list(sm.keys())

                for f in fields:
                    # The literal column name in the Excel file
                    field_name = f.get('field', f.get('id', ''))
                    # Clean the field name from IDs (e.g. ds_XXXX::Year -> Year)
                    if '::' in field_name: 
                        field_name = field_name.split('::')[-1]
                    
                    # 1. GHOST CHECK: Is this field missing from its assigned table?
                    # Note: We compare case-insensitively just in case
                    header_found = any(h.lower() == field_name.lower() for h in physical_headers)
                    
                    if not header_found and field_name:
                        print(f"  ! Field '{field_name}' MISSING from Table {ds_id}")
                        
                        # 2. SEARCH SIBLINGS: Find where this field actually lives
                        for sib_id in siblings:
                            sib_headers = master_cols.get(sib_id, [])
                            if any(h.lower() == field_name.lower() for h in sib_headers):
                                actual_header = next(h for h in sib_headers if h.lower() == field_name.lower())
                                print(f"    -> RE-PARENTED: Found in {sib_id} as '{actual_header}'")
                                f['originDatasetId'] = sib_id
                                f['originFieldId'] = actual_header
                                f['isJoined'] = True
                                changed = True
                                break
            
            if changed:
                cursor.execute("UPDATE reports SET data=? WHERE id=?", (json.dumps(data), r_id))
                print(f"  √ Committing Forensic Repair for {r_id}")
                
        except Exception as e:
            print(f"Failed to forensic repair {r_id}: {e}")
            
    conn.commit()
    conn.close()
    print("\n--- FORENSIC SCHEMA ALIGNMENT COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    migrate()
