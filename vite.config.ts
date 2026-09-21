import { resolve } from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function localAuthApiPlugin(clientId: string, clientSecret: string): Plugin {
  return {
    name: 'local-auth-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/auth/token' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { code } = JSON.parse(body || '{}');
              if (!code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing code parameter' }));
                return;
              }
              const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: 'postmessage',
              });
              const googleRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              });
              const data = await googleRes.json();
              res.writeHead(googleRes.status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
            }
          });
          return;
        }

        if (req.url === '/api/auth/refresh' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { refresh_token } = JSON.parse(body || '{}');
              if (!refresh_token) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing refresh_token parameter' }));
                return;
              }
              const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token,
                grant_type: 'refresh_token',
              });
              const googleRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              });
              const data = await googleRes.json();
              res.writeHead(googleRes.status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';

  return {
    plugins: [react(), localAuthApiPlugin(clientId, clientSecret)],
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          privacidad: resolve(__dirname, 'privacidad.html'),
          terminos: resolve(__dirname, 'terminos.html'),
          galeria: resolve(__dirname, 'galeria.html'),
        },
      },
    },
  };
});
