import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:4000';
const FONT_REGULAR_PATH = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@fontsource',
  'ibm-plex-sans',
  'files',
  'ibm-plex-sans-latin-400-normal.woff',
);
const FONT_BOLD_PATH = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@fontsource',
  'ibm-plex-sans',
  'files',
  'ibm-plex-sans-latin-700-normal.woff',
);
const FONT_REGULAR_DATA = readFileSync(FONT_REGULAR_PATH);
const FONT_BOLD_DATA = readFileSync(FONT_BOLD_PATH);

type PreviewSourceDocument = {
  title?: string | null;
  markdown?: string | null;
  updatedAt?: string | null;
  shareState?: string | null;
  revision?: number | string | null;
};

export type SharePreviewModel = {
  slug: string;
  shareState: string;
  canonicalUrl: string;
  displayUrl: string | null;
  imageUrl: string;
  title: string;
  description: string;
  excerpt: string | null;
  imageAlt: string;
  statusLabel: string;
  updatedAt: string | null;
  revisionTag: string;
  isUnavailable: boolean;
};

type Child = PreviewElement | string;

type PreviewElement = {
  type: string;
  props: Record<string, unknown> & { children?: Child | Child[] };
};

const UNAVAILABLE_TITLE = 'Proof document unavailable';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function resolvePublicOrigin(origin?: string | null): string {
  const configured = process.env.PROOF_PUBLIC_ORIGIN?.trim();
  if (configured) return normalizeOrigin(configured);
  if (origin && origin.trim()) return normalizeOrigin(origin);
  return DEFAULT_PUBLIC_ORIGIN;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
}

function stripMarkdownInline(value: string): string {
  return collapseWhitespace(
    value
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/<[^>]+>/g, '')
  );
}

function markdownToPlainText(markdown: string): string {
  return collapseWhitespace(
    stripFrontmatter(markdown)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, '')
      .replace(/[>*_~#`]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function extractTitle(markdown: string, fallbackTitle?: string | null): string {
  const trimmedFallback = fallbackTitle?.trim();
  if (trimmedFallback) return trimmedFallback;
  const frontmatterStripped = stripFrontmatter(markdown);
  const lines = frontmatterStripped.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*#\s+(.+?)\s*$/);
    if (!match) continue;
    const heading = stripMarkdownInline(match[1]);
    if (heading) return heading;
  }
  return 'Untitled document';
}

function extractExcerpt(markdown: string, title: string): string | null {
  const frontmatterStripped = stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n');
  const paragraphs = frontmatterStripped
    .split(/\n\s*\n/)
    .map((segment) => stripMarkdownInline(
      segment
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, '')
    ))
    .filter(Boolean);
  for (const paragraph of paragraphs) {
    if (paragraph === title) continue;
    if (paragraph.length >= 24) return paragraph;
  }
  const fallback = markdownToPlainText(markdown);
  if (!fallback) return null;
  if (fallback === title) return null;
  return fallback;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatUpdatedLabel(updatedAt: string | null): string {
  if (!updatedAt) return 'Live collaboration';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return 'Live collaboration';
  return `Updated ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)}`;
}

function humanizeShareState(shareState: string): string {
  switch (shareState) {
    case 'ACTIVE':
      return 'Shared document';
    case 'PAUSED':
      return 'Paused';
    case 'REVOKED':
      return 'Revoked';
    case 'DELETED':
      return 'Deleted';
    default:
      return 'Unavailable';
  }
}

function buildUnavailableDescription(shareState: string): string {
  switch (shareState) {
    case 'PAUSED':
      return 'This shared Proof document is temporarily unavailable.';
    case 'REVOKED':
      return 'This shared Proof document is no longer accessible.';
    case 'DELETED':
      return 'This shared Proof document has been deleted.';
    default:
      return 'This shared Proof document could not be found.';
  }
}

export function buildSharePreviewModel(input: {
  slug: string;
  origin?: string | null;
  doc?: PreviewSourceDocument | null;
  shareState?: string | null;
}): SharePreviewModel {
  const origin = resolvePublicOrigin(input.origin);
  const shareState = (input.doc?.shareState ?? input.shareState ?? 'ACTIVE').toUpperCase();
  const isUnavailable = shareState !== 'ACTIVE';
  const markdown = input.doc?.markdown ?? '';
  const title = isUnavailable ? UNAVAILABLE_TITLE : extractTitle(markdown, input.doc?.title);
  const excerpt = isUnavailable ? null : extractExcerpt(markdown, title);
  const descriptionBase = isUnavailable
    ? buildUnavailableDescription(shareState)
    : excerpt ?? 'Shared on Proof';
  const description = truncate(
    isUnavailable ? descriptionBase : `${title} — ${descriptionBase}`,
    160,
  );
  const revisionTagRaw = input.doc?.revision ?? input.doc?.updatedAt ?? '0';
  const revisionTag = String(revisionTagRaw);
  const canonicalUrl = `${origin}/d/${encodeURIComponent(input.slug)}`;
  const displayUrl = isUnavailable ? null : canonicalUrl.replace(/^https?:\/\//, '');
  const imageUrl = `${origin}/og/share/${encodeURIComponent(input.slug)}.png?v=${encodeURIComponent(revisionTag)}`;
  const imageAlt = excerpt
    ? `${title}. ${truncate(excerpt, 120)}`
    : `${title} on Proof`;
  return {
    slug: input.slug,
    shareState,
    canonicalUrl,
    displayUrl,
    imageUrl,
    title,
    description,
    excerpt,
    imageAlt,
    statusLabel: humanizeShareState(shareState),
    updatedAt: input.doc?.updatedAt ?? null,
    revisionTag,
    isUnavailable,
  };
}

export function renderShareMetaTags(model: SharePreviewModel): string {
  const title = escapeHtml(`${model.title} | Proof`);
  const description = escapeHtml(model.description);
  const canonicalUrl = escapeHtml(model.canonicalUrl);
  const imageUrl = escapeHtml(model.imageUrl);
  const imageAlt = escapeHtml(model.imageAlt);
  const secureImageTag = model.imageUrl.startsWith('https://')
    ? `\n<meta property="og:image:secure_url" content="${imageUrl}">`
    : '';
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${canonicalUrl}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Proof">',
    `<meta property="og:title" content="${escapeHtml(model.title)}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonicalUrl}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${imageAlt}">${secureImageTag}`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(model.title)}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
  ].join('\n');
}

function element(type: string, props: Record<string, unknown>, ...children: Child[]): PreviewElement {
  const nextProps: Record<string, unknown> & { children?: Child | Child[] } = { ...props };
  if (children.length === 1) nextProps.children = children[0];
  else if (children.length > 1) nextProps.children = children;
  return {
    type,
    props: nextProps,
  };
}

export function resolveOgTextLayout(title: string): {
  titleFontSize: number;
  excerptFontSize: number;
  excerptMaxLength: number;
  contentGap: string;
} {
  const length = title.trim().length;
  if (length >= 95) {
    return {
      titleFontSize: 56,
      excerptFontSize: 28,
      excerptMaxLength: 132,
      contentGap: '18px',
    };
  }
  if (length >= 72) {
    return {
      titleFontSize: 62,
      excerptFontSize: 29,
      excerptMaxLength: 168,
      contentGap: '22px',
    };
  }
  return {
    titleFontSize: 68,
    excerptFontSize: 30,
    excerptMaxLength: 220,
    contentGap: '28px',
  };
}

function buildOgTree(model: SharePreviewModel): PreviewElement {
  const accent = model.isUnavailable ? '#475569' : '#14b8a6';
  const accentSoft = model.isUnavailable ? '#1e293b' : '#0f766e';
  const textLayout = resolveOgTextLayout(model.title);
  const excerpt = truncate(
    model.excerpt ?? buildUnavailableDescription(model.shareState),
    textLayout.excerptMaxLength,
  );
  const footerChildren: Child[] = [];
  if (model.displayUrl) {
    footerChildren.push(
      element(
        'div',
        {
          style: {
            display: 'flex',
            padding: '12px 18px',
            borderRadius: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            color: '#e2e8f0',
            fontSize: '22px',
          },
        },
        model.displayUrl
      )
    );
  }
  footerChildren.push(
    element(
      'div',
      {
        style: {
          display: 'flex',
          color: '#94a3b8',
          fontSize: '22px',
        },
      },
      formatUpdatedLabel(model.updatedAt)
    )
  );
  return element(
    'div',
    {
      style: {
        width: `${OG_IMAGE_WIDTH}px`,
        height: `${OG_IMAGE_HEIGHT}px`,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#07111c',
        color: '#f8fafc',
        fontFamily: '"IBM Plex Sans"',
      },
    },
    element('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        top: '-120px',
        right: '-140px',
        width: '420px',
        height: '420px',
        borderRadius: '999px',
        backgroundColor: accentSoft,
        opacity: 0.52,
      },
    }),
    element('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        left: '-120px',
        bottom: '-180px',
        width: '380px',
        height: '380px',
        borderRadius: '999px',
        backgroundColor: '#112235',
        opacity: 0.9,
      },
    }),
    element(
      'div',
      {
        style: {
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '52px',
          boxSizing: 'border-box',
        },
      },
      element(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        },
        element(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            },
          },
          element('div', {
            style: {
              width: '14px',
              height: '14px',
              borderRadius: '999px',
              backgroundColor: accent,
            },
          }),
          element(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: '28px',
                color: '#dbeafe',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              },
            },
            'Proof'
          )
        ),
        element(
          'div',
          {
            style: {
              display: 'flex',
              padding: '10px 18px',
              borderRadius: '999px',
              backgroundColor: 'rgba(15, 23, 42, 0.78)',
              border: `1px solid ${accent}`,
              color: '#e2e8f0',
              fontSize: '22px',
              fontWeight: 600,
            },
          },
          model.statusLabel
        )
      ),
      element(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: textLayout.contentGap,
            maxWidth: '880px',
          },
        },
        element(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: `${textLayout.titleFontSize}px`,
              lineHeight: 1.04,
              letterSpacing: '-0.045em',
              fontWeight: 700,
              color: '#f8fafc',
            },
          },
          truncate(model.title, 120)
        ),
        element(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: `${textLayout.excerptFontSize}px`,
              lineHeight: 1.3,
              color: '#cbd5e1',
              fontWeight: 400,
            },
          },
          excerpt
        )
      ),
      element(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
          },
        },
        ...footerChildren
      )
    )
  );
}

export async function renderShareOgSvg(model: SharePreviewModel): Promise<string> {
  return satori(buildOgTree(model) as unknown as Parameters<typeof satori>[0], {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: [
      {
        name: 'IBM Plex Sans',
        data: toArrayBuffer(FONT_REGULAR_DATA),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'IBM Plex Sans',
        data: toArrayBuffer(FONT_BOLD_DATA),
        weight: 700,
        style: 'normal',
      },
    ],
  });
}

export async function renderShareOgPng(model: SharePreviewModel): Promise<Buffer> {
  const svg = await renderShareOgSvg(model);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_IMAGE_WIDTH,
    },
  });
  return Buffer.from(resvg.render().asPng());
}
