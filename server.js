const express = require('express');
const next = require('next');
const { createServer } = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const ping = require('ping');
const crypto = require('crypto');

// Helper to parse cookies
function parseCookies(request) {
  const list = {};
  const cookieHeader = request.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });

  return list;
}

function isSqliteLockedError(err) {
  if (!err) return false;
  const message = typeof err.message === 'string' ? err.message : '';
  const code = typeof err.code === 'string' ? err.code : '';
  return (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    message.includes('database is locked') ||
    message.includes('SQLITE_BUSY') ||
    message.includes('SQLITE_LOCKED')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithSqliteRetry(fn, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 8;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? options.baseDelayMs : 50;
  const maxDelayMs = Number.isFinite(options.maxDelayMs) ? options.maxDelayMs : 1000;

  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (err) {
      if (!isSqliteLockedError(err) || attempt >= retries) {
        throw err;
      }

      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
      attempt += 1;
    }
  }
}

// Role-checking middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const cookies = parseCookies(req);
    const token = cookies.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const session = db.prepare(`
        SELECT users.role, users.username 
        FROM sessions 
        JOIN users ON sessions.user_id = users.id 
        WHERE sessions.token = ?
      `).get(token);

      if (!session || !allowedRoles.includes(session.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      req.user = session;
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  };
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();
  server.set('trust proxy', 1);
  const httpServer = createServer(server);
  const io = new Server(httpServer);

  // Middleware
  server.use(express.json({ limit: '10mb' }));
  server.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload Too Large' });
    }
    return next(err);
  });

  // Socket.io connection
  io.on('connection', (socket) => {
    // Send initial data immediately upon connection
    const hosts = db.prepare('SELECT * FROM hosts').all();
    socket.emit('hosts:update', hosts);
  });

  // API Routes
  server.get('/api/hosts', (req, res) => {
    // Get hosts and calculate how many times they went down in the last 24 hours
    const hosts = db.prepare(`
      SELECT 
        h.*,
        (
          SELECT COUNT(*) 
          FROM status_logs s 
          WHERE s.host_id = h.id 
            AND s.status = 'Down' 
            AND s.created_at >= datetime('now', '-1 day')
        ) as recent_down_count
      FROM hosts h
    `).all();
    res.json(hosts);
  });

  server.get('/api/install/status', (req, res) => {
    try {
      const row = db.prepare("SELECT v FROM settings WHERE k = 'installed'").get();
      res.json({ installed: row?.v === '1' });
    } catch (err) {
      res.json({ installed: false });
    }
  });

  server.post('/api/install', (req, res) => {
    try {
      const { admin_username, admin_password, portal_name, logo_data_url } = req.body || {};

      if (!admin_username || !admin_password) {
        return res.status(400).json({ error: 'Admin username and password are required' });
      }

      const username = String(admin_username).trim();
      const password = String(admin_password);
      const portalName = portal_name !== undefined ? String(portal_name).trim() : '';
      const logoDataUrl = logo_data_url !== undefined ? String(logo_data_url) : '';

      if (!username) {
        return res.status(400).json({ error: 'Admin username is required' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Admin password is required' });
      }

      const applyInstall = db.transaction(() => {
        const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)');
        upsertSetting.run('installed', '1');
        if (portalName) upsertSetting.run('portal_name', portalName);
        if (logoDataUrl) upsertSetting.run('portal_logo', logoDataUrl);

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing?.id) {
          db.prepare('UPDATE users SET password = ?, role = ? WHERE id = ?').run(password, 'superadmin', existing.id);
        } else {
          db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, password, 'superadmin');
        }
      });

      applyInstall();

      res.json({ success: true });
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : 'Server error';
      if (message.toLowerCase().includes('readonly') || message.includes('SQLITE_READONLY')) {
        return res.status(500).json({
          error: "Database is not writable. Fix permissions for the project folder and hosts.db, then retry.",
        });
      }
      res.status(500).json({ error: message });
    }
  });

  server.get('/api/settings/public', (req, res) => {
    try {
      const rows = db.prepare("SELECT k, v FROM settings WHERE k IN ('portal_name', 'portal_logo')").all();
      const out = {};
      for (const r of rows) out[r.k] = r.v;
      res.json(out);
    } catch (err) {
      res.json({});
    }
  });

  server.post('/api/hosts', requireRole(['write', 'superadmin']), async (req, res) => {
    const { name, ip, latency_threshold } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ error: 'Name and IP are required' });
    }
    try {
      const newHost = await runWithSqliteRetry(() => {
        const stmt = db.prepare('INSERT INTO hosts (name, ip, status, latency_threshold) VALUES (?, ?, ?, ?)');
        const info = stmt.run(name, ip, 'Pending', latency_threshold || 100);
        return db.prepare('SELECT * FROM hosts WHERE id = ?').get(info.lastInsertRowid);
      });
      
      // Emit immediately so UI updates
      const hosts = db.prepare('SELECT * FROM hosts').all();
      io.emit('hosts:update', hosts);
      
      res.json(newHost);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/hosts/:id', requireRole(['write', 'superadmin']), async (req, res) => {
    const { id } = req.params;
    try {
      await runWithSqliteRetry(() => {
        db.prepare('DELETE FROM hosts WHERE id = ?').run(id);
      });
      
      const hosts = db.prepare('SELECT * FROM hosts').all();
      io.emit('hosts:update', hosts);
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/hosts/:id', requireRole(['write', 'superadmin']), async (req, res) => {
    const { id } = req.params;
    const { name, ip, latency_threshold } = req.body;
    
    if (!name || !ip) {
      return res.status(400).json({ error: 'Name and IP are required' });
    }

    try {
      const info = await runWithSqliteRetry(() => {
        const stmt = db.prepare('UPDATE hosts SET name = ?, ip = ?, latency_threshold = ? WHERE id = ?');
        return stmt.run(name, ip, latency_threshold || 100, id);
      });
      
      if (info.changes === 0) {
        return res.status(404).json({ error: 'Host not found' });
      }

      const updatedHost = db.prepare('SELECT * FROM hosts WHERE id = ?').get(id);
      
      // Emit immediately so UI updates
      const hosts = db.prepare('SELECT * FROM hosts').all();
      io.emit('hosts:update', hosts);
      
      res.json(updatedHost);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/internal/update', (req, res) => {
    // Also include recent_down_count for socket updates
    const updatedHosts = db.prepare(`
      SELECT 
        h.*,
        (
          SELECT COUNT(*) 
          FROM status_logs s 
          WHERE s.host_id = h.id 
            AND s.status = 'Down' 
            AND s.created_at >= datetime('now', '-1 day')
        ) as recent_down_count
      FROM hosts h
    `).all();
    io.emit('hosts:update', updatedHosts);
    res.json({ success: true });
  });

  // History API
  server.get('/api/hosts/:id/history', (req, res) => {
    const { id } = req.params;
    const { range } = req.query; // 'realtime', 'daily', 'monthly', 'yearly'
    
    try {
      let query = '';
      let params = [];

      if (range === 'daily') {
        // Last 24 hours, aggregated by 15 minutes
        query = `
          SELECT 
            strftime('%Y-%m-%d %H:%M', created_at) as time,
            AVG(latency) as latency,
            MAX(status) as status -- simplistic status aggregation
          FROM ping_logs 
          WHERE host_id = ? AND created_at > datetime('now', '-1 day')
          GROUP BY strftime('%Y-%m-%d %H', created_at), (strftime('%M', created_at) / 15)
          ORDER BY created_at ASC
        `;
        params = [id];
      } else if (range === 'monthly') {
        // Last 30 days, aggregated by 6 hours
        query = `
          SELECT 
            strftime('%Y-%m-%d %H:00', created_at) as time,
            AVG(latency) as latency,
            MAX(status) as status
          FROM ping_logs 
          WHERE host_id = ? AND created_at > datetime('now', '-30 days')
          GROUP BY strftime('%Y-%m-%d', created_at), (strftime('%H', created_at) / 6)
          ORDER BY created_at ASC
        `;
        params = [id];
      } else if (range === 'yearly') {
        // Last 365 days, aggregated by day
        query = `
          SELECT 
            strftime('%Y-%m-%d', created_at) as time,
            AVG(latency) as latency,
            MAX(status) as status
          FROM ping_logs 
          WHERE host_id = ? AND created_at > datetime('now', '-365 days')
          GROUP BY strftime('%Y-%m-%d', created_at)
          ORDER BY created_at ASC
        `;
        params = [id];
      } else {
        // Realtime: Last 50 raw points
        query = 'SELECT * FROM ping_logs WHERE host_id = ? ORDER BY created_at DESC LIMIT 50';
        params = [id];
      }

      const history = db.prepare(query).all(...params);
      
      // For realtime, we need to reverse to show oldest first. Aggregated queries are already ASC.
      if (!range || range === 'realtime') {
        history.reverse();
      }

      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Status History API
  server.get('/api/hosts/:id/status-history', (req, res) => {
    const { id } = req.params;
    try {
      const history = db.prepare('SELECT * FROM status_logs WHERE host_id = ? ORDER BY created_at DESC').all(id);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SNMP Traffic History API
  server.get('/api/snmp/:deviceId/:interfaceId/history', (req, res) => {
    const { deviceId, interfaceId } = req.params;
    const { range } = req.query; // 'realtime', '24h', '40d', 'yearly'
    try {
      let query = '';
      if (range === '24h') {
        query = `
          SELECT in_mbps, out_mbps, datetime(created_at, '+6 hours') as created_at 
          FROM snmp_traffic_logs 
          WHERE device_id = ? AND interface_id = ? 
            AND created_at > datetime('now', '-24 hours') 
          ORDER BY created_at ASC
        `;
      } else if (range === 'monthly') {
        query = `
          SELECT in_mbps, out_mbps, datetime(created_at, '+6 hours') as created_at 
          FROM snmp_traffic_hourly 
          WHERE device_id = ? AND interface_id = ? 
            AND created_at > datetime('now', '-30 days') 
          ORDER BY created_at ASC
        `;
      } else if (range === 'yearly') {
        query = `
          SELECT in_mbps, out_mbps, datetime(created_at, '+6 hours') as created_at 
          FROM snmp_traffic_daily 
          WHERE device_id = ? AND interface_id = ? 
            AND created_at > datetime('now', '-365 days') 
          ORDER BY created_at ASC
        `;
      } else {
        // Real-time / Live: Last 100 points
        query = `
          SELECT in_mbps, out_mbps, datetime(created_at, '+6 hours') as created_at 
          FROM snmp_traffic_logs 
          WHERE device_id = ? AND interface_id = ? 
          ORDER BY created_at DESC 
          LIMIT 100
        `;
      }
      
      const history = db.prepare(query).all(deviceId, interfaceId);
      if (!range || range === 'realtime' || range === 'live') history.reverse();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // SNMP Optical History API
  server.get('/api/snmp/:deviceId/:interfaceId/optical-history', (req, res) => {
    const { deviceId, interfaceId } = req.params;
    const { range } = req.query;
    try {
      let query = '';
      if (range === '24h') {
        query = `SELECT rx_avg as rx_power, tx_avg as tx_power, datetime(created_at, '+6 hours') as created_at FROM snmp_optical_logs WHERE device_id = ? AND interface_id = ? AND created_at > datetime('now', '-24 hours') ORDER BY created_at ASC`;
      } else if (range === 'monthly') {
        query = `SELECT rx as rx_power, tx as tx_power, datetime(created_at, '+6 hours') as created_at FROM snmp_optical_hourly WHERE device_id = ? AND interface_id = ? AND created_at > datetime('now', '-30 days') ORDER BY created_at ASC`;
      } else if (range === 'yearly') {
        query = `SELECT rx as rx_power, tx as tx_power, datetime(created_at, '+6 hours') as created_at FROM snmp_optical_daily WHERE device_id = ? AND interface_id = ? AND created_at > datetime('now', '-365 days') ORDER BY created_at ASC`;
      } else {
        // Live / Real-time: Last 100 points
        query = `SELECT rx_power, tx_power, datetime(created_at, '+6 hours') as created_at FROM snmp_optical_logs WHERE device_id = ? AND interface_id = ? ORDER BY created_at DESC LIMIT 100`;
      }
      
      let history = db.prepare(query).all(deviceId, interfaceId);
      if (!range || range === 'live' || range === 'realtime') history.reverse();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auth Login Endpoint explicitly handled in Express to bypass Next.js routing issues
  server.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);

      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

        // Set cookie directly from Express
        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7 * 1000 // 1 week in ms
        });
        return res.status(200).json({ success: true, role: user.role });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  server.post('/api/auth/logout', (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.auth_token;
    if (token) {
      try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch (err) {
        console.error('Error deleting session:', err);
      }
    }
    res.clearCookie('auth_token');
    return res.status(200).json({ success: true });
  });

  // Get current user session info
  server.get('/api/auth/me', (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.auth_token;
    
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const session = db.prepare(`
        SELECT users.username, users.role 
        FROM sessions 
        JOIN users ON sessions.user_id = users.id 
        WHERE sessions.token = ?
      `).get(token);
      
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // User Management APIs
  server.get('/api/users', requireRole(['superadmin']), (req, res) => {
    try {
      const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/users', requireRole(['superadmin']), (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password and role are required' });
    }
    
    try {
      const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, password, role);
      const newUser = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
      res.json(newUser);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/users/:id', requireRole(['superadmin']), (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SNMP Management APIs
  server.get('/api/snmp', requireRole(['write', 'superadmin']), (req, res) => {
    try {
      const devices = db.prepare('SELECT * FROM snmp_devices').all();
      res.json(devices);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/snmp', requireRole(['write', 'superadmin']), (req, res) => {
    const { name, ip, community, version, port, device_type } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ error: 'Name and IP are required' });
    }
    
    // Test SNMP connection using Python script to avoid native dependency issues
    const { spawn } = require('child_process');
    const path = require('path');
    
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const testerPath = path.join(__dirname, 'snmp_test.py');
    
    const testProcess = spawn(pythonCmd, [testerPath, ip, community, version, port || 161]);
    
    let result = '';
    let hasResponded = false;
    
    testProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // Add a strict timeout from Node side as a fallback (4 seconds max)
    const timeoutTimer = setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        testProcess.kill();
        return res.status(400).json({ error: 'SNMP Error: Request timed out. Could not reach device or community string mismatch.' });
      }
    }, 4000);
    
    testProcess.on('close', (code) => {
      if (hasResponded) return;
      hasResponded = true;
      clearTimeout(timeoutTimer);

      if (result.trim() === 'SUCCESS') {
        try {
          const info = db.prepare(`
            INSERT INTO snmp_devices (name, ip, community, version, port, device_type) 
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(name, ip, community || 'public', version || '2c', port || 161, device_type || 'Other');
          
          const newDevice = db.prepare('SELECT * FROM snmp_devices WHERE id = ?').get(info.lastInsertRowid);
          return res.json(newDevice);
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      } else {
        return res.status(400).json({ error: 'SNMP Error: Could not connect to device. Please verify the IP, Community String, and Version.' });
      }
    });
  });

  server.put('/api/snmp/:id', requireRole(['write', 'superadmin']), (req, res) => {
    const { id } = req.params;
    const { name, ip, community, version, port, device_type } = req.body;
    
    if (!name || !ip) {
      return res.status(400).json({ error: 'Name and IP are required' });
    }

    // Test SNMP connection using Python script before updating
    const { spawn } = require('child_process');
    const path = require('path');
    
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const testerPath = path.join(__dirname, 'snmp_test.py');
    
    const testProcess = spawn(pythonCmd, [testerPath, ip, community, version, port || 161]);
    
    let result = '';
    let hasResponded = false;
    
    testProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    const timeoutTimer = setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        testProcess.kill();
        return res.status(400).json({ error: 'SNMP Error: Request timed out. Could not reach device or community string mismatch.' });
      }
    }, 4000);
    
    testProcess.on('close', (code) => {
      if (hasResponded) return;
      hasResponded = true;
      clearTimeout(timeoutTimer);

      if (result.trim() === 'SUCCESS') {
        try {
          const stmt = db.prepare('UPDATE snmp_devices SET name = ?, ip = ?, community = ?, version = ?, port = ?, device_type = ? WHERE id = ?');
          const info = stmt.run(name, ip, community || 'public', version || '2c', port || 161, device_type || 'Other', id);
          
          if (info.changes === 0) {
            return res.status(404).json({ error: 'Device not found' });
          }

          const updatedDevice = db.prepare('SELECT * FROM snmp_devices WHERE id = ?').get(id);
          return res.json(updatedDevice);
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      } else {
        return res.status(400).json({ error: 'SNMP Error: Could not connect to device. Please verify the IP, Community String, and Version.' });
      }
    });
  });

  server.get('/api/snmp/:id/interfaces', requireRole(['write', 'superadmin']), (req, res) => {
    const { id } = req.params;
    
    try {
      const device = db.prepare('SELECT * FROM snmp_devices WHERE id = ?').get(id);
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const { spawn } = require('child_process');
      const path = require('path');
      
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, 'snmp_get_interfaces.py');
      
      const processInstance = spawn(pythonCmd, [scriptPath, device.ip, device.community, device.version, device.port, device.device_type || 'Other']);
      
      let result = '';
      let hasResponded = false;
      
      processInstance.stdout.on('data', (data) => {
        result += data.toString();
      });
      
      const timeoutTimer = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          processInstance.kill();
          return res.status(400).json({ error: 'Request timed out while fetching interfaces.' });
        }
      }, 5000); // Allow up to 5 seconds to fetch interfaces
      
      processInstance.on('close', (code) => {
        if (hasResponded) return;
        hasResponded = true;
        clearTimeout(timeoutTimer);

        try {
          const parsed = JSON.parse(result);
          if (parsed.success) {
            return res.json(parsed.interfaces);
          } else {
            return res.status(400).json({ error: parsed.error || 'Failed to fetch interfaces' });
          }
        } catch (err) {
          return res.status(500).json({ error: 'Invalid response from SNMP script' });
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  server.get('/api/snmp/interfaces/stats', requireRole(['view-only', 'write', 'superadmin']), (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          s.*,
          d.name as device_name,
          d.ip as device_ip,
          d.snmp_status as device_snmp_status
        FROM snmp_interface_stats s
        JOIN snmp_devices d ON s.device_id = d.id
        ORDER BY d.name ASC, s.interface_name ASC
      `).all();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/snmp/:id/monitor', requireRole(['write', 'superadmin']), (req, res) => {
    const { id } = req.params;
    const { monitor_sysname, monitor_cpu, monitor_uptime, monitor_interfaces } = req.body;

    try {
      const stmt = db.prepare(`
        UPDATE snmp_devices 
        SET monitor_sysname = ?, monitor_cpu = ?, monitor_uptime = ?, monitor_interfaces = ?
        WHERE id = ?
      `);
      
      const interfacesStr = Array.isArray(monitor_interfaces) ? JSON.stringify(monitor_interfaces) : '[]';
      
      const info = stmt.run(
        monitor_sysname ? 1 : 0, 
        monitor_cpu ? 1 : 0, 
        monitor_uptime ? 1 : 0, 
        interfacesStr, 
        id
      );
      
      if (info.changes === 0) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const updatedDevice = db.prepare('SELECT * FROM snmp_devices WHERE id = ?').get(id);
      res.json(updatedDevice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/snmp/:id', requireRole(['write', 'superadmin']), (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM snmp_devices WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Telegram Settings APIs
  server.get('/api/settings/telegram', requireRole(['superadmin']), (req, res) => {
    try {
      const getVal = (key, defaultVal) => {
        const row = db.prepare("SELECT v FROM settings WHERE k = ?").get(key);
        return row ? row.v : defaultVal;
      };
      
      res.json({
        token: getVal('telegram_bot_token', ''),
        chatId: getVal('telegram_chat_id', ''),
        hostDownUp: getVal('tg_alert_host_down_up', '1') === '1',
        interfaceDownUp: getVal('tg_alert_interface_down_up', '1') === '1',
        interfaceUtilization: getVal('tg_alert_interface_utilization', '1') === '1',
        hostDegraded: getVal('tg_alert_host_degraded', '1') === '1'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/settings/telegram', requireRole(['superadmin']), (req, res) => {
    const { token, chatId, hostDownUp, interfaceDownUp, interfaceUtilization, hostDegraded } = req.body;
    try {
      const setVal = db.prepare("INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)");
      setVal.run('telegram_bot_token', token || '');
      setVal.run('telegram_chat_id', chatId || '');
      
      // Save booleans as '1' or '0' strings
      if (hostDownUp !== undefined) setVal.run('tg_alert_host_down_up', hostDownUp ? '1' : '0');
      if (interfaceDownUp !== undefined) setVal.run('tg_alert_interface_down_up', interfaceDownUp ? '1' : '0');
      if (interfaceUtilization !== undefined) setVal.run('tg_alert_interface_utilization', interfaceUtilization ? '1' : '0');
      if (hostDegraded !== undefined) setVal.run('tg_alert_host_degraded', hostDegraded ? '1' : '0');
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Let Next.js handle ALL API routes that aren't explicitly defined above
  server.all('/api/auth/*', (req, res) => {
    return handle(req, res);
  });

  server.all('/api/*', (req, res) => {
    return handle(req, res);
  });

  // Handle all other routes with Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    
    // Start Python Ping Worker when server starts
    const { spawn } = require('child_process');
    const path = require('path');
    
    const workerPath = path.join(__dirname, 'ping_worker.py');
    console.log(`Starting Python Ping Worker at: ${workerPath}`);
    
    // Determine the right python command based on OS
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    const pingProcess = spawn(pythonCmd, [workerPath]);
    
    pingProcess.stdout.on('data', (data) => {
      console.log(`[PING WORKER]: ${data.toString().trim()}`);
    });
    
    pingProcess.stderr.on('data', (data) => {
      console.error(`[PING WORKER ERROR]: ${data.toString().trim()}`);
    });
    
    pingProcess.on('close', (code) => {
      console.log(`[PING WORKER] exited with code ${code}`);
    });

    // ----------------------------------------------------
    // Spawn SNMP Worker with Auto-Restart
    // ----------------------------------------------------
    const snmpWorkerPath = path.join(__dirname, 'snmp_worker.py');
    console.log(`Starting Python SNMP Worker at: ${snmpWorkerPath}`);
    
    function startSnmpWorker() {
      const snmpWorker = spawn(pythonCmd, [snmpWorkerPath]);

      snmpWorker.stdout.on('data', (data) => {
        const output = data.toString();
        // Print worker output for debugging
        console.log(`[SNMP WORKER LOG]: ${output.trim()}`);
        
        if (output.includes('SNMP_CYCLE_COMPLETE')) {
          try {
            const snmpDevices = db.prepare('SELECT * FROM snmp_devices').all();
            io.emit('snmp:update', snmpDevices);
            
            const stats = db.prepare(`
              SELECT s.*, d.name as device_name, d.ip as device_ip, d.snmp_status as device_snmp_status
              FROM snmp_interface_stats s
              JOIN snmp_devices d ON s.device_id = d.id
              ORDER BY d.name ASC, s.interface_name ASC
            `).all();
            io.emit('snmp:stats', stats);
          } catch (err) {
            console.error('Error broadcasting SNMP updates:', err);
          }
        }
      });

      snmpWorker.stderr.on('data', (data) => {
        console.error(`SNMP Worker Error: ${data}`);
      });

      snmpWorker.on('close', (code) => {
        console.log(`SNMP worker exited with code ${code}. Restarting in 5s...`);
        setTimeout(startSnmpWorker, 5000);
      });
      
      return snmpWorker;
    }

    startSnmpWorker();
  });
});
