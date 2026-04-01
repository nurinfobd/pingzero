import sqlite3

def find_device():
    conn = sqlite3.connect('hosts.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Check by name or sysname
    cur.execute("SELECT * FROM snmp_devices WHERE name LIKE '%Mikrotik-1%' OR sysname_val LIKE '%Mikrotik-1%'")
    rows = cur.fetchall()
    
    if not rows:
        print("Device not found by name. Checking status 'Pending':")
        cur.execute("SELECT * FROM snmp_devices WHERE snmp_status = 'Pending'")
        rows = cur.fetchall()
        
    if not rows:
        print("No 'Pending' devices found. Listing everything:")
        cur.execute("SELECT id, name, ip, snmp_status FROM snmp_devices")
        rows = cur.fetchall()
    
    for row in rows:
        print(dict(row))
        
    conn.close()

if __name__ == "__main__":
    find_device()
