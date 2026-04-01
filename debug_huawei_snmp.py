import logging
from pysnmp.hlapi import *
import sqlite3
import os

def walk(ip, community, oid_str):
    results = {}
    try:
        for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
            SnmpEngine(),
            CommunityData(community),
            UdpTransportTarget((ip, 161), timeout=2, retries=1),
            ContextData(),
            ObjectType(ObjectIdentity(oid_str)),
            lexicographicMode=False
        ):
            if errorIndication or errorStatus:
                break
            for varBind in varBinds:
                results[str(varBind[0])] = varBind[1].prettyPrint()
    except Exception as e:
        print(f"Error walking {oid_str}: {e}")
    return results

ip = "10.199.199.137"
db_path = "i:/TeamZero/NMS/hosts.db"

if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT community FROM snmp_devices WHERE ip=?', (ip,))
row = cursor.fetchone()
community = row[0] if row else "public"
conn.close()

print(f"--- Debugging Huawei {ip} (Community: {community}) ---")

# 1. entPhysicalDescr
print("\n[entPhysicalDescr - 1.3.6.1.2.1.47.1.1.1.1.2]")
descrs = walk(ip, community, '1.3.6.1.2.1.47.1.1.1.1.2')
for oid, val in list(descrs.items()):
    print(f"{oid} => {val}")

# 2. Optical Power (dBm*100)
print("\n[Optical Rx dBm*100 - 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32]")
rx = walk(ip, community, '1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32')
for oid, val in rx.items():
    print(f"{oid} => {val}")

# 3. Optical Power (uW)
print("\n[Optical Rx uW - 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8]")
rx_uw = walk(ip, community, '1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8')
for oid, val in rx_uw.items():
    print(f"{oid} => {val}")
