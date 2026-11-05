// server.js - Node.js Server for Genealogy Tree Platform
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const BE_PORT = process.env.BE_PORT || 3000;
const FE_PORT = process.env.FE_PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'current_lineage.json');
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'default_lineage.json');
const SAMPLE_LINEAGE_FILE = path.join(DATA_DIR, 'sample_lineage.json');
const LINEAGE_DATA_DIR = path.join(DATA_DIR, 'lineage_data');
const XLSX_TEMPLATE = path.join(__dirname, 'genealogy_template.xlsx');
const CSV_TEMPLATE = path.join(__dirname, 'Danh_Sach_Gia_Pha_Day_Du.csv');

// ─── Access Control Data Files ───────────────────────────────────────────────
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LINEAGES_FILE = path.join(DATA_DIR, 'lineages.json');
const LINEAGE_ACCESS_FILE = path.join(DATA_DIR, 'lineage_access.json');
const SHARE_LINKS_FILE = path.join(DATA_DIR, 'share_links.json');
const SHARE_CODES_FILE = path.join(DATA_DIR, 'share_codes.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PENDING_CHANGES_FILE = path.join(DATA_DIR, 'pending_changes.json');
const EDIT_REQUESTS_FILE = path.join(DATA_DIR, 'edit_requests.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// ─── Default Lineage ID ──────────────────────────────────────────────────────
const DEFAULT_LINEAGE_ID = 'default';

// ─── Initialize Data ─────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE) && fs.existsSync(DEFAULT_DATA_FILE)) {
  fs.copyFileSync(DEFAULT_DATA_FILE, DATA_FILE);
}

// Atomic JSON read/write helpers
const readJSON = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
};

const writeJSON = (filePath, data) => {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
};

// ─── Per-Lineage Data Helpers ──────────────────────────────────────────────────
const getLineageDataFile = (lineageId) => {
  return path.join(LINEAGE_DATA_DIR, `${lineageId}.json`);
};

const getLineageData = (lineageId) => {
  const file = getLineageDataFile(lineageId);
  return readJSON(file);
};

const saveLineageData = (lineageId, data) => {
  const file = getLineageDataFile(lineageId);
  writeJSON(file, data);
};

// Bootstrap access control data files
const bootstrapAccessData = () => {
  if (!fs.existsSync(USERS_FILE)) {
    writeJSON(USERS_FILE, []);
  }
  if (!fs.existsSync(LINEAGES_FILE)) {
    writeJSON(LINEAGES_FILE, [{
      id: DEFAULT_LINEAGE_ID,
      admin_id: null,
      name: 'Gia Phả Mặc Định',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
  }
  if (!fs.existsSync(LINEAGE_ACCESS_FILE)) {
    writeJSON(LINEAGE_ACCESS_FILE, []);
  }
  if (!fs.existsSync(SHARE_LINKS_FILE)) {
    writeJSON(SHARE_LINKS_FILE, []);
  }
  if (!fs.existsSync(SHARE_CODES_FILE)) {
    writeJSON(SHARE_CODES_FILE, []);
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    writeJSON(SESSIONS_FILE, []);
  }
  if (!fs.existsSync(PENDING_CHANGES_FILE)) {
    writeJSON(PENDING_CHANGES_FILE, []);
  }
  if (!fs.existsSync(EDIT_REQUESTS_FILE)) {
    writeJSON(EDIT_REQUESTS_FILE, []);
  }
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    writeJSON(NOTIFICATIONS_FILE, []);
  }
  // Ensure lineage_data directory exists
  if (!fs.existsSync(LINEAGE_DATA_DIR)) {
    fs.mkdirSync(LINEAGE_DATA_DIR, { recursive: true });
  }
};

bootstrapAccessData();

// ─── Utility Functions ───────────────────────────────────────────────────────
const generateToken = (length = 16) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
};

const generateShareCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
};

const generateSessionToken = () => crypto.randomUUID();

// ─── Session Middleware ──────────────────────────────────────────────────────
const getSessionFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];
  const sessions = readJSON(SESSIONS_FILE) || [];
  return sessions.find(s => s.token === token) || null;
};

const requireAuth = (req, res, next) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
    return false;
  }
  req.session = session;
  req.user = { id: session.user_id };
  return true;
};

const requireAdmin = (req, res, lineageId) => {
  const lineages = readJSON(LINEAGES_FILE) || [];
  const lineage = lineages.find(l => l.id === lineageId);
  if (!lineage) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Không tìm thấy gia phả' }));
    return false;
  }
  if (lineage.admin_id !== req.user.id) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Chỉ Admin mới được thực hiện hành động này' }));
    return false;
  }
  return true;
};

// ─── Get user role for a lineage ─────────────────────────────────────────────
const getUserRole = (userId, lineageId) => {
  const lineages = readJSON(LINEAGES_FILE) || [];
  const lineage = lineages.find(l => l.id === lineageId);
  if (!lineage) return null;
  if (lineage.admin_id === userId) return 'admin';
  const accessList = readJSON(LINEAGE_ACCESS_FILE) || [];
  const entry = accessList.find(a => a.lineage_id === lineageId && a.user_id === userId);
  return entry ? entry.role : null;
};

// ─── Read body helper ────────────────────────────────────────────────────────
const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch (err) {
      reject(err);
    }
  });
  req.on('error', reject);
});

// ─── Send JSON response helper ───────────────────────────────────────────────
const sendJSON = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(data));
};

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=UTF-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Routes
  if (pathname === '/api/lineage' && method === 'GET') {
    try {
      // Support per-lineage data via query param: ?lineage_id=<id>
      const lineageId = parsedUrl.query.lineage_id;
      if (lineageId) {
        const lineageData = getLineageData(lineageId);
        if (lineageData) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
          res.end(JSON.stringify(lineageData));
          return;
        }
        // No per-lineage data yet - return empty
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
        res.end(JSON.stringify({ lineage_info: { name: 'Gia Phả', origin: '', total_members: 0, generations: 0 }, members: [] }));
        return;
      }
      // Legacy: no lineage_id - use shared data file
      const activeFile = fs.existsSync(DATA_FILE) ? DATA_FILE : DEFAULT_DATA_FILE;
      const data = fs.readFileSync(activeFile, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/lineage' && method === 'POST') {
    readBody(req).then((parsed) => {
      // Support per-lineage data via lineage_id in body or header
      const lineageId = parsed.lineage_id || (req.headers['x-lineage-id'] && req.headers['x-lineage-id'].toString());
      if (lineageId) {
        // Save per-lineage data (remove lineage_id from payload before saving)
        const { lineage_id: _, ...lineageData } = parsed;
        saveLineageData(lineageId, lineageData);
        sendJSON(res, 200, { success: true, message: 'Lưu dữ liệu gia phả thành công!' });
        return;
      }
      // Legacy: save to shared data file
      fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
      sendJSON(res, 200, { success: true, message: 'Lưu dữ liệu gia phả thành công!' });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu JSON không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname === '/api/lineage/reset' && method === 'POST') {
    try {
      if (fs.existsSync(DEFAULT_DATA_FILE)) {
        fs.copyFileSync(DEFAULT_DATA_FILE, DATA_FILE);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Đã khôi phục dữ liệu gốc mẫu Họ Trần Ngọc!' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Download template files
  if (pathname === '/api/download/xlsx' && method === 'GET') {
    if (fs.existsSync(XLSX_TEMPLATE)) {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="genealogy_template.xlsx"'
      });
      fs.createReadStream(XLSX_TEMPLATE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Không tìm thấy file mẫu Excel.');
    }
    return;
  }

  if (pathname === '/api/download/csv' && method === 'GET') {
    if (fs.existsSync(CSV_TEMPLATE)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="Danh_Sach_Gia_Pha_Day_Du.csv"'
      });
      fs.createReadStream(CSV_TEMPLATE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Không tìm thấy file CSV.');
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth API
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname === '/api/auth/create' && method === 'POST') {
    readBody(req).then((body) => {
      const { username, share_code } = body;
      if (!username || !username.trim()) {
        sendJSON(res, 400, { error: 'Tên người dùng không được để trống' });
        return;
      }
      const users = readJSON(USERS_FILE) || [];
      if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
        sendJSON(res, 409, { error: 'Tên người dùng đã được sử dụng' });
        return;
      }
      const user = {
        id: crypto.randomUUID(),
        username: username.trim(),
        created_at: new Date().toISOString()
      };
      users.push(user);
      writeJSON(USERS_FILE, users);

      // Create session
      const sessionToken = generateSessionToken();
      const sessions = readJSON(SESSIONS_FILE) || [];
      sessions.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        token: sessionToken,
        created_at: new Date().toISOString()
      });
      writeJSON(SESSIONS_FILE, sessions);

      // If share_code provided, grant access to existing lineage instead of creating new one
      if (share_code) {
        const codes = readJSON(SHARE_CODES_FILE) || [];
        const codeEntry = codes.find(c => c.code === share_code.toUpperCase() && !c.used);
        if (codeEntry) {
          // Mark code as used
          codeEntry.used = true;
          writeJSON(SHARE_CODES_FILE, codes);
          // Grant access
          const access = readJSON(LINEAGE_ACCESS_FILE) || [];
          access.push({ lineage_id: codeEntry.lineage_id, user_id: user.id, role: codeEntry.role, granted_by: 'share_code', granted_at: new Date().toISOString() });
          writeJSON(LINEAGE_ACCESS_FILE, access);
          sendJSON(res, 201, {
            user,
            lineage_id: codeEntry.lineage_id,
            role: codeEntry.role,
            session_token: sessionToken
          });
          return;
        }
      }

      // Auto-create lineage for new admin (no share_code)
      const lineages = readJSON(LINEAGES_FILE) || [];
      const lineage = {
        id: crypto.randomUUID(),
        admin_id: user.id,
        name: 'Gia Phả của ' + user.username,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      lineages.push(lineage);
      writeJSON(LINEAGES_FILE, lineages);

      // Initialize with 3-generation sample lineage data
      let sampleData = null;
      try {
        sampleData = JSON.parse(fs.readFileSync(SAMPLE_LINEAGE_FILE, 'utf-8'));
      } catch {
        // Fallback: empty lineage
        sampleData = { lineage_info: { name: 'Gia Phả của ' + user.username, origin: '', total_members: 0, generations: 0 }, members: [] };
      }
      // Customize sample data with user's lineage name
      sampleData.lineage_info.name = 'Gia Phả của ' + user.username;
      saveLineageData(lineage.id, sampleData);

      sendJSON(res, 201, {
        user,
        lineage_id: lineage.id,
        role: 'admin',
        session_token: sessionToken
      });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    readBody(req).then((body) => {
      const { username, share_code } = body;
      if (!username || !username.trim()) {
        sendJSON(res, 400, { error: 'Tên người dùng không được để trống' });
        return;
      }
      const users = readJSON(USERS_FILE) || [];
      const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
      if (!user) {
        sendJSON(res, 404, { error: 'Không tìm thấy người dùng' });
        return;
      }

      // Create session
      const sessionToken = generateSessionToken();
      const sessions = readJSON(SESSIONS_FILE) || [];
      sessions.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        token: sessionToken,
        created_at: new Date().toISOString()
      });
      writeJSON(SESSIONS_FILE, sessions);

      // Determine role and lineage
      const lineages = readJSON(LINEAGES_FILE) || [];
      const adminLineage = lineages.find(l => l.admin_id === user.id);
      let lineageId = adminLineage ? adminLineage.id : DEFAULT_LINEAGE_ID;
      let role = adminLineage ? 'admin' : getUserRole(user.id, lineageId) || 'viewer';

      // If share_code is provided, grant access to that lineage
      if (share_code) {
        const codes = readJSON(SHARE_CODES_FILE) || [];
        const codeEntry = codes.find(c => c.code === share_code.toUpperCase() && !c.used);
        if (codeEntry) {
          lineageId = codeEntry.lineage_id;
          role = codeEntry.role;
          // Mark code as used
          codeEntry.used = true;
          writeJSON(SHARE_CODES_FILE, codes);
          // Grant access
          const access = readJSON(LINEAGE_ACCESS_FILE) || [];
          const existing = access.find(a => a.lineage_id === lineageId && a.user_id === user.id);
          if (existing) {
            existing.role = role;
          } else {
            access.push({ lineage_id: lineageId, user_id: user.id, role, granted_by: 'share_code', granted_at: new Date().toISOString() });
          }
          writeJSON(LINEAGE_ACCESS_FILE, access);
        }
      }

      sendJSON(res, 200, {
        user: { id: user.id, username: user.username },
        lineage_id: lineageId,
        role,
        session_token: sessionToken
      });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    // Remove ALL sessions for the current user
    let sessions = readJSON(SESSIONS_FILE) || [];
    const userId = req.user.id;
    const beforeCount = sessions.length;
    sessions = sessions.filter(s => s.user_id !== userId);
    if (sessions.length < beforeCount) {
      writeJSON(SESSIONS_FILE, sessions);
    }
    sendJSON(res, 200, { success: true, message: 'Đã đăng xuất thành công' });
    return;
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const users = readJSON(USERS_FILE) || [];
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      sendJSON(res, 404, { error: 'Không tìm thấy người dùng' });
      return;
    }
    const lineages = readJSON(LINEAGES_FILE) || [];
    const adminLineage = lineages.find(l => l.admin_id === user.id);
    if (adminLineage) {
      const lineageId = adminLineage.id;
      sendJSON(res, 200, {
        user: { id: user.id, username: user.username },
        lineage_id: lineageId,
        role: 'admin'
      });
      return;
    }
    // Non-admin: find lineage from access list
    const access = readJSON(LINEAGE_ACCESS_FILE) || [];
    const userAccess = access.find(a => a.user_id === user.id);
    if (userAccess) {
      sendJSON(res, 200, {
        user: { id: user.id, username: user.username },
        lineage_id: userAccess.lineage_id,
        role: userAccess.role
      });
      return;
    }
    // Fallback to default lineage
    const lineageId = DEFAULT_LINEAGE_ID;
    const role = getUserRole(user.id, lineageId) || 'viewer';
    sendJSON(res, 200, {
      user: { id: user.id, username: user.username },
      lineage_id: lineageId,
      role
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Share API
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/share-link') && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    if (!requireAdmin(req, res, lineageId)) return;
    readBody(req).then((body) => {
      const { role } = body;
      if (!['viewer', 'editor'].includes(role)) {
        sendJSON(res, 400, { error: 'Role phải là viewer hoặc editor' });
        return;
      }
      const token = generateToken(16);
      const shareLinks = readJSON(SHARE_LINKS_FILE) || [];
      const shareLink = {
        id: crypto.randomUUID(),
        lineage_id: lineageId,
        token,
        role,
        expires_at: null,
        created_at: new Date().toISOString(),
        is_active: true
      };
      shareLinks.push(shareLink);
      writeJSON(SHARE_LINKS_FILE, shareLinks);
      sendJSON(res, 201, {
        share_link: {
          id: shareLink.id,
          token,
          url: '/share/' + token
        }
      });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/share-code') && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    if (!requireAdmin(req, res, lineageId)) return;
    const code = generateShareCode();
    const shareCodes = readJSON(SHARE_CODES_FILE) || [];
    const shareCode = {
      id: crypto.randomUUID(),
      lineage_id: lineageId,
      code,
      expires_at: null,
      created_at: new Date().toISOString(),
      is_active: true
    };
    shareCodes.push(shareCode);
    writeJSON(SHARE_CODES_FILE, shareCodes);
    sendJSON(res, 201, {
      share_code: { id: shareCode.id, code }
    });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/access-list') && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const accessList = readJSON(LINEAGE_ACCESS_FILE) || [];
    const users = readJSON(USERS_FILE) || [];
    const lineages = readJSON(LINEAGES_FILE) || [];
    const lineage = lineages.find(l => l.id === lineageId);

    const result = [];
    // Include admin
    if (lineage && lineage.admin_id) {
      const admin = users.find(u => u.id === lineage.admin_id);
      if (admin) {
        result.push({ user_id: admin.id, username: admin.username, role: 'admin', granted_at: lineage.created_at });
      }
    }
    // Include access entries
    const entries = accessList.filter(a => a.lineage_id === lineageId);
    for (const entry of entries) {
      const user = users.find(u => u.id === entry.user_id);
      if (user) {
        result.push({ user_id: user.id, username: user.username, role: entry.role, granted_at: entry.granted_at });
      }
    }
    sendJSON(res, 200, { access_list: result });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/access/') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const userId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    readBody(req).then((body) => {
      const { role } = body;
      if (!['viewer', 'editor'].includes(role)) {
        sendJSON(res, 400, { error: 'Role phải là viewer hoặc editor' });
        return;
      }
      const accessList = readJSON(LINEAGE_ACCESS_FILE) || [];
      const entry = accessList.find(a => a.lineage_id === lineageId && a.user_id === userId);
      if (!entry) {
        // Create new access entry
        accessList.push({
          id: crypto.randomUUID(),
          lineage_id: lineageId,
          user_id: userId,
          role,
          granted_at: new Date().toISOString(),
          granted_by: req.user.id
        });
      } else {
        entry.role = role;
      }
      writeJSON(LINEAGE_ACCESS_FILE, accessList);
      sendJSON(res, 200, { access: { user_id: userId, role } });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/access/') && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const userId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    let accessList = readJSON(LINEAGE_ACCESS_FILE) || [];
    accessList = accessList.filter(a => !(a.lineage_id === lineageId && a.user_id === userId));
    writeJSON(LINEAGE_ACCESS_FILE, accessList);
    sendJSON(res, 200, { success: true });
    return;
  }

  if (pathname.startsWith('/api/share/') && pathname.split('/').length === 4 && method === 'GET') {
    const parts = pathname.split('/');
    const token = parts[3];
    const shareLinks = readJSON(SHARE_LINKS_FILE) || [];
    const link = shareLinks.find(s => s.token === token && s.is_active);
    if (!link) {
      sendJSON(res, 404, { error: 'Link chia sẻ không hợp lệ hoặc đã hết hạn' });
      return;
    }
    sendJSON(res, 200, { lineage_id: link.lineage_id, role: link.role });
    return;
  }

  if (pathname === '/api/share/code' && method === 'POST') {
    readBody(req).then((body) => {
      const { code } = body;
      if (!code || !code.trim()) {
        sendJSON(res, 400, { error: 'Mã code không được để trống' });
        return;
      }
      const shareCodes = readJSON(SHARE_CODES_FILE) || [];
      const entry = shareCodes.find(s => s.code === code.trim().toUpperCase() && s.is_active);
      if (!entry) {
        sendJSON(res, 404, { error: 'Mã code không hợp lệ' });
        return;
      }
      sendJSON(res, 200, { lineage_id: entry.lineage_id, role: 'viewer' });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edit Requests API (viewer → editor upgrade)
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/edit-requests') && method === 'POST') {
    const parts = pathname.split('/');
    const lineageId = parts[3];
    readBody(req).then((body) => {
      const { title, description, member_id, guest_name, is_guest, proposed_changes } = body;

      // Guest mode: no auth required
      if (is_guest) {
        if (!title || !title.trim()) {
          sendJSON(res, 400, { error: 'Tiêu đề không được để trống' });
          return;
        }
        const editRequests = readJSON(EDIT_REQUESTS_FILE) || [];
        const editRequest = {
          id: crypto.randomUUID(),
          lineage_id: lineageId,
          requester_id: null,
          requester_name: guest_name || 'Khách',
          is_guest: true,
          title: title.trim(),
          description: description || '',
          member_id: member_id || null,
          proposed_changes: Array.isArray(proposed_changes) ? proposed_changes : [],
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          created_at: new Date().toISOString()
        };
        editRequests.push(editRequest);
        writeJSON(EDIT_REQUESTS_FILE, editRequests);

        // Notify admin
        const lineages = readJSON(LINEAGES_FILE) || [];
        const lineage = lineages.find(l => l.id === lineageId);
        if (lineage && lineage.admin_id) {
          const notifications = readJSON(NOTIFICATIONS_FILE) || [];
          notifications.push({
            id: crypto.randomUUID(),
            user_id: lineage.admin_id,
            type: 'edit_request',
            payload: { edit_request_id: editRequest.id, title: editRequest.title, requester_name: editRequest.requester_name, is_guest: true },
            is_read: false,
            created_at: new Date().toISOString()
          });
          writeJSON(NOTIFICATIONS_FILE, notifications);
        }

        sendJSON(res, 201, { edit_request: editRequest });
        return;
      }

      // Authenticated mode
      if (!requireAuth(req, res)) return;
      const role = getUserRole(req.user.id, lineageId);
      if (role !== 'viewer') {
        sendJSON(res, 403, { error: 'Chỉ người xem mới có thể gửi yêu cầu chỉnh sửa' });
        return;
      }
      if (!title || !title.trim()) {
        sendJSON(res, 400, { error: 'Tiêu đề không được để trống' });
        return;
      }
      const editRequests = readJSON(EDIT_REQUESTS_FILE) || [];
      const editRequest = {
        id: crypto.randomUUID(),
        lineage_id: lineageId,
        requester_id: req.user.id,
        title: title.trim(),
        description: description || '',
        member_id: member_id || null,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString()
      };
      editRequests.push(editRequest);
      writeJSON(EDIT_REQUESTS_FILE, editRequests);

      // Notify admin
      const lineages = readJSON(LINEAGES_FILE) || [];
      const lineage = lineages.find(l => l.id === lineageId);
      if (lineage && lineage.admin_id) {
        const notifications = readJSON(NOTIFICATIONS_FILE) || [];
        notifications.push({
          id: crypto.randomUUID(),
          user_id: lineage.admin_id,
          type: 'edit_request',
          payload: { edit_request_id: editRequest.id, title: editRequest.title, requester_id: req.user.id },
          is_read: false,
          created_at: new Date().toISOString()
        });
        writeJSON(NOTIFICATIONS_FILE, notifications);
      }

      sendJSON(res, 201, { edit_request: editRequest });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pending Changes API (editor → admin approval)
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/pending-changes') && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const role = getUserRole(req.user.id, lineageId);
    if (role !== 'editor') {
      sendJSON(res, 403, { error: 'Chỉ người chỉnh sửa mới có thể gửi yêu cầu phê duyệt' });
      return;
    }
    readBody(req).then((body) => {
      const { changes } = body;
      if (!Array.isArray(changes) || changes.length === 0) {
        sendJSON(res, 400, { error: 'Phải có ít nhất 1 thay đổi' });
        return;
      }
      const pendingChanges = readJSON(PENDING_CHANGES_FILE) || [];
      const pendingChange = {
        id: crypto.randomUUID(),
        lineage_id: lineageId,
        editor_id: req.user.id,
        changes,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        created_at: new Date().toISOString()
      };
      pendingChanges.push(pendingChange);
      writeJSON(PENDING_CHANGES_FILE, pendingChanges);

      // Notify admin
      const lineages = readJSON(LINEAGES_FILE) || [];
      const lineage = lineages.find(l => l.id === lineageId);
      if (lineage && lineage.admin_id) {
        const notifications = readJSON(NOTIFICATIONS_FILE) || [];
        notifications.push({
          id: crypto.randomUUID(),
          user_id: lineage.admin_id,
          type: 'pending_change',
          payload: { pending_change_id: pendingChange.id, change_count: changes.length, editor_id: req.user.id },
          is_read: false,
          created_at: new Date().toISOString()
        });
        writeJSON(NOTIFICATIONS_FILE, notifications);
      }

      sendJSON(res, 201, { pending_change: pendingChange });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/pending-changes') && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const pendingChanges = readJSON(PENDING_CHANGES_FILE) || [];
    const users = readJSON(USERS_FILE) || [];
    const lineageChanges = pendingChanges.filter(pc => pc.lineage_id === lineageId);

    const result = lineageChanges.map(pc => {
      const editor = users.find(u => u.id === pc.editor_id);
      return {
        ...pc,
        editor_username: editor ? editor.username : 'Unknown'
      };
    });
    sendJSON(res, 200, { pending_changes: result });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/pending-changes/') && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const changeId = parts[5];
    const pendingChanges = readJSON(PENDING_CHANGES_FILE) || [];
    const pc = pendingChanges.find(p => p.id === changeId);
    if (!pc) {
      sendJSON(res, 404, { error: 'Không tìm thấy yêu cầu thay đổi' });
      return;
    }
    sendJSON(res, 200, { pending_change: pc });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/pending-changes/') && pathname.endsWith('/approve') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const changeId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    let pendingChanges = readJSON(PENDING_CHANGES_FILE) || [];
    const pc = pendingChanges.find(p => p.id === changeId && p.lineage_id === lineageId);
    if (!pc) {
      sendJSON(res, 404, { error: 'Không tìm thấy yêu cầu thay đổi' });
      return;
    }
    if (pc.status !== 'pending') {
      sendJSON(res, 400, { error: 'Yêu cầu đã được xử lý' });
      return;
    }
    pc.status = 'approved';
    pc.reviewed_by = req.user.id;
    pc.reviewed_at = new Date().toISOString();
    writeJSON(PENDING_CHANGES_FILE, pendingChanges);

    // Apply changes to per-lineage data file
    try {
      const lineageData = getLineageData(lineageId) || {};
      for (const change of pc.changes) {
        if (change.type === 'update_member' && lineageData.members) {
          const member = lineageData.members.find(m => m.id === change.member_id);
          if (member && change.new_value) {
            Object.assign(member, change.new_value);
          }
        } else if (change.type === 'add_member' && change.new_value) {
          if (!lineageData.members) lineageData.members = [];
          lineageData.members.push(change.new_value);
        } else if (change.type === 'delete_member') {
          if (lineageData.members) {
            lineageData.members = lineageData.members.filter(m => m.id !== change.member_id);
          }
        }
      }
      saveLineageData(lineageId, lineageData);
    } catch (err) {
      // Log error but don't fail the approval
      console.error('Error applying changes:', err.message);
    }

    // Notify editor
    const notifications = readJSON(NOTIFICATIONS_FILE) || [];
    notifications.push({
      id: crypto.randomUUID(),
      user_id: pc.editor_id,
      type: 'change_approved',
      payload: { pending_change_id: pc.id },
      is_read: false,
      created_at: new Date().toISOString()
    });
    writeJSON(NOTIFICATIONS_FILE, notifications);

    sendJSON(res, 200, { pending_change: pc });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/pending-changes/') && pathname.endsWith('/reject') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const changeId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    readBody(req).then((body) => {
      const { reason } = body;
      let pendingChanges = readJSON(PENDING_CHANGES_FILE) || [];
      const pc = pendingChanges.find(p => p.id === changeId && p.lineage_id === lineageId);
      if (!pc) {
        sendJSON(res, 404, { error: 'Không tìm thấy yêu cầu thay đổi' });
        return;
      }
      if (pc.status !== 'pending') {
        sendJSON(res, 400, { error: 'Yêu cầu đã được xử lý' });
        return;
      }
      pc.status = 'rejected';
      pc.reviewed_by = req.user.id;
      pc.reviewed_at = new Date().toISOString();
      pc.rejection_reason = reason || '';
      writeJSON(PENDING_CHANGES_FILE, pendingChanges);

      // Notify editor
      const notifications = readJSON(NOTIFICATIONS_FILE) || [];
      notifications.push({
        id: crypto.randomUUID(),
        user_id: pc.editor_id,
        type: 'change_rejected',
        payload: { pending_change_id: pc.id, rejection_reason: pc.rejection_reason },
        is_read: false,
        created_at: new Date().toISOString()
      });
      writeJSON(NOTIFICATIONS_FILE, notifications);

      sendJSON(res, 200, { pending_change: pc });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edit Requests - Admin approve/reject
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname.startsWith('/api/lineage/') && pathname.endsWith('/edit-requests') && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const editRequests = readJSON(EDIT_REQUESTS_FILE) || [];
    const users = readJSON(USERS_FILE) || [];
    const lineageRequests = editRequests.filter(er => er.lineage_id === lineageId);

    const result = lineageRequests.map(er => {
      const requester = users.find(u => u.id === er.requester_id);
      return {
        ...er,
        requester_username: requester ? requester.username : 'Unknown'
      };
    });
    sendJSON(res, 200, { edit_requests: result });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/edit-requests/') && pathname.endsWith('/approve') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const requestId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    let editRequests = readJSON(EDIT_REQUESTS_FILE) || [];
    const er = editRequests.find(e => e.id === requestId && e.lineage_id === lineageId);
    if (!er) {
      sendJSON(res, 404, { error: 'Không tìm thấy yêu cầu chỉnh sửa' });
      return;
    }
    if (er.status !== 'pending') {
      sendJSON(res, 400, { error: 'Yêu cầu đã được xử lý' });
      return;
    }
    er.status = 'approved';
    er.reviewed_by = req.user.id;
    er.reviewed_at = new Date().toISOString();
    writeJSON(EDIT_REQUESTS_FILE, editRequests);

    // Apply proposed changes if present (for guest edit requests)
    if (er.proposed_changes && er.proposed_changes.length > 0) {
      try {
        const lineageData = getLineageData(lineageId) || {};
        for (const change of er.proposed_changes) {
          if (change.type === 'update_member' && lineageData.members) {
            // Try to find member by: member_id, member_code (matches id or member_code), or full_name
            let member = lineageData.members.find(m => m.id === change.member_id);
            if (!member && change.member_code) {
              member = lineageData.members.find(m => m.id === change.member_code || m.member_code === change.member_code);
            }
            if (!member && change.member_name) {
              member = lineageData.members.find(m => m.full_name === change.member_name);
            }
            if (member && change.field && change.new_value !== undefined) {
              member[change.field] = change.new_value;
            }
          } else if (change.type === 'add_member' && change.new_value) {
            if (!lineageData.members) lineageData.members = [];
            lineageData.members.push(change.new_value);
          } else if (change.type === 'delete_member') {
            if (lineageData.members) {
              lineageData.members = lineageData.members.filter(m => m.id !== change.member_id);
            }
          }
        }
        saveLineageData(lineageId, lineageData);
      } catch (err) {
        console.error('Error applying proposed changes:', err.message);
      }
    }

    // Upgrade user to editor
    let accessList = readJSON(LINEAGE_ACCESS_FILE) || [];
    const entry = accessList.find(a => a.lineage_id === lineageId && a.user_id === er.requester_id);
    if (!entry) {
      accessList.push({
        id: crypto.randomUUID(),
        lineage_id: lineageId,
        user_id: er.requester_id,
        role: 'editor',
        granted_at: new Date().toISOString(),
        granted_by: req.user.id
      });
    } else {
      entry.role = 'editor';
    }
    writeJSON(LINEAGE_ACCESS_FILE, accessList);

    // Notify requester
    const notifications = readJSON(NOTIFICATIONS_FILE) || [];
    notifications.push({
      id: crypto.randomUUID(),
      user_id: er.requester_id,
      type: 'role_granted',
      payload: { edit_request_id: er.id, new_role: 'editor' },
      is_read: false,
      created_at: new Date().toISOString()
    });
    writeJSON(NOTIFICATIONS_FILE, notifications);

    sendJSON(res, 200, { edit_request: er });
    return;
  }

  if (pathname.startsWith('/api/lineage/') && pathname.includes('/edit-requests/') && pathname.endsWith('/reject') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const lineageId = parts[3];
    const requestId = parts[5];
    if (!requireAdmin(req, res, lineageId)) return;
    readBody(req).then((body) => {
      const { reason } = body;
      let editRequests = readJSON(EDIT_REQUESTS_FILE) || [];
      const er = editRequests.find(e => e.id === requestId && e.lineage_id === lineageId);
      if (!er) {
        sendJSON(res, 404, { error: 'Không tìm thấy yêu cầu chỉnh sửa' });
        return;
      }
      if (er.status !== 'pending') {
        sendJSON(res, 400, { error: 'Yêu cầu đã được xử lý' });
        return;
      }
      er.status = 'rejected';
      er.reviewed_by = req.user.id;
      er.reviewed_at = new Date().toISOString();
      writeJSON(EDIT_REQUESTS_FILE, editRequests);

      // Notify requester
      const notifications = readJSON(NOTIFICATIONS_FILE) || [];
      notifications.push({
        id: crypto.randomUUID(),
        user_id: er.requester_id,
        type: 'edit_request_rejected',
        payload: { edit_request_id: er.id, reason: reason || '' },
        is_read: false,
        created_at: new Date().toISOString()
      });
      writeJSON(NOTIFICATIONS_FILE, notifications);

      sendJSON(res, 200, { edit_request: er });
    }).catch((err) => {
      sendJSON(res, 400, { error: 'Dữ liệu không hợp lệ: ' + err.message });
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Notifications API
  // ═══════════════════════════════════════════════════════════════════════════

  if (pathname === '/api/notifications' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const notifications = readJSON(NOTIFICATIONS_FILE) || [];
    const userNotifications = notifications.filter(n => n.user_id === req.user.id);
    sendJSON(res, 200, { notifications: userNotifications });
    return;
  }

  if (pathname.startsWith('/api/notifications/') && pathname.endsWith('/read') && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const parts = pathname.split('/');
    const notifId = parts[3];
    let notifications = readJSON(NOTIFICATIONS_FILE) || [];
    const notif = notifications.find(n => n.id === notifId && n.user_id === req.user.id);
    if (!notif) {
      sendJSON(res, 404, { error: 'Không tìm thấy thông báo' });
      return;
    }
    notif.is_read = true;
    writeJSON(NOTIFICATIONS_FILE, notifications);
    sendJSON(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/notifications/read-all' && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    let notifications = readJSON(NOTIFICATIONS_FILE) || [];
    for (const notif of notifications) {
      if (notif.user_id === req.user.id) {
        notif.is_read = true;
      }
    }
    writeJSON(NOTIFICATIONS_FILE, notifications);
    sendJSON(res, 200, { success: true });
    return;
  }

  // No API route matched - return 404 for BE
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
});

// ─── Backend Server ────────────────────────────────────────────────────────────
server.listen(BE_PORT, () => {
  console.log(`[BE] Backend API đang chạy tại: http://localhost:${BE_PORT}`);
});

// ─── Frontend Server (Static File Serving) ─────────────────────────────────────
const feServer = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Proxy API requests to backend (share URLs are handled by SPA, not proxied)
  if (pathname.startsWith('/api/')) {
    const options = {
      hostname: 'localhost',
      port: BE_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend không khả dụng' }));
    });

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback - serve index.html for unknown routes
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      fs.stat(fallbackPath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end('<h1>404 - Trang không tồn tại</h1>');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(fallbackPath).pipe(res);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

feServer.listen(FE_PORT, () => {
  console.log(`[FE] Frontend đang chạy tại: http://localhost:${FE_PORT}`);
});
