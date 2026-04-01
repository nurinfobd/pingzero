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
output_file = "i:/TeamZero/NMS/debug_huawei_ifname.txt"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT community FROM snmp_devices WHERE ip=?', (ip,))
row = cursor.fetchone()
community = row[0] if row else "public"
conn.close()

with open(output_file, "w", encoding="utf-8") as f:
    f.write(f"--- Debugging Huawei ifName {ip} ---\n")
    
    # ifName
    f.write("\n[ifName - 1.3.6.1.2.1.31.1.1.1.1]\n")
    names = walk(ip, community, '1.3.6.1.2.1.31.1.1.1.1')
    for oid, val in list(names.items())[:50]:
        f.write(f"{oid} => {val}\n")
