const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

const PORT = 5174;
const VERCEL_AUTH_HOST = 'notas-theta-sandy.vercel.app';
let mainWindow = null;
let localServer = null;

// MIME types for static asset serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/**
 * Proxy POST requests to /api/auth/* directly to Vercel production backend
 */
function proxyAuthRequest(req, res) {
  const options = {
    hostname: VERCEL_AUTH_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: VERCEL_AUTH_HOST,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Error forwarding auth request to Vercel:', err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No se pudo contactar el servidor de autenticación' }));
  });

  req.pipe(proxyReq);
}

/**
 * Start an embedded lightweight HTTP server serving dist/
 */
function startStaticServer(distDir) {
  return new Promise((resolve) => {
    localServer = http.createServer((req, res) => {
      // Enable CORS for all local requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Route /api/auth to Vercel
      if (req.url && req.url.startsWith('/api/auth')) {
        proxyAuthRequest(req, res);
        return;
      }

      // Static file serving
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      let pathname = decodeURIComponent(parsedUrl.pathname);
      if (pathname === '/') pathname = '/index.html';

      let filePath = path.join(distDir, pathname);

      // Check if file exists, fallback to index.html for SPA routing
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    localServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use (e.g. dev server or another instance).`);
        resolve();
      } else {
        console.error('Local server error:', err);
        resolve();
      }
    });

    localServer.listen(PORT, '127.0.0.1', () => {
      console.log(`Local embedded server listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1150,
    height: 760,
    minWidth: 460,
    minHeight: 560,
    title: 'Notas',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#F7F4EE',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Strip "Electron/X.X.X" from User-Agent so Google OAuth doesn't block the login popup
  const currentUa = mainWindow.webContents.getUserAgent();
  const cleanUa = currentUa.replace(/Electron\/[0-9\.]+\s?/g, '');
  mainWindow.webContents.setUserAgent(cleanUa);
  session.defaultSession.setUserAgent(cleanUa);

  // Handle popups & external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow Google OAuth popup
    if (url.startsWith('https://accounts.google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 650,
          autoHideMenuBar: true,
          title: 'Conectar con Google Drive',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }

    // Open other links in default external browser (Chrome, Edge, etc.)
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show window when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

    if (!isDev) {
      const distDir = path.join(__dirname, '../dist');
      await startStaticServer(distDir);
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
