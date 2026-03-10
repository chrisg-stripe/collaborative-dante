import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import type { AddressInfo } from 'node:net';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type ShareCreateResponse = {
  slug: string;
  ownerSecret: string;
};

type CollabSessionResponse = {
  success: boolean;
  session: {
    token: string;
  };
};

type AgentSnapshotResponse = {
  success: boolean;
  revision: number;
  blocks?: Array<{ ref?: string; markdown?: string }>;
};

const CLIENT_HEADERS = {
  'X-Proof-Client-Version': '0.31.0',
  'X-Proof-Client-Build': 'tests',
  'X-Proof-Client-Protocol': '3',
};

async function mustJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  return JSON.parse(text) as T;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.', 2);
  if (parts.length < 2) {
    throw new Error('Invalid collab token format');
  }
  const base64url = parts[0] ?? '';
  const base64 = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

function getAccessEpoch(token: string): number {
  const payload = decodeJwtPayload(token);
  const accessEpoch = payload.accessEpoch;
  assert(typeof accessEpoch === 'number' && Number.isFinite(accessEpoch), 'Expected numeric accessEpoch in collab token');
  return accessEpoch;
}

async function run(): Promise<void> {
  const dbName = `proof-rewrite-collab-barrier-${Date.now()}-${randomUUID()}.db`;
  const dbPath = path.join(os.tmpdir(), dbName);
  process.env.DATABASE_PATH = dbPath;
  process.env.COLLAB_EMBEDDED_WS = '1';

  const [{ apiRoutes }, { agentRoutes }, { bridgeRouter }, { setupWebSocket }, collab] = await Promise.all([
    import('../../server/routes.js'),
    import('../../server/agent-routes.js'),
    import('../../server/bridge.js'),
    import('../../server/ws.js'),
    import('../../server/collab.js'),
  ]);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/d/:slug/bridge', bridgeRouter);

  const server = createServer(app);
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocket(wss);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const httpBase = `http://127.0.0.1:${address.port}`;
  await collab.startCollabRuntimeEmbedded(address.port);

  try {
    const createRes = await fetch(`${httpBase}/api/documents`, {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '# Rewrite barrier\n\nInitial.',
        marks: {},
        title: 'Rewrite barrier',
      }),
    });
    const created = await mustJson<ShareCreateResponse>(createRes);
    assert(typeof created.slug === 'string' && created.slug.length > 0, 'Expected slug');
    assert(typeof created.ownerSecret === 'string' && created.ownerSecret.length > 0, 'Expected owner secret');

    const getSessionToken = async (): Promise<string> => {
      const sessionRes = await fetch(`${httpBase}/api/documents/${created.slug}/collab-session`, {
        headers: {
          ...CLIENT_HEADERS,
          'x-share-token': created.ownerSecret,
        },
      });
      const session = await mustJson<CollabSessionResponse>(sessionRes);
      assert(session.success === true, 'Expected successful collab session');
      assert(typeof session.session.token === 'string' && session.session.token.length > 0, 'Expected collab token');
      return session.session.token;
    };

    const getBaseRevision = async (): Promise<number> => {
      const snapshotRes = await fetch(`${httpBase}/api/agent/${created.slug}/snapshot`, {
        headers: {
          ...CLIENT_HEADERS,
          'x-share-token': created.ownerSecret,
        },
      });
      const snapshot = await mustJson<AgentSnapshotResponse>(snapshotRes);
      assert(
        typeof snapshot.revision === 'number' && Number.isFinite(snapshot.revision),
        'Expected numeric revision from /api/agent/:slug/snapshot',
      );
      return snapshot.revision;
    };

    const tokenBefore = await getSessionToken();
    const epochBefore = getAccessEpoch(tokenBefore);

    const rewriteViaDocumentsOps = await fetch(`${httpBase}/api/documents/${created.slug}/ops`, {
      method: 'POST',
      headers: {
        ...CLIENT_HEADERS,
        'Content-Type': 'application/json',
        'x-share-token': created.ownerSecret,
      },
      body: JSON.stringify({
        type: 'rewrite.apply',
        baseRevision: await getBaseRevision(),
        content: '# Rewrite barrier\n\nAfter documents ops.',
      }),
    });
    await mustJson<{ success: boolean }>(rewriteViaDocumentsOps);

    const tokenAfterDocumentsOps = await getSessionToken();
    const epochAfterDocumentsOps = getAccessEpoch(tokenAfterDocumentsOps);
    assert(
      epochAfterDocumentsOps > epochBefore,
      `Expected accessEpoch bump after /documents ops rewrite (${epochBefore} -> ${epochAfterDocumentsOps})`,
    );

    const rewriteViaAgentOps = await fetch(`${httpBase}/api/agent/${created.slug}/ops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-share-token': created.ownerSecret,
      },
      body: JSON.stringify({
        op: 'rewrite.apply',
        baseRevision: await getBaseRevision(),
        content: '# Rewrite barrier\n\nAfter agent ops.',
      }),
    });
    await mustJson<{ success: boolean }>(rewriteViaAgentOps);

    const tokenAfterAgentOps = await getSessionToken();
    const epochAfterAgentOps = getAccessEpoch(tokenAfterAgentOps);
    assert(
      epochAfterAgentOps > epochAfterDocumentsOps,
      `Expected accessEpoch bump after /agent ops rewrite (${epochAfterDocumentsOps} -> ${epochAfterAgentOps})`,
    );

    const rewriteViaAgentRoute = await fetch(`${httpBase}/api/agent/${created.slug}/rewrite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-share-token': created.ownerSecret,
      },
      body: JSON.stringify({
        baseRevision: await getBaseRevision(),
        content: '# Rewrite barrier\n\nAfter agent rewrite route.',
      }),
    });
    await mustJson<{ success: boolean }>(rewriteViaAgentRoute);

    const tokenAfterAgentRewriteRoute = await getSessionToken();
    const epochAfterAgentRewriteRoute = getAccessEpoch(tokenAfterAgentRewriteRoute);
    assert(
      epochAfterAgentRewriteRoute > epochAfterAgentOps,
      `Expected accessEpoch bump after /agent rewrite (${epochAfterAgentOps} -> ${epochAfterAgentRewriteRoute})`,
    );

    const snapshotBeforeEditV2Res = await fetch(`${httpBase}/api/agent/${created.slug}/snapshot`, {
      headers: {
        ...CLIENT_HEADERS,
        'x-share-token': created.ownerSecret,
      },
    });
    const snapshotBeforeEditV2 = await mustJson<AgentSnapshotResponse>(snapshotBeforeEditV2Res);
    assert(snapshotBeforeEditV2.success === true, 'Expected edit v2 snapshot success');
    assert(
      typeof snapshotBeforeEditV2.revision === 'number' && Number.isFinite(snapshotBeforeEditV2.revision),
      'Expected numeric snapshot revision for edit v2 request',
    );

    const editV2Res = await fetch(`${httpBase}/api/agent/${created.slug}/edit/v2`, {
      method: 'POST',
      headers: {
        ...CLIENT_HEADERS,
        'Content-Type': 'application/json',
        'x-share-token': created.ownerSecret,
      },
      body: JSON.stringify({
        by: 'ai:test',
        baseRevision: snapshotBeforeEditV2.revision,
        operations: [
          { op: 'replace_block', ref: 'b2', block: { markdown: 'After edit v2 barrier.' } },
        ],
      }),
    });
    const editV2Body = await mustJson<{
      success: boolean;
      snapshot?: AgentSnapshotResponse;
    }>(editV2Res);
    const editV2Snapshot = editV2Body.snapshot;
    assert(editV2Snapshot?.revision === snapshotBeforeEditV2.revision + 1, 'Expected edit/v2 to increment revision by exactly 1');
    assert((editV2Snapshot?.blocks?.length ?? 0) === 2, 'Expected edit/v2 structural edit to preserve block count');

    const tokenAfterAgentEditV2 = await getSessionToken();
    const epochAfterAgentEditV2 = getAccessEpoch(tokenAfterAgentEditV2);
    assert(
      epochAfterAgentEditV2 === epochAfterAgentRewriteRoute,
      `Expected /agent edit v2 to preserve accessEpoch (${epochAfterAgentRewriteRoute} -> ${epochAfterAgentEditV2})`,
    );

    const putRes = await fetch(`${httpBase}/api/documents/${created.slug}`, {
      method: 'PUT',
      headers: {
        ...CLIENT_HEADERS,
        'Content-Type': 'application/json',
        'x-share-token': created.ownerSecret,
      },
      body: JSON.stringify({
        markdown: '# Rewrite barrier\n\nAfter PUT markdown barrier.',
      }),
    });
    await mustJson<{ success: boolean }>(putRes);

    const tokenAfterPut = await getSessionToken();
    const epochAfterPut = getAccessEpoch(tokenAfterPut);
    assert(
      epochAfterPut > epochAfterAgentEditV2,
      `Expected accessEpoch bump after PUT /documents/:slug (${epochAfterAgentEditV2} -> ${epochAfterPut})`,
    );

    const bridgeRewriteRes = await fetch(`${httpBase}/d/${created.slug}/bridge/rewrite`, {
      method: 'POST',
      headers: {
        ...CLIENT_HEADERS,
        'Content-Type': 'application/json',
        'x-bridge-token': created.ownerSecret,
      },
      body: JSON.stringify({
        baseRevision: await getBaseRevision(),
        content: '# Rewrite barrier\n\nAfter bridge rewrite barrier.',
      }),
    });
    await mustJson<{ success: boolean }>(bridgeRewriteRes);

    const tokenAfterBridgeRewrite = await getSessionToken();
    const epochAfterBridgeRewrite = getAccessEpoch(tokenAfterBridgeRewrite);
    assert(
      epochAfterBridgeRewrite > epochAfterPut,
      `Expected accessEpoch bump after bridge rewrite (${epochAfterPut} -> ${epochAfterBridgeRewrite})`,
    );

    console.log('✓ rewrite routes enforce collab epoch barrier while /agent edit v2 preserves session epoch');
  } finally {
    try {
      wss.close();
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await collab.stopCollabRuntime();
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        unlinkSync(`${dbPath}${suffix}`);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
