import sqlite3
import subprocess
import time
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
import platform
from datetime import datetime
import random
import re
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), 'hosts.db')
NOTIFY_URL = 'http://localhost:3000/api/internal/update'

degraded_state = {}
down_message_ids = {}
degraded_message_ids = {}

def ensure_wal_mode():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
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
        print(f"Telegram error: {e}")
    return None

def ping_host(ip):
    # Determine OS-specific ping parameters
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
    timeout_val = '1000' if platform.system().lower() == 'windows' else '1'
    
    cmd = ['ping', param, '1', timeout_param, timeout_val, ip]
    start = time.time()
    
    try:
        kwargs = {}
        if platform.system().lower() == 'windows':
            # Prevent console window from popping up on Windows
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, universal_newlines=True, **kwargs)
        elapsed = (time.time() - start) * 1000
        
        # Windows ping returns 0 even on timeout sometimes, so we check for TTL
        if "TTL=" in output.upper():
            # Try to extract the exact time from ping output for better accuracy
            match = re.search(r'time[=<](\d+)', output, re.IGNORECASE)
            if match:
                elapsed = float(match.group(1))
            return True, elapsed
            
        return False, 0
    except Exception:
        return False, 0

def main():
    print("Starting High-Performance Python Ping Service...")
    ensure_wal_mode()
    while True:
        start_loop = time.time()
        
        try:
            # Connect to DB with a timeout to wait for Node.js if it's reading
            conn = sqlite3.connect(DB_PATH, timeout=10)
            conn.execute('PRAGMA busy_timeout=10000')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT * FROM hosts")
            hosts = cursor.fetchall()
            
            if hosts:
                results = []
                # Use thread pool to ping all hosts concurrently
                with ThreadPoolExecutor(max_workers=min(50, len(hosts) + 5)) as executor:
                    futures = {executor.submit(ping_host, h['ip']): h for h in hosts}
                    for future in futures:
                        h = futures[future]
                        alive, latency = future.result()
                        results.append((h, alive, latency))
                        
                has_updates = False
                
                # Update DB with results
                for h, alive, latency in results:
                    new_status = h['status']
                    fails = h['consecutive_fails']
                    last_down = h['last_down_time']
                    down_count = h['down_count'] if 'down_count' in h.keys() and h['down_count'] is not None else 0
                    
                    c_min = h['latency_min'] if h['latency_min'] is not None else 0
                    c_max = h['latency_max'] if h['latency_max'] is not None else 0
                    
                    if alive:
                        fails = 0
                        new_status = 'Up'
                        last_down = None
                        if c_min == 0 or latency < c_min: c_min = latency
                        if latency > c_max: c_max = latency
                    else:
                        fails += 1
                        if fails >= 5:
                            if new_status != 'Down':
                                down_count += 1
                            new_status = 'Down'
                            if not last_down:
                                last_down = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

                    # Telegram Notifications
                    old_status = h['status']
                    host_name = h['name']
                    host_ip = h['ip']
                    
                    if old_status != new_status:
                        if new_status == 'Down' and old_status != 'unknown':
                            msg_id = send_telegram(f"🔴 Host Down: {host_name} ({host_ip})", conn, alert_type='host_down_up')
                            if msg_id:
                                down_message_ids[h['id']] = msg_id
                            if h['id'] in degraded_state:
                                del degraded_state[h['id']]
                        elif new_status == 'Up' and old_status != 'unknown':
                            reply_to = down_message_ids.get(h['id'])
                            send_telegram(f"🟢 Host Recovered: {host_name} ({host_ip})", conn, reply_to=reply_to, alert_type='host_down_up')
                            if h['id'] in down_message_ids:
                                del down_message_ids[h['id']]
                            if h['id'] in degraded_state:
                                del degraded_state[h['id']]
                    
                    if new_status == 'Up' and alive:
                        threshold = h['latency_threshold'] if 'latency_threshold' in h.keys() and h['latency_threshold'] is not None else 100
                        is_degraded = latency > threshold
                        was_degraded = degraded_state.get(h['id'], False)
                        
                        if is_degraded and not was_degraded:
                            msg_id = send_telegram(f"🟠 Host Degraded: {host_name} ({host_ip}) - Latency: {latency:.1f}ms (threshold: {threshold}ms)", conn, alert_type='host_degraded')
                            if msg_id:
                                degraded_message_ids[h['id']] = msg_id
                            degraded_state[h['id']] = True
                        elif not is_degraded and was_degraded:
                            reply_to = degraded_message_ids.get(h['id'])
                            send_telegram(f"🟢 Host Normal: {host_name} ({host_ip}) - Latency recovered to {latency:.1f}ms", conn, reply_to=reply_to, alert_type='host_degraded')
                            if h['id'] in degraded_message_ids:
                                del degraded_message_ids[h['id']]
                            degraded_state[h['id']] = False
                    
                    # Update metrics and other fields regardless of status change
                    cursor.execute("""
                        UPDATE hosts SET 
                            status = ?, consecutive_fails = ?, down_count = ?,
                            latency_min = ?, latency_avg = ?, latency_max = ?, 
                            last_down_time = ?, last_checked = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (new_status, fails, down_count, c_min, latency if alive else 0, c_max, last_down, h['id']))
                    
                    cursor.execute("INSERT INTO ping_logs (host_id, latency, status) VALUES (?, ?, ?)", 
                                  (h['id'], latency if alive else 0, new_status))
                    has_updates = True
                    
                # Cleanup old logs (1% chance to run per tick to avoid constant overhead)
                if random.random() < 0.01:
                    cursor.execute("DELETE FROM ping_logs WHERE created_at < datetime('now', '-365 days')")
                    
                conn.commit()
                
                # Notify Node.js server via webhook so it can push to Socket.io
                if has_updates:
                    try:
                        req = urllib.request.Request(NOTIFY_URL, method='POST')
                        urllib.request.urlopen(req, timeout=1)
                    except urllib.error.URLError:
                        # Node server might be restarting or down, ignore
                        pass
                        
            conn.close()
            
        except sqlite3.Error as e:
            print(f"Database error: {e}")
        except Exception as e:
            print(f"Error in ping loop: {e}")
            
        # Ensure we run exactly every 1 second
        elapsed_loop = time.time() - start_loop
        sleep_time = max(0, 1.0 - elapsed_loop)
        time.sleep(sleep_time)

if __name__ == '__main__':
    main()
