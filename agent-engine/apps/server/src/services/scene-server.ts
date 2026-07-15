/**
 * Scene HTTP Server — M4-T44 (Scene CRUD) + M4-T45 (Scene Version Management)
 * 独立的 HTTP 服务，暴露 Scene API 端点
 * 基于 Node.js 内置 http 模块
 */

import * as http from 'http';
import { parse as parseUrl } from 'url';
import {
  handleCreateScene,
  handleListScenes,
  handleGetScene,
  handleUpdateScene,
  handleDeleteScene,
  handleListVersions,
  handleGetVersion,
  handleRollback,
} from '../routes/scenes.js';

const PORT = parseInt(process.env.SCENE_PORT ?? '3002', 10);

// ─── JSON Helpers ────────────────────────────────────────────────────────────

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseQuery(urlStr: string): Record<string, string> {
  const parsed = parseUrl(urlStr, true);
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.query ?? {})) {
    if (value !== undefined && value !== null) {
      query[key] = String(value);
    }
  }
  return query;
}

// ─── Route Dispatcher ────────────────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const url = req.url ?? '/';
  const parsed = parseUrl(url, true);
  const pathname = parsed.pathname ?? '/';
  const method = req.method ?? 'GET';

  try {
    // ── GET /scenes ────────────────────────────────────────────────────────
    if (pathname === '/scenes' && method === 'GET') {
      const result = await handleListScenes();
      jsonResponse(res, result.status, result.data);
      return;
    }

    // ── POST /scenes ───────────────────────────────────────────────────────
    if (pathname === '/scenes' && method === 'POST') {
      const body = await parseBody(req);
      const result = await handleCreateScene(body);
      jsonResponse(res, result.status, result.data);
      return;
    }

    // ── GET /scenes/:id/versions ──────────────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)\/versions$/);
      if (match && method === 'GET') {
        const id = match[1];
        const result = await handleListVersions(id);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── GET /scenes/:id/versions/:version ─────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)\/versions\/(.+)$/);
      if (match && method === 'GET') {
        const id = match[1];
        const version = match[2];
        const result = await handleGetVersion(id, version);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── POST /scenes/:id/rollback ─────────────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)\/rollback$/);
      if (match && method === 'POST') {
        const id = match[1];
        const body = await parseBody(req);
        const result = await handleRollback(id, body);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── GET /scenes/:id ───────────────────────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)$/);
      if (match && method === 'GET') {
        const id = match[1];
        const result = await handleGetScene(id);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── PUT /scenes/:id ────────────────────────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)$/);
      if (match && method === 'PUT') {
        const id = match[1];
        const body = await parseBody(req);
        const result = await handleUpdateScene(id, body);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── DELETE /scenes/:id ───────────────────────────────────────────────
    {
      const match = pathname.match(/^\/scenes\/([^/]+)$/);
      if (match && method === 'DELETE') {
        const id = match[1];
        const result = await handleDeleteScene(id);
        jsonResponse(res, result.status, result.data);
        return;
      }
    }

    // ── Health ─────────────────────────────────────────────────────────────
    if (pathname === '/health' && method === 'GET') {
      jsonResponse(res, 200, { ok: true, service: 'scene-api' });
      return;
    }

    jsonResponse(res, 404, {
      error: 'Not found',
      available: [
        'GET    /scenes',
        'POST   /scenes',
        'GET    /scenes/:id',
        'PUT    /scenes/:id',
        'DELETE /scenes/:id',
        'GET    /scenes/:id/versions',
        'GET    /scenes/:id/versions/:version',
        'POST   /scenes/:id/rollback',
        'GET    /health',
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 500, { error: msg });
  }
}

// ─── Server Bootstrap ───────────────────────────────────────────────────────

export async function startSceneServer(port = PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { error: msg });
      });
    });

    server.listen(port, () => {
      console.log(`✅ Scene API running on http://localhost:${port}`);
      console.log('   GET    /scenes');
      console.log('   POST   /scenes');
      console.log('   GET    /scenes/:id');
      console.log('   PUT    /scenes/:id');
      console.log('   DELETE /scenes/:id');
      console.log('   GET    /scenes/:id/versions');
      console.log('   GET    /scenes/:id/versions/:version');
      console.log('   POST   /scenes/:id/rollback');
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('❌ Scene API server error:', err);
      throw err;
    });
  });
}

// 独立运行时启动
const isMain = process.argv[1]?.endsWith('scene-server.ts');
if (isMain) {
  startSceneServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
