import sys
from pysnmp.hlapi import *

def test_snmp(ip, community_str, version_str, port):
    try:
        def attempt(mp_model):
            errorIndication, errorStatus, errorIndex, varBinds = next(
                getCmd(SnmpEngine(),
                       CommunityData(community_str, mpModel=mp_model),
                       UdpTransportTarget((ip, int(port)), timeout=2.5, retries=0),
                       ContextData(),
                       ObjectType(ObjectIdentity('SNMPv2-MIB', 'sysDescr', 0)))
            )
            return not (errorIndication or errorStatus)

        ok = False
        if version_str == '1':
            ok = attempt(0)
        elif version_str == '2c':
            ok = attempt(1) or attempt(0)
        else:
            ok = attempt(1)

        if ok:
            print("SUCCESS")
            sys.exit(0)
        print("ERROR")
        sys.exit(1)
    except Exception as e:
        print("ERROR")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("ERROR")
        sys.exit(1)
        
    ip = sys.argv[1]
    community = sys.argv[2]
    version = sys.argv[3]
    port = sys.argv[4]
    
    test_snmp(ip, community, version, port)
