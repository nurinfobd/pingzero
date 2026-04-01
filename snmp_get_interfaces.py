import sys
import json

def get_interfaces(ip, community_str, version_str, port, device_type):
    try:
        from pysnmp.hlapi import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, nextCmd
        
        mp_model = 1 if version_str == '2c' else 0
        interfaces = []
        
        # Determine the OID to query based on device type
        if device_type == "Mikrotik":
            target_oid = '1.3.6.1.2.1.2.2.1.2' # ifDescr
        elif device_type == "Huawei":
            target_oid = '1.3.6.1.2.1.2.2.1.2' # Usually standard ifDescr works, or ifName 1.3.6.1.2.1.31.1.1.1.1
        elif device_type == "Cisco":
            target_oid = '1.3.6.1.2.1.2.2.1.2' 
        elif device_type == "Juniper":
            target_oid = '1.3.6.1.2.1.2.2.1.2'
        else:
            target_oid = '1.3.6.1.2.1.2.2.1.2' # Default to standard ifDescr

        for (errorIndication,
             errorStatus,
             errorIndex,
             varBinds) in nextCmd(SnmpEngine(),
                                  CommunityData(community_str, mpModel=mp_model),
                                  UdpTransportTarget((ip, int(port)), timeout=2.5, retries=0),
                                  ContextData(),
                                  ObjectType(ObjectIdentity(target_oid)),
                                  lexicographicMode=False):

            if errorIndication:
                print(json.dumps({"success": False, "error": str(errorIndication)}))
                sys.exit(1)
            elif errorStatus:
                print(json.dumps({"success": False, "error": errorStatus.prettyPrint()}))
                sys.exit(1)
            else:
                for varBind in varBinds:
                    oid = varBind[0]
                    val = varBind[1]
                    index = str(oid).split('.')[-1]
                    name = val.prettyPrint()
                    interfaces.append({"id": index, "name": name})

        print(json.dumps({"success": True, "interfaces": interfaces}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(json.dumps({"success": False, "error": "Missing arguments"}))
        sys.exit(1)
        
    ip = sys.argv[1]
    community = sys.argv[2]
    version = sys.argv[3]
    port = sys.argv[4]
    device_type = sys.argv[5] if len(sys.argv) > 5 else "Other"
    
    get_interfaces(ip, community, version, port, device_type)