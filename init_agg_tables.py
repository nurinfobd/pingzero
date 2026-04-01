import sqlite3
import os

db_path = 'i:/TeamZero/NMS/hosts.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create Hourly Aggregation Table
cursor.execute('''
  CREATE TABLE IF NOT EXISTS snmp_traffic_hourly (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    in_mbps REAL DEFAULT 0,
    out_mbps REAL DEFAULT 0,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at)
  )
''')

# Create Daily Aggregation Table
cursor.execute('''
  CREATE TABLE IF NOT EXISTS snmp_traffic_daily (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    in_mbps REAL DEFAULT 0,
    out_mbps REAL DEFAULT 0,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at)
  )
''')

conn.commit()
conn.close()
print("Tables ensured.")
