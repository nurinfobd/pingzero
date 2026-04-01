import sqlite3
db_path = 'i:/TeamZero/NMS/hosts.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT * FROM snmp_optical_logs ORDER BY created_at DESC LIMIT 5")
rows = cursor.fetchall()
for r in rows:
    print(r)
conn.close()
