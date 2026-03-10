import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getDocumentBySlug } from './db.js';
import { getCanonicalReadableDocumentSync } from './collab.js';
import { recordSnapshotPublish } from './metrics.js';
import { buildSharePreviewModel, renderShareMetaTags, resolvePublicOrigin } from './share-preview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const snapshotDir = process.env.SNAPSHOT_DIR || path.join(__dirname, '..', 'snapshots');
const snapshotPublicBase = process.env.SNAPSHOT_PUBLIC_BASE_URL?.trim() || null;
const snapshotPublicTemplate = process.env.SNAPSHOT_PUBLIC_URL_TEMPLATE?.trim() || null;

type SnapshotUploadConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  keyPrefix: string;
};

let s3Client: S3Client | null = null;
let warnedMissingUploadConfig = false;
let uploadSequence = 0;
const latestUploadSequenceBySlug = new Map<string, number>();

function ensureSnapshotDir(): void {
  if (!existsSync(snapshotDir)) {
    mkdirSync(snapshotDir, { recursive: true });
  }
}

function getSnapshotPreviewOrigin(): string {
  // Snapshot HTML should reference app-owned share/OG endpoints.
  // Object storage origins may host only the HTML blob and not /og/share/*.
  return resolvePublicOrigin(null);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function snapshotPath(slug: string): string {
  const resolvedDir = path.resolve(snapshotDir);
  const resolvedPath = path.resolve(resolvedDir, `${slug}.html`);
  const withinDir = resolvedPath === resolvedDir || resolvedPath.startsWith(`${resolvedDir}${path.sep}`);
  if (!withinDir) {
    throw new Error('Invalid snapshot slug path');
  }
  return resolvedPath;
}

function getUploadConfig(): SnapshotUploadConfig | null {
  const bucket = process.env.SNAPSHOT_S3_BUCKET?.trim();
  if (!bucket) return null;
  const region = process.env.SNAPSHOT_S3_REGION?.trim() || 'auto';
  const endpoint = process.env.SNAPSHOT_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.SNAPSHOT_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.SNAPSHOT_S3_SECRET_ACCESS_KEY?.trim();
  const keyPrefix = (process.env.SNAPSHOT_S3_PREFIX || '').replace(/^\/+/, '').replace(/\/+$/, '');
  return {
    bucket,
    region,
    endpoint: endpoint || undefined,
    accessKeyId: accessKeyId || undefined,
    secretAccessKey: secretAccessKey || undefined,
    keyPrefix,
  };
}

function getS3Client(config: SnapshotUploadConfig): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.accessKeyId && config.secretAccessKey
      ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        }
      : undefined,
    forcePathStyle: Boolean(process.env.SNAPSHOT_S3_FORCE_PATH_STYLE === '1'),
  });
  return s3Client;
}

function objectKeyForSlug(slug: string, config: SnapshotUploadConfig): string {
  return config.keyPrefix ? `${config.keyPrefix}/${slug}.html` : `${slug}.html`;
}

function queueObjectStoreUpload(slug: string, html: string): void {
  const config = getUploadConfig();
  if (!config) return;
  const seq = ++uploadSequence;
  latestUploadSequenceBySlug.set(slug, seq);

  void (async () => {
    const client = getS3Client(config);
    const key = objectKeyForSlug(slug, config);
    try {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: html,
        ContentType: 'text/html; charset=utf-8',
        CacheControl: 'public, max-age=60',
      }));
      if (latestUploadSequenceBySlug.get(slug) === seq) {
        recordSnapshotPublish('success', 'object_store');
      }
    } catch (error) {
      if (!warnedMissingUploadConfig) {
        warnedMissingUploadConfig = true;
      }
      console.error('[snapshot] Failed to upload snapshot to object storage:', error);
      recordSnapshotPublish('failure', 'object_store');
    }
  })();
}

function renderSnapshotHtml(input: {
  slug: string;
  title: string;
  markdown: string;
  updatedAt: string;
  shareState: string;
  revision: number | string;
}): string {
  const title = escapeHtml(input.title || `Shared Document ${input.slug}`);
  const body = escapeHtml(input.markdown);
  const updated = escapeHtml(input.updatedAt);
  const state = escapeHtml(input.shareState);
  const preview = buildSharePreviewModel({
    slug: input.slug,
    origin: getSnapshotPreviewOrigin(),
    doc: {
      title: input.title,
      markdown: input.markdown,
      updatedAt: input.updatedAt,
      shareState: input.shareState,
      revision: input.revision,
    },
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${renderShareMetaTags(preview)}
  <style>
    body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f5f5f5; color:#111; }
    .wrap { max-width: 900px; margin: 40px auto; background:#fff; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow:hidden; }
    .banner { background:#0f766e; color:#fff; padding: 12px 18px; font-size: 14px; }
    .meta { background:#f0fdfa; color:#134e4a; padding: 10px 18px; font-size: 12px; border-bottom: 1px solid #ccfbf1; }
    pre { margin: 0; padding: 22px 20px 30px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; font-size: 14px; line-height: 1.55; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">Read-only snapshot. Live collaboration is currently unavailable.</div>
    <div class="meta">State: ${state} · Updated: ${updated}</div>
    <pre>${body}</pre>
  </div>
</body>
</html>`;
}

function renderUnavailableSnapshotHtml(input: {
  slug: string;
  title: string;
  updatedAt: string;
  shareState: string;
  revision: number | string;
}): string {
  const title = escapeHtml(input.title || `Shared Document ${input.slug}`);
  const updated = escapeHtml(input.updatedAt);
  const state = escapeHtml(input.shareState);
  const preview = buildSharePreviewModel({
    slug: input.slug,
    origin: getSnapshotPreviewOrigin(),
    doc: {
      title: input.title,
      updatedAt: input.updatedAt,
      shareState: input.shareState,
      revision: input.revision,
    },
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${renderShareMetaTags(preview)}
  <style>
    body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f5f5f5; color:#111; }
    .wrap { max-width: 760px; margin: 40px auto; background:#fff; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow:hidden; }
    .banner { background:#111827; color:#fff; padding: 12px 18px; font-size: 14px; }
    .meta { background:#f9fafb; color:#374151; padding: 10px 18px; font-size: 12px; border-bottom: 1px solid #e5e7eb; }
    .body { padding: 22px 20px 30px; font-size: 14px; line-height: 1.55; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">Document unavailable</div>
    <div class="meta">State: ${state} · Updated: ${updated}</div>
    <div class="body">This shared document is not currently accessible.</div>
  </div>
</body>
</html>`;
}

export function refreshSnapshotForSlug(slug: string): boolean {
  const doc = getCanonicalReadableDocumentSync(slug, 'snapshot') ?? getDocumentBySlug(slug);
  if (!doc) return false;
  ensureSnapshotDir();
  const html = doc.share_state === 'ACTIVE'
    ? renderSnapshotHtml({
        slug: doc.slug,
        title: doc.title || `Shared Document ${doc.slug}`,
        markdown: doc.markdown,
        updatedAt: doc.updated_at,
        shareState: doc.share_state,
        revision: doc.revision,
      })
    : renderUnavailableSnapshotHtml({
        slug: doc.slug,
        title: doc.title || `Shared Document ${doc.slug}`,
        updatedAt: doc.updated_at,
        shareState: doc.share_state,
        revision: doc.revision,
      });
  try {
    writeFileSync(snapshotPath(slug), html, 'utf8');
  } catch (error) {
    console.error('[snapshot] Failed to write local snapshot:', error);
    return false;
  }
  recordSnapshotPublish('success', 'local');
  queueObjectStoreUpload(slug, html);
  return true;
}

export function getSnapshotHtml(slug: string): string | null {
  try {
    const file = snapshotPath(slug);
    if (!existsSync(file)) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function getSnapshotPublicUrl(slug: string): string | null {
  if (snapshotPublicTemplate && snapshotPublicTemplate.includes('{slug}')) {
    return snapshotPublicTemplate.replace('{slug}', encodeURIComponent(slug));
  }
  if (snapshotPublicBase) {
    return `${snapshotPublicBase.replace(/\/$/, '')}/${encodeURIComponent(slug)}.html`;
  }
  const config = getUploadConfig();
  if (!config || !config.endpoint) return null;
  const endpoint = config.endpoint.replace(/\/$/, '');
  const key = objectKeyForSlug(slug, config).split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${encodeURIComponent(config.bucket)}/${key}`;
}
