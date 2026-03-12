import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRoutes } from './routes.js';
import { agentRoutes } from './agent-routes.js';
import { setupWebSocket } from './ws.js';
import { createBridgeMountRouter } from './bridge.js';
import { getCollabRuntime, startCollabRuntimeEmbedded } from './collab.js';
import { discoveryRoutes } from './discovery-routes.js';
import { shareWebRoutes } from './share-web-routes.js';
import {
  capabilitiesPayload,
  enforceApiClientCompatibility,
  enforceBridgeClientCompatibility,
} from './client-capabilities.js';
import { getBuildInfo } from './build-info.js';
import { createDocument, createDocumentAccessToken } from './db.js';
import { generateSlug } from './slug.js';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const DEFAULT_ALLOWED_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'null',
];

function parseAllowedCorsOrigins(): Set<string> {
  const configured = (process.env.PROOF_CORS_ALLOW_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_CORS_ORIGINS);
}

async function main(): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const allowedCorsOrigins = parseAllowedCorsOrigins();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((req, res, next) => {
    const originHeader = req.header('origin');
    if (originHeader && allowedCorsOrigins.has(originHeader)) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      [
        'Content-Type',
        'Authorization',
        'X-Proof-Client-Version',
        'X-Proof-Client-Build',
        'X-Proof-Client-Protocol',
        'x-share-token',
        'x-bridge-token',
        'x-auth-poll-token',
        'X-Agent-Id',
        'X-Window-Id',
        'X-Document-Id',
        'Idempotency-Key',
        'X-Idempotency-Key',
      ].join(', '),
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof Editor</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; color: #0A2540; background: #FFFFFF; }
      header { border-bottom: 1px solid #E3E8EE; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
      header h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
      header span { color: #8792A2; font-size: 0.85rem; }
      main { max-width: 640px; margin: 80px auto; padding: 0 24px; }
      h2 { font-size: 1.75rem; font-weight: 600; margin: 0 0 12px; letter-spacing: -0.02em; }
      p { font-size: 1rem; line-height: 1.7; color: #425466; margin: 0 0 32px; }
      .cta { display: inline-block; background: #635BFF; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 0.95rem; font-weight: 500; transition: background 0.15s; }
      .cta:hover { background: #5147E5; }
      .links { margin-top: 48px; display: flex; gap: 24px; }
      .links a { color: #635BFF; text-decoration: none; font-size: 0.9rem; font-weight: 500; }
      .links a:hover { text-decoration: underline; }
      code { background: #F6F9FC; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.88em; border: 1px solid #E3E8EE; }
    </style>
  </head>
  <body>
    <header>
      <h1>Proof Editor</h1>
      <span>Collaborative editing with Dante</span>
    </header>
    <main>
      <h2>Real-time collaborative editing</h2>
      <p>Create a document and start writing. Dante can join via the agent HTTP bridge to co-edit, comment, and suggest changes in real time.</p>
      <a class="cta" href="/new">Create document</a>
      <div class="links">
        <a href="/agent-docs">Agent docs</a>
        <a href="/.well-known/agent.json">Discovery</a>
        <a href="/health">Health</a>
      </div>
    </main>
  </body>
</html>`);
  });

  app.get('/new', (_req, res) => {
    const slug = generateSlug();
    const ownerSecret = randomUUID();
    createDocument(slug, '# Untitled\n', {}, 'Untitled', undefined, ownerSecret);
    const access = createDocumentAccessToken(slug, 'editor');
    res.redirect(`/d/${slug}?token=${encodeURIComponent(access.secret)}`);
  });

  app.get('/health', (_req, res) => {
    const buildInfo = getBuildInfo();
    res.json({
      ok: true,
      buildInfo,
      collab: getCollabRuntime(),
    });
  });

  app.get('/api/capabilities', (_req, res) => {
    res.json(capabilitiesPayload());
  });

  app.use(discoveryRoutes);
  app.use('/api', enforceApiClientCompatibility, apiRoutes);
  app.use('/api/agent', agentRoutes);
  app.use(apiRoutes);
  app.use('/d', createBridgeMountRouter(enforceBridgeClientCompatibility));
  app.use('/documents', createBridgeMountRouter(enforceBridgeClientCompatibility));
  app.use('/documents', agentRoutes);
  app.use(shareWebRoutes);

  setupWebSocket(wss);
  await startCollabRuntimeEmbedded(PORT);

  server.listen(PORT, () => {
    console.log(`[proof-sdk] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((error) => {
  console.error('[proof-sdk] failed to start server', error);
  process.exit(1);
});
