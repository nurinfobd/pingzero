const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'hosts.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

// Initialize table
db.prepare(`
  CREATE TABLE IF NOT EXISTS hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    status TEXT DEFAULT 'unknown',
    latency_min REAL DEFAULT 0,
    latency_avg REAL DEFAULT 0,
    latency_max REAL DEFAULT 0,
    consecutive_fails INTEGER DEFAULT 0,
    down_count INTEGER DEFAULT 0,
    latency_threshold INTEGER DEFAULT 100,
    last_down_time DATETIME,
    last_checked DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Safe migration for existing tables to add down_count
try {
  db.prepare('ALTER TABLE hosts ADD COLUMN down_count INTEGER DEFAULT 0').run();
} catch (err) {
  // Column already exists, ignore
}

// Initialize history table
db.prepare(`
  CREATE TABLE IF NOT EXISTS ping_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL,
    latency REAL DEFAULT 0,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(host_id) REFERENCES hosts(id) ON DELETE CASCADE
  )
`).run();

// Create index for faster querying
db.prepare('CREATE INDEX IF NOT EXISTS idx_ping_logs_host_id ON ping_logs(host_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ping_logs_created_at ON ping_logs(created_at)').run();

// Initialize status history table
db.prepare(`
  CREATE TABLE IF NOT EXISTS status_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(host_id) REFERENCES hosts(id) ON DELETE CASCADE
  )
`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_status_logs_host_id ON status_logs(host_id)').run();

// Create trigger to automatically log status changes
db.prepare(`
  CREATE TRIGGER IF NOT EXISTS log_status_change
  AFTER UPDATE OF status ON hosts
  WHEN old.status != new.status
  BEGIN
    INSERT INTO status_logs (host_id, status) VALUES (new.id, new.status);
  END;
`).run();

// Initialize users table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'view-only',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Initialize SNMP devices table
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    community TEXT DEFAULT 'public',
    version TEXT DEFAULT '2c',
    port INTEGER DEFAULT 161,
    device_type TEXT DEFAULT 'Other',
    monitor_sysname BOOLEAN DEFAULT 0,
    monitor_cpu BOOLEAN DEFAULT 0,
    monitor_uptime BOOLEAN DEFAULT 0,
    monitor_interfaces TEXT,
    sysname_val TEXT,
    cpu_val TEXT,
    uptime_val TEXT,
    interface_up_count INTEGER DEFAULT 0,
    interface_down_count INTEGER DEFAULT 0,
    snmp_status TEXT DEFAULT 'Pending',
    last_polled DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Safe migration for snmp_devices
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN monitor_sysname BOOLEAN DEFAULT 0').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN monitor_cpu BOOLEAN DEFAULT 0').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN monitor_uptime BOOLEAN DEFAULT 0').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN monitor_interfaces TEXT').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN device_type TEXT DEFAULT "Other"').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN sysname_val TEXT').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN cpu_val TEXT').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN uptime_val TEXT').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN interface_up_count INTEGER DEFAULT 0').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN interface_down_count INTEGER DEFAULT 0').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN snmp_status TEXT DEFAULT "Pending"').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN last_polled DATETIME').run(); } catch (err) {}
try { db.prepare('ALTER TABLE snmp_devices ADD COLUMN consecutive_snmp_fails INTEGER DEFAULT 0').run(); } catch (err) {}

// Initialize SNMP interface stats table
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_interface_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    interface_name TEXT NOT NULL,
    capacity_mbps REAL DEFAULT 0,
    prev_in_octets INTEGER DEFAULT 0,
    prev_out_octets INTEGER DEFAULT 0,
    current_in_mbps REAL DEFAULT 0,
    current_out_mbps REAL DEFAULT 0,
    max_in_mbps REAL DEFAULT 0,
    max_out_mbps REAL DEFAULT 0,
    last_poll_time DATETIME,
    status INTEGER DEFAULT 1,
    last_down_time DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, interface_id),
    FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
  )
`).run();

// Migrations for snmp_interface_stats
try { db.prepare('ALTER TABLE snmp_interface_stats ADD COLUMN status INTEGER DEFAULT 1').run(); } catch(e) {}
try { db.prepare('ALTER TABLE snmp_interface_stats ADD COLUMN last_down_time DATETIME').run(); } catch(e) {}
try { db.prepare('ALTER TABLE snmp_interface_stats ADD COLUMN interface_description TEXT DEFAULT ""').run(); } catch(e) {}
try { db.prepare('ALTER TABLE snmp_interface_stats ADD COLUMN rx_power REAL').run(); } catch(e) {}
try { db.prepare('ALTER TABLE snmp_interface_stats ADD COLUMN tx_power REAL').run(); } catch(e) {}


// Initialize SNMP traffic logs table for history graphs
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    in_mbps REAL DEFAULT 0,
    out_mbps REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
  )
`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_snmp_traffic_logs_lookup ON snmp_traffic_logs(device_id, interface_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_snmp_traffic_logs_time ON snmp_traffic_logs(created_at)').run();

// Initialize Hourly Aggregation Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_traffic_hourly (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    in_mbps REAL DEFAULT 0,
    out_mbps REAL DEFAULT 0,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at),
    FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
  )
`).run();

// Initialize Daily Aggregation Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_traffic_daily (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    in_mbps REAL DEFAULT 0,
    out_mbps REAL DEFAULT 0,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at),
    FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
  )
`).run();

// Initialize SNMP optical logs table
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_optical_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    rx_power TEXT, -- stored as string to handle multi-lane comma separated
    tx_power TEXT,
    rx_avg REAL,   -- helper for aggregation
    tx_avg REAL,   -- helper for aggregation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
  )
`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_snmp_optical_logs_lookup ON snmp_optical_logs(device_id, interface_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_snmp_optical_logs_time ON snmp_optical_logs(created_at)').run();

// Safe migrations for optical logs
try { db.prepare('ALTER TABLE snmp_optical_logs ADD COLUMN rx_avg REAL').run(); } catch(e) {}
try { db.prepare('ALTER TABLE snmp_optical_logs ADD COLUMN tx_avg REAL').run(); } catch(e) {}

// Aggregation tables for Optical
db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_optical_hourly (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    rx REAL,
    tx REAL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS snmp_optical_daily (
    device_id INTEGER NOT NULL,
    interface_id TEXT NOT NULL,
    rx REAL,
    tx REAL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY(device_id, interface_id, created_at)
  )
`).run();

// Initialize sessions table
db.prepare(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

// Ensure a default superadmin exists (fresh installs)
const defaultUsername = process.env.ADMIN_USER || 'pingzero';
const defaultPassword = process.env.ADMIN_PASS || 'teamzero';
db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)').run(
  defaultUsername,
  defaultPassword,
  'superadmin'
);

// Initialize settings table
db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT
  )
`).run();

// Seed initial empty Telegram credentials if not set
const tgToken = db.prepare('SELECT v FROM settings WHERE k = ?').get('telegram_bot_token');
if (!tgToken) {
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('telegram_bot_token', '');
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('telegram_chat_id', '');
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('tg_alert_host_down_up', '1');
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('tg_alert_interface_down_up', '1');
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('tg_alert_interface_utilization', '1');
  db.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('tg_alert_host_degraded', '1');
}

module.exports = db;
