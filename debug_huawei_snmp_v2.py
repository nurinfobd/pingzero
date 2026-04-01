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
        pass
    return results

ip = "10.199.199.137"
db_path = "i:/TeamZero/NMS/hosts.db"
output_file = "i:/TeamZero/NMS/debug_output_utf8.txt"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT community FROM snmp_devices WHERE ip=?', (ip,))
row = cursor.fetchone()
community = row[0] if row else "public"
conn.close()

with open(output_file, "w", encoding="utf-8") as f:
    f.write(f"--- Debugging Huawei {ip} (Community: {community}) ---\n")
    
    # 1. entPhysicalDescr
    f.write("\n[entPhysicalDescr - 1.3.6.1.2.1.47.1.1.1.1.2]\n")
    descrs = walk(ip, community, '1.3.6.1.2.1.47.1.1.1.1.2')
    for oid, val in descrs.items():
        f.write(f"{oid} => {val}\n")

    # 2. Optical Power (dBm*100)
    f.write("\n[Optical Rx dBm*100 - 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32]\n")
    rx = walk(ip, community, '1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32')
    for oid, val in rx.items():
        f.write(f"{oid} => {val}\n")

    # 3. Optical Power (uW)
    f.write("\n[Optical Rx uW - 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8]\n")
    rx_uw = walk(ip, community, '1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8')
    for oid, val in rx_uw.items():
        f.write(f"{oid} => {val}\n")
