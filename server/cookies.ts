import type { Request } from 'express';

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.header('cookie');
  if (typeof header !== 'string' || !header.trim()) return null;

  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = trimmed.slice(eq + 1);
    return decodeCookieValue(raw.trim());
  }

  return null;
}

export function shareTokenCookieName(slug: string): string {
  // Scoped per slug so multiple shared docs can be opened in one browser session.
  return `proof_share_token_${slug}`;
}

