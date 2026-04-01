const Database = require('better-sqlite3');
const db = new Database('hosts.db');

try {
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(device_id, interface_id),
      FOREIGN KEY(device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE
    )
  `).run();
  console.log('SUCCESS: Table snmp_interface_stats exists');
} catch (err) {
  console.error('ERROR:', err);
}
db.close();
