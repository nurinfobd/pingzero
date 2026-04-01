import sqlite3
db_path = 'i:/TeamZero/NMS/hosts.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- Data from hosts table ---")
cursor.execute("SELECT id, name, ip, status FROM hosts WHERE ip = '10.199.199.137'")
row = cursor.fetchone()
if row:
    print(dict(row))
else:
    print("Device not found in hosts table")

print("\n--- JOIN Test ---")
cursor.execute('''
    SELECT d.id, d.ip, d.snmp_status, h.status as ping_status
    FROM snmp_devices d
    LEFT JOIN hosts h ON d.ip = h.ip
    WHERE d.ip = '10.199.199.137'
''')
join_row = cursor.fetchone()
if join_row:
    print(dict(join_row))
else:
    print("Device not found in snmp_devices table")

conn.close()
