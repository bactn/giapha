// server.js - Node.js Server for Genealogy Tree Platform
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'current_lineage.json');
const DEFAULT_DATA_FILE = path.join(__dirname, 'data', 'default_lineage.json');
const XLSX_TEMPLATE = path.join(__dirname, 'genealogy_template.xlsx');
const CSV_TEMPLATE = path.join(__dirname, 'Danh_Sach_Gia_Pha_Day_Du.csv');

// Initialize data if not exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}
if (!fs.existsSync(DATA_FILE) && fs.existsSync(DEFAULT_DATA_FILE)) {
  fs.copyFileSync(DEFAULT_DATA_FILE, DATA_FILE);
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Routes
  if (pathname === '/api/lineage' && method === 'GET') {
    try {
      const activeFile = fs.existsSync(DATA_FILE) ? DATA_FILE : DEFAULT_DATA_FILE;
      const data = fs.readFileSync(activeFile, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/lineage' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Lưu dữ liệu gia phả thành công!' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dữ liệu JSON không hợp lệ: ' + err.message }));
      }
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
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end('<h1>404 - Trang không tồn tại</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[Genealogy Tree Platform] Máy chủ đang chạy tại: http://localhost:${PORT}`);
});
