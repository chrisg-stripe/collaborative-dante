export type ShareMarkdownAuthMode = 'none' | 'api_key' | 'every' | 'every_or_api_key' | 'auto';

type PendingAuthStatus = 'pending' | 'completed' | 'failed';

export function isEveryOAuthConfigured(_publicBaseUrl?: string): boolean {
  return false;
}

export function resolveShareMarkdownAuthMode(_publicBaseUrl?: string): Exclude<ShareMarkdownAuthMode, 'auto'> {
  const configured = (process.env.PROOF_SHARE_MARKDOWN_AUTH_MODE || 'none').trim().toLowerCase();
  if (configured === 'api_key') return 'api_key';
  if (configured === 'every_or_api_key') return 'every_or_api_key';
  return 'none';
}

export function startEveryAuth(_publicBaseUrl: string):
  | {
    ok: true;
    requestId: string;
    pollToken: string;
    pollUrl: string;
    legacyPollUrl: string;
    authUrl: string;
    expiresAt: string;
    expiresIn: number;
  }
  | {
    ok: false;
    error: string;
  } {
  return {
    ok: false,
    error: 'Every OAuth is not available in Proof SDK. Use share tokens or PROOF_SHARE_MARKDOWN_API_KEY.',
  };
}

export function pollEveryAuth(
  _requestId: string,
  _pollToken: string,
): {
  status: PendingAuthStatus;
  error?: string;
} | null {
  return {
    status: 'failed',
    error: 'Every OAuth is not available in Proof SDK.',
  };
}

export async function handleEveryAuthCallback(_input: {
  state: string;
  code?: string;
  error?: string;
  publicBaseUrl?: string;
}): Promise<{
  ok: boolean;
  message: string;
}> {
  return {
    ok: false,
    message: 'Every OAuth is not available in Proof SDK.',
  };
}

export async function validateEverySessionToken(
  _sessionToken: string,
  _publicBaseUrl?: string,
): Promise<{
  ok: boolean;
  principal?: {
    userId: number;
    email: string;
    name: string | null;
    sessionToken: string;
  };
  reason?: string;
}> {
  return {
    ok: false,
    reason: 'unsupported',
  };
}

export function revokeEverySessionToken(_sessionToken: string): boolean {
  return false;
}
