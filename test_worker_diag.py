import sqlite3
import json
import os
from datetime import datetime
from snmp_worker import fetch_snmp_data, SnmpEngine

DB_PATH = 'hosts.db'

def test():
    engine = SnmpEngine()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM snmp_devices LIMIT 1')
    device = cursor.fetchone()
    if not device:
        print("No SNMP devices found")
        return

    print(f"Testing device: {device['name']} ({device['ip']})")
    
    try:
        results = fetch_snmp_data(engine, dict(device))
        print("Fetch results keys:", results.keys())
        if 'interfaces' in results:
            print(f"Found {len(results['interfaces'])} interfaces")
            for iface in results['interfaces']:
                print(f" - {iface['name']} (ID: {iface['id']}): Status={iface['status']}, In={iface['in_octets']}")
        
        # Try a mock update to see if logic works
        if 'interfaces' in results:
            res = results
            for iface in results['interfaces']:
                cursor.execute('SELECT prev_in_octets FROM snmp_interface_stats WHERE device_id = ? AND interface_id = ?', (res['id'], iface['id']))
                prev = cursor.fetchone()
                print(f"Previous data for {iface['id']}: {prev}")
                
                # Mock Mbps calc and Insert
                cursor.execute('''
                    INSERT INTO snmp_interface_stats (device_id, interface_id, interface_name, capacity_mbps, prev_in_octets, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(device_id, interface_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                ''', (res['id'], iface['id'], iface['name'], iface['capacity'], iface['in_octets']))
                print(f"Inserted/Updated {iface['id']}")
            
            conn.commit()
            print("Commit successful")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    test()
