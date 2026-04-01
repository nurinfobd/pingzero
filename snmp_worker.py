import sqlite3
import time
import json
import os
import logging
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# Fallback to sync for older pysnmp versions to ensure it doesn't crash on certain environments
from pysnmp.hlapi import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, getCmd, nextCmd

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Ensure we use exactly the same path as db.js (root directory)
# db.js uses 'hosts.db'
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hosts.db')

last_100_percent_alerts = {}
down_message_ids = {}

def ensure_wal_mode():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.close()
    except sqlite3.Error:
        pass

def send_telegram(msg, conn, reply_to=None, alert_type=None):
    try:
        cur = conn.cursor()
        
        if alert_type:
            cur.execute("SELECT v FROM settings WHERE k=?", (f'tg_alert_{alert_type}',))
            toggle = cur.fetchone()
            if toggle and toggle[0] == '0':
                return None
                
        cur.execute("SELECT v FROM settings WHERE k='telegram_bot_token'")
        token = cur.fetchone()
        cur.execute("SELECT v FROM settings WHERE k='telegram_chat_id'")
        chat_id = cur.fetchone()
        
        if token and token[0] and chat_id and chat_id[0]:
            url = f"https://api.telegram.org/bot{token[0]}/sendMessage"
            payload = {'chat_id': chat_id[0], 'text': msg}
            if reply_to:
                payload['reply_to_message_id'] = reply_to
            data = urllib.parse.urlencode(payload).encode('utf-8')
            req = urllib.request.Request(url, data=data)
            res = urllib.request.urlopen(req, timeout=5)
            response_data = json.loads(res.read().decode())
            if response_data.get('ok'):
                return response_data['result']['message_id']
    except Exception as e:
        logging.error(f"Telegram error: {e}")
    return None

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.execute('PRAGMA busy_timeout=10000')
    conn.row_factory = sqlite3.Row
    return conn

def fetch_snmp_data(device):
    engine = SnmpEngine()
    ip = device['ip']
    port = int(device['port'])
    community = device['community']
    version = device['version']
    device_type = device['device_type']
    mp_model = 1 if version == '2c' else 0
    auth_data = CommunityData(community, mpModel=mp_model)
    # Restored to default timeout/retries for stability
    transport = UdpTransportTarget((ip, port), timeout=2, retries=1)
    context = ContextData()

    # Track if we got ANY successful data
    any_success = False

    results = {
        'id': device['id'],
        'ip': device['ip'],
        'sysname_val': 'N/A',
        'cpu_val': 'N/A',
        'uptime_val': 'N/A',
        'interface_up_count': 0,
        'interface_down_count': 0,
        'snmp_status': 'Up',
        'interfaces': []
    }

    # 0. Fast Connectivity Check
    # Query sysDescr.0 (1.3.6.1.2.1.1.1.0) to ensure device is alive before polling everything else
    try:
        fast_transport = UdpTransportTarget((ip, port), timeout=1, retries=1)
        errInd, errStat, errIdx, vBinds = next(getCmd(engine, auth_data, fast_transport, context, ObjectType(ObjectIdentity('1.3.6.1.2.1.1.1.0'))))
        if errInd or errStat:
            logging.debug(f"Device {ip} fast check failed, assuming offline: {errInd or errStat}")
            results['snmp_status'] = 'Down'
            return results
    except Exception as e:
        logging.debug(f"Device {ip} fast check exception: {e}")
        results['snmp_status'] = 'Down'
        return results

    try:
        # 1. Fetch SysName
        if device['monitor_sysname']:
            errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, ObjectType(ObjectIdentity('1.3.6.1.2.1.1.5.0'))))
            if not errorIndication and not errorStatus:
                results['sysname_val'] = varBinds[0][1].prettyPrint()
                any_success = True
            else:
                logging.warning(f"SysName poll failed for {ip}: {errorIndication or errorStatus}")

        # 2. Fetch Uptime
        if device['monitor_uptime']:
            errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, ObjectType(ObjectIdentity('1.3.6.1.2.1.1.3.0'))))
            if not errorIndication and not errorStatus:
                ticks = int(varBinds[0][1])
                seconds = ticks / 100.0
                results['uptime_val'] = str(timedelta(seconds=int(seconds)))
                any_success = True
            else:
                logging.warning(f"Uptime poll failed for {ip}: {errorIndication or errorStatus}")

        # 3. Fetch CPU
        if device['monitor_cpu']:
            cpu_oid = '1.3.6.1.4.1.2021.11.11.0' # Default
            if device_type.lower() == 'mikrotik': cpu_oid = '1.3.6.1.2.1.25.3.3.1.2.1'
            elif device_type == 'Cisco': cpu_oid = '1.3.6.1.4.1.9.9.109.1.1.1.1.5.1'
            elif device_type.lower() == 'huawei': cpu_oid = '1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11'
            
            errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, ObjectType(ObjectIdentity(cpu_oid))))
            if not errorIndication and not errorStatus:
                results['cpu_val'] = f"{varBinds[0][1].prettyPrint()}%"
                any_success = True

        # Fetch Optical Data if MikroTik
        optical_data = {}
        if device_type.lower() == 'mikrotik':
            try:
                for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                    engine, auth_data, transport, context,
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.14988.1.1.19.1.1.2')), # Name
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.14988.1.1.19.1.1.8')), # Tx
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.14988.1.1.19.1.1.10')), # Rx
                    lexicographicMode=False
                ):
                    if errorIndication or errorStatus:
                        break
                    if len(varBinds) >= 3:
                        name = varBinds[0][1].prettyPrint()
                        try:
                            tx = float(varBinds[1][1]) / 1000.0
                            rx = float(varBinds[2][1]) / 1000.0
                            optical_data[name] = {'tx': tx, 'rx': rx}
                        except Exception:
                            pass
            except Exception as e:
                logging.error(f"Error fetching MikroTik optical data for {ip}: {e}")
        elif device_type.lower() == 'huawei':
            try:
                # Huawei: Walk Physical Entity Descriptions and Optical Power OIDs
                # Rx OID: 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32 (0.01 dBm)
                # Tx OID: 1.3.6.1.4.1.2011.5.25.31.1.1.3.1.33 (0.01 dBm)
                # Name OID: 1.3.6.1.2.1.47.1.1.1.1.2 (entPhysicalDescr)
                
                phys_map = {}
                # 1. Discovery physical entity names using entPhysicalName (1.3.6.1.2.1.47.1.1.1.1.7)
                # This OID contains the actual interface name (e.g. 25GE1/0/22) on Huawei CE switches.
                for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                    engine, auth_data, transport, context,
                    ObjectType(ObjectIdentity('1.3.6.1.2.1.47.1.1.1.1.7')), # entPhysicalName
                    lexicographicMode=False
                ):
                    if errorIndication or errorStatus: break
                    oid = str(varBinds[0][0])
                    idx = oid.split('.')[-1]
                    name = varBinds[0][1].prettyPrint()
                    phys_map[idx] = name
                
                # 2. Fetch Optical Data (Try both dBm*100 and microwatts)
                # OIDs for dBm*100: .32 (Rx), .33 (Tx)
                # OIDs for uW: .8 (Rx), .9 (Tx)
                for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                    engine, auth_data, transport, context,
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.2011.5.25.31.1.1.3.1.32')), # Rx dBm*100
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.2011.5.25.31.1.1.3.1.33')), # Tx dBm*100
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8')),  # Rx uW
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.2011.5.25.31.1.1.3.1.9')),  # Tx uW
                    lexicographicMode=False
                ):
                    if errorIndication or errorStatus: break
                    idx = str(varBinds[0][0]).split('.')[-1]
                    name = phys_map.get(idx)
                    if name:
                        try:
                            rx = None
                            tx = None
                            
                            def parse_huawei_val(val, factor):
                                try:
                                    s_val = str(val).strip()
                                    if not s_val or "No Such" in s_val: return None
                                    if ',' in s_val:
                                        # Multi-lane: convert each to dBm and keep as comma-separated string
                                        parts = s_val.split(',')
                                        results = []
                                        for p in parts:
                                            p = p.strip()
                                            if p: results.append(str(round(float(p) / factor, 2)))
                                        return ",".join(results)
                                    return round(float(s_val) / factor, 2)
                                except: return None

                            # Try dBm*100 standards OIDs first
                            rx = parse_huawei_val(varBinds[0][1], 100.0)
                            tx = parse_huawei_val(varBinds[1][1], 100.0)
                            
                            if rx is None:
                                # Fallback to uW OIDs
                                def parse_uw(val):
                                    try:
                                        s_val = str(val).strip()
                                        if not s_val or "No Such" in s_val: return None
                                        import math
                                        if ',' in s_val:
                                            parts = s_val.split(',')
                                            results = []
                                            for p in parts:
                                                p = p.strip()
                                                if p and float(p) > 0:
                                                    results.append(str(round(10 * math.log10(float(p) / 1000.0), 2)))
                                            return ",".join(results)
                                        # Single value
                                        f_val = float(s_val)
                                        if f_val > 0: return round(10 * math.log10(f_val / 1000.0), 2)
                                        return None
                                    except: return None
                                
                                rx = parse_uw(varBinds[2][1])
                                tx = parse_uw(varBinds[3][1])
                            
                            if rx is not None or tx is not None:
                                optical_data[name] = {'tx': tx, 'rx': rx}
                                clean_name = name.split(' ')[0]
                                optical_data[clean_name] = {'tx': tx, 'rx': rx}
                        except Exception: pass
            except Exception as e:
                logging.error(f"Error fetching Huawei optical data for {ip}: {e}")
        elif device_type.lower() == 'cisco':
            try:
                # Cisco: Use Entity Sensor MIB
                # 1. Physical Entity Descriptions to match sensors to interfaces
                phys_map = {}
                for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                    engine, auth_data, transport, context,
                    ObjectType(ObjectIdentity('1.3.6.1.2.1.47.1.1.1.1.2')), # entPhysicalDescr
                    lexicographicMode=False
                ):
                    if errorIndication or errorStatus: break
                    oid = str(varBinds[0][0])
                    idx = oid.split('.')[-1]
                    descr = varBinds[0][1].prettyPrint()
                    phys_map[idx] = descr

                # 2. Walk Sensor Values (1.3.6.1.4.1.9.9.91.1.1.1.1.4)
                for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                    engine, auth_data, transport, context,
                    ObjectType(ObjectIdentity('1.3.6.1.4.1.9.9.91.1.1.1.1.4')), # entSensorValue
                    lexicographicMode=False
                ):
                    if errorIndication or errorStatus: break
                    oid = str(varBinds[0][0])
                    idx = oid.split('.')[-1]
                    descr = phys_map.get(idx, "")
                    
                    if "power" in descr.lower():
                        try:
                            # Cisco DBm sensors are usually divided by 10.0
                            val = float(varBinds[0][1]) / 10.0
                            # Extract interface name from sensor description
                            # e.g. "GigabitEthernet0/1 Receive Power Sensor" -> "GigabitEthernet0/1"
                            clean_name = descr.replace("Receive Power Sensor", "").replace("Transmit Power Sensor", "").replace("RX Power Sensor", "").replace("TX Power Sensor", "").strip()
                            is_rx = "receive" in descr.lower() or "rx" in descr.lower()
                            
                            if clean_name not in optical_data: optical_data[clean_name] = {}
                            if is_rx: optical_data[clean_name]['rx'] = val
                            else: optical_data[clean_name]['tx'] = val
                        except Exception: pass
            except Exception as e:
                logging.error(f"Error fetching Cisco optical data for {ip}: {e}")

        # 4. Fetch Interfaces Status and Traffic
        interfaces_str = device['monitor_interfaces']
        interface_stats = []
        if interfaces_str and interfaces_str != '[]':
            try:
                monitored_interfaces = json.loads(interfaces_str)
                up_count = 0
                down_count = 0
                
                for iface in monitored_interfaces:
                    if isinstance(iface, dict):
                        iface_id = iface.get('id')
                        # Use provided name as fallback, but we will try to fetch better name
                        iface_name = iface.get('name', f"Interface {iface_id}")
                        capacity = float(iface.get('capacity') or 0)
                    else:
                        iface_id = iface
                        iface_name = f"Interface {iface_id}"
                        capacity = 0
                    
                    if not iface_id: continue
                    
                    if_res = {
                        'id': iface_id,
                        'name': iface_name,
                        'description': '',
                        'capacity': capacity,
                        'status': 2,
                        'in_octets': 0,
                        'out_octets': 0,
                        'rx_power': None,
                        'tx_power': None
                    }
                    
                    try:
                        # Fetch Interface Name and Status
                        # ifName(.31.1.1.1.1), ifDescr(.2.2.1.2), ifAlias(.31.1.1.1.18), ifOperStatus(.2.2.1.8)
                        oids = [
                            f'1.3.6.1.2.1.31.1.1.1.1.{iface_id}',
                            f'1.3.6.1.2.1.2.2.1.2.{iface_id}',
                            f'1.3.6.1.2.1.31.1.1.1.18.{iface_id}',
                            f'1.3.6.1.2.1.2.2.1.8.{iface_id}'
                        ]
                        
                        objs = [ObjectType(ObjectIdentity(o)) for o in oids]
                        errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, *objs))
                        
                        if not errorIndication and not errorStatus:
                            # Extract values, checking for "No Such Object" etc by string representation
                            # This is safer than importing internal pysnmp rfc1902 classes
                            vals = []
                            for i in range(len(varBinds)):
                                val = varBinds[i][1]
                                pretty = val.prettyPrint()
                                if "No Such" in pretty or "End of MIB" in pretty:
                                    vals.append(None)
                                else:
                                    vals.append(val)
                            
                            name_val = vals[0].prettyPrint() if (len(vals) > 0 and vals[0] is not None) else ''
                            descr_val = vals[1].prettyPrint() if (len(vals) > 1 and vals[1] is not None) else ''
                            alias_val = vals[2].prettyPrint() if (len(vals) > 2 and vals[2] is not None) else ''
                            status_val = int(vals[3]) if (len(vals) > 3 and vals[3] is not None) else 2
                            
                            # Logic to pick the best name:
                            best_name = iface_name # Fallback from DB
                            if name_val and not name_val.isdigit():
                                best_name = name_val
                            elif alias_val:
                                best_name = alias_val
                            elif descr_val:
                                best_name = descr_val
                                
                            if_res['name'] = best_name
                            if_res['description'] = alias_val or ''
                            if_res['status'] = status_val
                            any_success = True
                            # Try matching by any known name for optical data
                            opt = (optical_data.get(best_name) or 
                                   optical_data.get(name_val) or 
                                   optical_data.get(descr_val) or 
                                   optical_data.get(alias_val))
                            if opt:
                                if_res['rx_power'] = opt.get('rx')
                                if_res['tx_power'] = opt.get('tx')
                            if status_val == 1: up_count += 1
                            else: down_count += 1
                        else:
                            # If SNMP error, we keep default status 2 (Down)
                            if_res['status'] = 2
                            down_count += 1
                            if errorIndication:
                                logging.debug(f"SNMP error for {device['ip']} {iface_id}: {errorIndication}")
                    except Exception as e:
                        logging.error(f"Exc in status fetch for {device['ip']} {iface_id}: {e}")
                        if_res['status'] = 2 # Default to Down on exception
                        down_count += 1
                    
                    # Fetch Traffic
                    hc_oids = [ObjectType(ObjectIdentity(f'1.3.6.1.2.1.31.1.1.1.6.{iface_id}')), 
                               ObjectType(ObjectIdentity(f'1.3.6.1.2.1.31.1.1.1.10.{iface_id}'))]
                    errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, *hc_oids))
                    
                    if not errorIndication and not errorStatus:
                        if_res['in_octets'] = int(varBinds[0][1])
                        if_res['out_octets'] = int(varBinds[1][1])
                    else:
                        # Fallback to 32-bit
                        std_oids = [ObjectType(ObjectIdentity(f'1.3.6.1.2.1.2.2.1.10.{iface_id}')), 
                                    ObjectType(ObjectIdentity(f'1.3.6.1.2.1.2.2.1.16.{iface_id}'))]
                        errorIndication, errorStatus, errorIndex, varBinds = next(getCmd(engine, auth_data, transport, context, *std_oids))
                        if not errorIndication and not errorStatus:
                            if_res['in_octets'] = int(varBinds[0][1])
                            if_res['out_octets'] = int(varBinds[1][1])

                    interface_stats.append(if_res)
                
                results['interface_up_count'] = up_count
                results['interface_down_count'] = down_count
                results['interfaces'] = interface_stats
                
            except Exception as e:
                logging.error(f"Error parsing interfaces for {ip}: {str(e)}")

    except Exception as e:
        logging.error(f"Outer poll error for {ip}: {str(e)}")

    # Final status determination: If ANY OID worked, we consider it UP for connection check
    if not any_success:
        results['snmp_status'] = 'Down'
    
    return results

def poll_devices():
    # We no longer create a shared engine here
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT d.*, h.status as ping_status
        FROM snmp_devices d
        LEFT JOIN hosts h ON d.ip = h.ip
    ''')
    devices = cursor.fetchall()
    conn.close()

    if not devices:
        return

    # Process all devices in parallel to achieve real-time (1s) updates
    # Each device poll might have timeouts, so parallel is essential.
    # IMPORTANT: Always poll SNMP regardless of ping status.
    # SNMP connectivity is the authoritative source for snmp_devices status.
    # A device may block ICMP (ping) but still respond to SNMP.
    results = []
    with ThreadPoolExecutor(max_workers=min(20, len(devices) + 2)) as executor:
        futures = {}
        for device in devices:
            d_dict = dict(device)
            # Always submit SNMP poll — never skip based on ping status
            futures[executor.submit(fetch_snmp_data, d_dict)] = d_dict
        
        # Map devices for lookup
        device_map = {d['id']: dict(d) for d in devices}
        
        for future in as_completed(futures):
            results.append(future.result())

    # Update database with results
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for res in results:
        if isinstance(res, dict):
            d_dict = device_map.get(res['id'], {})
            
            # Determine status based on SNMP result — SNMP is authoritative.
            # Ping status is NOT used to override a successful SNMP response.
            # If SNMP responds OK → Up. If SNMP fails → apply 5-fail threshold.
            if res['snmp_status'] == 'Up':
                final_status = 'Up'
                consecutive_fails = 0
            else:
                consecutive_fails = d_dict.get('consecutive_snmp_fails', 0) or 0
                consecutive_fails += 1
                if consecutive_fails >= 5:
                    final_status = 'Down'
                else:
                    final_status = 'Up'  # Flapping protection: stay Up until 5 consecutive SNMP failures

            # Update device general info
            cursor.execute('''
                UPDATE snmp_devices 
                SET sysname_val = ?, cpu_val = ?, uptime_val = ?, 
                    interface_up_count = ?, interface_down_count = ?, 
                    snmp_status = ?, consecutive_snmp_fails = ?, 
                    last_polled = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (
                res['sysname_val'], res['cpu_val'], res['uptime_val'], 
                res['interface_up_count'], res['interface_down_count'], 
                final_status, consecutive_fails, res['id']
            ))

            # If device is Down, ensure all its interfaces are also marked as Down in the stats table
            if final_status == 'Down':
                cursor.execute('''
                    UPDATE snmp_interface_stats 
                    SET status = 2, 
                        last_down_time = COALESCE(last_down_time, CURRENT_TIMESTAMP),
                        current_in_mbps = 0, current_out_mbps = 0
                    WHERE device_id = ? AND status != 0 -- 0 might be "Unmonitored" or "Disabled"
                ''', (res['id'],))
                
                # Recalculate up/down counts for the device record
                cursor.execute('SELECT COUNT(*) FROM snmp_interface_stats WHERE device_id = ? AND status = 1', (res['id'],))
                up = cursor.fetchone()[0]
                cursor.execute('SELECT COUNT(*) FROM snmp_interface_stats WHERE device_id = ? AND status = 2', (res['id'],))
                down = cursor.fetchone()[0]
                
                cursor.execute('UPDATE snmp_devices SET interface_up_count = ?, interface_down_count = ? WHERE id = ?', (up, down, res['id']))

            # Update interface stats
            if 'interfaces' in res:
                for iface in res['interfaces']:
                    # Get previous data to calculate Mbps and status transitions
                    cursor.execute('''
                        SELECT prev_in_octets, prev_out_octets, last_poll_time, max_in_mbps, max_out_mbps, status, last_down_time
                        FROM snmp_interface_stats 
                        WHERE device_id = ? AND interface_id = ?
                    ''', (res['id'], iface['id']))
                    prev = cursor.fetchone()
                    
                    current_in_mbps = 0
                    current_out_mbps = 0
                    max_in_mbps = 0
                    max_out_mbps = 0
                    last_down_time = None
                    
                    if prev:
                        # Extract previous values
                        prev_in = prev['prev_in_octets'] or 0
                        prev_out = prev['prev_out_octets'] or 0
                        prev_time_str = prev['last_poll_time']
                        max_in_mbps = prev['max_in_mbps'] or 0
                        max_out_mbps = prev['max_out_mbps'] or 0
                        last_down_time = prev['last_down_time']
                        
                        # Only calculate Mbps if device is Up and we have previous data
                        if res['snmp_status'] == 'Up' and prev_time_str:
                            try:
                                prev_time = datetime.strptime(prev_time_str, '%Y-%m-%d %H:%M:%S')
                                time_diff = (datetime.now() - prev_time).total_seconds()
                                
                                if time_diff > 0:
                                    # Handle counter wrap
                                    delta_in = iface['in_octets'] - prev_in
                                    if delta_in < 0: delta_in = 0 
                                    
                                    delta_out = iface['out_octets'] - prev_out
                                    if delta_out < 0: delta_out = 0
                                    
                                    # (delta * 8 bits) / (time * 10^6 for Mbps)
                                    # (delta * 8 bits) / (time * 10^6 for Mbps)
                                    current_in_mbps = (delta_in * 8) / (time_diff * 1_000_000)
                                    current_out_mbps = (delta_out * 8) / (time_diff * 1_000_000)

                                    # Update Max with Robust Spike Guard
                                    cap = float(iface.get('capacity') or 0)
                                    # Sensible default cap for interfaces with 0 capacity (e.g. virtual)
                                    effective_cap = cap if cap > 0 else 1000.0 
                                    
                                    # Ignore unrealistic spikes (> 2x capacity or > 400G hard cap)
                                    # Also ignore if time_diff is too small to be reliable
                                    if time_diff < 1.0 or current_in_mbps > effective_cap * 2.0 or current_out_mbps > effective_cap * 2.0 or current_in_mbps > 400000:
                                        logging.warning(f"Spike detected on {res['ip']} {iface['name']}: IN={current_in_mbps:.2f}, OUT={current_out_mbps:.2f}, CAP={cap}, DT={time_diff:.2f}. Ignoring.")
                                        current_in_mbps = 0
                                        current_out_mbps = 0
                                    else:
                                        if current_in_mbps > max_in_mbps: max_in_mbps = current_in_mbps
                                        if current_out_mbps > max_out_mbps: max_out_mbps = current_out_mbps
                                    
                                    # Check Utilization Telegram Alert
                                    cap = float(iface.get('capacity') or 0)
                                    if cap > 0:
                                        utilization = ((current_in_mbps + current_out_mbps) / cap) * 100
                                        if utilization >= 99.9:
                                            key = f"{res['id']}_{iface['id']}"
                                            last_alert = last_100_percent_alerts.get(key, 0)
                                            # cooldown 10 mins (600 seconds)
                                            if time.time() - last_alert > 600:
                                                sysname = res.get('sysname_val', r"Unknown")
                                                msg = f"⚠️ Interface Max Capacity: {sysname} - {iface['name']} is at 100% utilization! ({(current_in_mbps + current_out_mbps):.1f} Mbps / {cap} Mbps)"
                                                send_telegram(msg, conn, alert_type='interface_utilization')
                                                last_100_percent_alerts[key] = time.time()
                            except Exception as e:
                                logging.error(f"Error calculating Mbps for {res['ip']} {iface['id']}: {str(e)}")

                    # Determine status and last_down_time
                    # 1 = Up, 2 = Down, 3+ = Other
                    current_status = iface['status'] if res['snmp_status'] == 'Up' else 2
                    
                    if current_status != 1: # Down
                        if not last_down_time: # Was previously Up or never set
                            last_down_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            if prev and prev['status'] == 1:
                                sysname = res.get('sysname_val', r"Unknown")
                                msg_id = send_telegram(f"🔴 Interface Down: {sysname} - {iface['name']}", conn, alert_type='interface_down_up')
                                if msg_id:
                                    key = f"{res['id']}_{iface['id']}"
                                    down_message_ids[key] = msg_id
                    else: # Up
                        if last_down_time: # Was previously down
                            sysname = res.get('sysname_val', r"Unknown")
                            key = f"{res['id']}_{iface['id']}"
                            reply_to = down_message_ids.get(key)
                            send_telegram(f"🟢 Interface Recovered: {sysname} - {iface['name']}", conn, reply_to=reply_to, alert_type='interface_down_up')
                            if key in down_message_ids:
                                del down_message_ids[key]
                        last_down_time = None

                    # Insert or Update stats
                    cursor.execute('''
                        INSERT INTO snmp_interface_stats (
                            device_id, interface_id, interface_name, interface_description, capacity_mbps,
                            prev_in_octets, prev_out_octets, 
                            current_in_mbps, current_out_mbps,
                            max_in_mbps, max_out_mbps,
                            status, last_down_time, rx_power, tx_power,
                            last_poll_time, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(device_id, interface_id) DO UPDATE SET
                            interface_name = excluded.interface_name,
                            interface_description = excluded.interface_description,
                            capacity_mbps = excluded.capacity_mbps,
                            prev_in_octets = excluded.prev_in_octets,
                            prev_out_octets = excluded.prev_out_octets,
                            current_in_mbps = excluded.current_in_mbps,
                            current_out_mbps = excluded.current_out_mbps,
                            max_in_mbps = excluded.max_in_mbps,
                            max_out_mbps = excluded.max_out_mbps,
                            status = excluded.status,
                            last_down_time = excluded.last_down_time,
                            rx_power = excluded.rx_power,
                            tx_power = excluded.tx_power,
                            last_poll_time = excluded.last_poll_time,
                            updated_at = CURRENT_TIMESTAMP
                    ''', (
                        res['id'], iface['id'], iface['name'], iface['description'], iface['capacity'],
                        iface['in_octets'], iface['out_octets'],
                        current_in_mbps, current_out_mbps,
                        max_in_mbps, max_out_mbps,
                        current_status, last_down_time,
                        iface.get('rx_power'), iface.get('tx_power'),
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    ))

                    # -------------------------------------------------------------------------
                    # LOG TRAFFIC HISTORY
                    # -------------------------------------------------------------------------
                    if res['snmp_status'] == 'Up':
                        # Insert into Traffic Logs
                        cursor.execute('''
                            INSERT INTO snmp_traffic_logs (device_id, interface_id, in_mbps, out_mbps)
                            VALUES (?, ?, ?, ?)
                        ''', (res['id'], iface['id'], current_in_mbps, current_out_mbps))

                        # Log Optical Power History if available
                        rx_val = iface.get('rx_power')
                        tx_val = iface.get('tx_power')
                        if rx_val is not None or tx_val is not None:
                            # Calculate averages for historical aggregation
                            def get_simple_avg(v):
                                if v is None: return None
                                if isinstance(v, (int, float)): return v
                                try:
                                    parts = [float(p.strip()) for p in str(v).split(',') if p.strip()]
                                    return sum(parts) / len(parts) if parts else None
                                except: return None
                                
                            rx_avg = get_simple_avg(rx_val)
                            tx_avg = get_simple_avg(tx_val)
                            
                            cursor.execute('''
                                INSERT INTO snmp_optical_logs (device_id, interface_id, rx_power, tx_power, rx_avg, tx_avg)
                                VALUES (?, ?, ?, ?, ?, ?)
                            ''', (res['id'], iface['id'], str(rx_val) if rx_val is not None else None, str(tx_val) if tx_val is not None else None, rx_avg, tx_avg))

    # Recalculate 12-hour peak for all interfaces to ensure "Max Traffic" rolls over
    # This also auto-heals any previously corrupted max values from historical spikes
    try:
        # One-time cleanup of clearly wrong data points from logs (anything > 2x capacity or > 400G)
        cursor.execute('''
            DELETE FROM snmp_traffic_logs 
            WHERE in_mbps > 400000 OR out_mbps > 400000 OR (
                EXISTS (
                    SELECT 1 FROM snmp_interface_stats s 
                    WHERE s.device_id = snmp_traffic_logs.device_id 
                      AND s.interface_id = snmp_traffic_logs.interface_id 
                      AND s.capacity_mbps > 0 
                      AND (snmp_traffic_logs.in_mbps > s.capacity_mbps * 2 OR snmp_traffic_logs.out_mbps > s.capacity_mbps * 2)
                )
            )
        ''')
        
        cursor.execute('''
            UPDATE snmp_interface_stats 
            SET max_in_mbps = (
                SELECT COALESCE(MAX(in_mbps), 0) FROM snmp_traffic_logs 
                WHERE snmp_traffic_logs.device_id = snmp_interface_stats.device_id 
                  AND snmp_traffic_logs.interface_id = snmp_interface_stats.interface_id 
                  AND created_at > datetime('now', '-12 hours')
            ),
            max_out_mbps = (
                SELECT COALESCE(MAX(out_mbps), 0) FROM snmp_traffic_logs 
                WHERE snmp_traffic_logs.device_id = snmp_interface_stats.device_id 
                  AND snmp_traffic_logs.interface_id = snmp_interface_stats.interface_id 
                  AND created_at > datetime('now', '-12 hours')
            )
        ''')
    except Exception as e:
        logging.error(f"Error updating 12h peak: {e}")

    # -------------------------------------------------------------------------
    # AGGREGATION LOGIC (For 40-day and Yearly graphs)
    # -------------------------------------------------------------------------
    try:
        # Aggregate into Hourly (Last 2 hours to keep it updated)
        cursor.execute('''
            INSERT OR REPLACE INTO snmp_traffic_hourly (device_id, interface_id, in_mbps, out_mbps, created_at)
            SELECT device_id, interface_id, AVG(in_mbps), AVG(out_mbps), strftime('%Y-%m-%d %H:00:00', created_at)
            FROM snmp_traffic_logs
            WHERE created_at > datetime('now', '-2 hours')
            GROUP BY device_id, interface_id, strftime('%Y-%m-%d %H', created_at)
        ''')
        # Aggregate into Daily (Last 2 days)
        cursor.execute('''
            INSERT OR REPLACE INTO snmp_traffic_daily (device_id, interface_id, in_mbps, out_mbps, created_at)
            SELECT device_id, interface_id, AVG(in_mbps), AVG(out_mbps), strftime('%Y-%m-%d 00:00:00', created_at)
            FROM snmp_traffic_hourly
            WHERE created_at > datetime('now', '-2 days')
            GROUP BY device_id, interface_id, strftime('%Y-%m-%d', created_at)
        ''')
        # Aggregate Optical Hourly
        cursor.execute('''
            INSERT OR REPLACE INTO snmp_optical_hourly (device_id, interface_id, rx, tx, created_at)
            SELECT device_id, interface_id, AVG(rx_avg), AVG(tx_avg), strftime('%Y-%m-%d %H:00:00', created_at)
            FROM snmp_optical_logs
            WHERE created_at > datetime('now', '-2 hours')
            GROUP BY device_id, interface_id, strftime('%Y-%m-%d %H', created_at)
        ''')
        # Aggregate Optical Daily
        cursor.execute('''
            INSERT OR REPLACE INTO snmp_optical_daily (device_id, interface_id, rx, tx, created_at)
            SELECT device_id, interface_id, AVG(rx), AVG(tx), strftime('%Y-%m-%d 00:00:00', created_at)
            FROM snmp_optical_hourly
            WHERE created_at > datetime('now', '-2 days')
            GROUP BY device_id, interface_id, strftime('%Y-%m-%d', created_at)
        ''')
    except Exception as e:
        logging.error(f"Error in traffic/optical aggregation: {e}")

    # Prune history
    # - Raw logs: 24 hours (for "24 hrs" graph)
    # - Hourly logs: 60 days (for "40 days" graph)
    # - Daily logs: 3 years (for "Yearly" graph)
    cursor.execute("DELETE FROM snmp_traffic_logs WHERE created_at < datetime('now', '-24 hours')")
    cursor.execute("DELETE FROM snmp_traffic_hourly WHERE created_at < datetime('now', '-60 days')")
    cursor.execute("DELETE FROM snmp_traffic_daily WHERE created_at < datetime('now', '-1095 days')")
    cursor.execute("DELETE FROM snmp_optical_logs WHERE created_at < datetime('now', '-30 days')")
    cursor.execute("DELETE FROM snmp_optical_hourly WHERE created_at < datetime('now', '-60 days')")
    cursor.execute("DELETE FROM snmp_optical_daily WHERE created_at < datetime('now', '-1095 days')")
    
    conn.commit()
    conn.close()

def main():
    logging.info("Starting SNMP Polling Worker...")
    ensure_wal_mode()
        
    while True:
        try:
            start_time = time.time()
            
            poll_devices()
            
            # Print a marker so Node.js knows a cycle completed (for socket.io emission)
            print("SNMP_CYCLE_COMPLETE", flush=True)
            logging.info("SNMP_CYCLE_COMPLETE")
            
            elapsed = time.time() - start_time
            sleep_time = max(5.0 - elapsed, 1.0) # Poll every 5 seconds for SNMP connection health
            time.sleep(sleep_time)
            
        except Exception as e:
            logging.error(f"Main loop error: {e}")
            time.sleep(5)

if __name__ == '__main__':
    main()
