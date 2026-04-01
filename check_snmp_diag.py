import sqlite3
import os
from pysnmp.hlapi import *

def check_db():
    db_path = 'hosts.db'
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    print("--- Down SNMP Devices ---")
    cur.execute("SELECT id, ip, community, version, snmp_status, consecutive_snmp_fails FROM snmp_devices WHERE snmp_status = 'Down'")
    rows = cur.fetchall()
    for row in rows:
        print(dict(row))
        # Try a quick test
        test_snmp(row['ip'], row['community'], row['version'])
    
    conn.close()

def test_snmp(ip, community, version):
    print(f"Testing {ip}...")
    mp_model = 1 if version == '2c' else 0
    engine = SnmpEngine()
    auth = CommunityData(community, mpModel=mp_model)
    transport = UdpTransportTarget((ip, 161), timeout=2, retries=1)
    
    # Try getting SysName
    errorIndication, errorStatus, errorIndex, varBinds = next(
        getCmd(engine, auth, transport, ContextData(), 
               ObjectType(ObjectIdentity('1.3.6.1.2.1.1.5.0')))
    )
    
    if errorIndication:
        print(f"  FAILED: {errorIndication}")
    elif errorStatus:
        print(f"  FAILED: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex)-1][0] or '?'}")
    else:
        print(f"  SUCCESS: {varBinds[0][1].prettyPrint()}")

if __name__ == "__main__":
    check_db()
