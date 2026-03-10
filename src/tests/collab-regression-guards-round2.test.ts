import { readFileSync } from 'node:fs';
import path from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  const editorPath = path.resolve(process.cwd(), 'src', 'editor', 'index.ts');
  const editorSource = readFileSync(editorPath, 'utf8');
  const collabCursorSource = readFileSync(
    path.resolve(process.cwd(), 'src', 'editor', 'plugins', 'collab-cursors.ts'),
    'utf8',
  );
  const marksSource = readFileSync(path.resolve(process.cwd(), 'src', 'editor', 'plugins', 'marks.ts'), 'utf8');
  const bridgeSource = readFileSync(path.resolve(process.cwd(), 'Proof', 'Bridge', 'AgentBridgeServer.swift'), 'utf8');
  assert(
    editorSource.includes('private createAgentMenuButton('),
    'Expected dedicated agent menu button in share banner',
  );
  assert(
    editorSource.includes('private getHumanCollaboratorAvatars(): Array<{ name: string; color: string; initial: string }> {'),
    'Expected split human collaborator avatar derivation',
  );
  assert(
    editorSource.includes('private getConnectedAgentEntries(): Array<{'),
    'Expected split connected agent derivation',
  );
  assert(
    editorSource.includes('private scheduleShareAgentPresenceExpiryRefresh(nextExpiryAtMs: number | null): void {'),
    'Expected explicit agent presence expiry refresh scheduler',
  );
  assert(
    editorSource.includes('this.scheduleShareAgentPresenceExpiryRefresh(nextExpiryAtMs);'),
    'Expected share banner agent control updates to schedule TTL-bound refreshes',
  );
  assert(
    editorSource.includes('private getAgentInviteMessage(): string {'),
    'Expected dedicated agent invite message payload builder',
  );
  assert(
    editorSource.includes('Collaborate with me on this Proof doc.'),
    'Expected agent invite copy payload to include collaboration instructions',
  );
  assert(
    editorSource.includes('x-share-token:'),
    'Expected agent invite copy payload to include explicit x-share-token auth guidance',
  );
  assert(
    editorSource.includes('Read current document state with your identity header:'),
    'Expected agent invite copy payload to require explicit identity on state reads',
  );
  assert(
    editorSource.includes('- X-Agent-Id: <your-agent-id>'),
    'Expected agent invite copy payload to include explicit X-Agent-Id guidance',
  );
  assert(
    editorSource.includes('if (!id || !isAgentScopedId(id)) return;'),
    'Expected websocket fallback presence handling to ignore invalid agent ids',
  );
  assert(
    editorSource.includes('if (!isAgentScopedId(fallback.id)) continue;'),
    'Expected share header projection to filter invalid fallback agent ids',
  );
  assert(
    editorSource.includes('if (agentId && isAgentScopedId(agentId)) activeAgentIds.add(agentId);')
      && editorSource.includes('if (!agentId || !isAgentScopedId(agentId)) continue;'),
    'Expected synthetic agent cursor awareness to ignore invalid agent ids',
  );
  assert(
    editorSource.includes("addItem('Copy link', async () => this.copyLinkWithFallback(this.getCanonicalShareUrl()));"),
    'Expected simplified share menu with single copy action',
  );
  assert(
    !editorSource.includes('Copy link as viewer'),
    'Expected role-specific share link options to be removed from share menu',
  );
  assert(
    editorSource.includes("addActionItem('View activity', () => this.openShareActivityModal());"),
    'Expected share menu to retain activity entrypoint',
  );
  assert(
    editorSource.includes('await shareClient.disconnectAgentPresence(agent.id);'),
    'Expected agent menu disconnect action to call share client helper',
  );
  assert(
    editorSource.includes("addMenuButton('Copy agent invite link', async () => this.copyAgentInviteWithFallback(), {"),
    'Expected agent menu copy action to use invite payload, not raw URL',
  );
  assert(
    editorSource.includes('private setupTitleEditing(titleEl: HTMLElement): void {'),
    'Expected clickable in-pill title editing behavior',
  );
  assert(
    editorSource.includes("if (titleEl.dataset.titleEditBound === 'true') return;"),
    'Expected title editing listeners to bind once and avoid duplicate handlers',
  );
  assert(
    editorSource.includes('this.setupTitleEditing(this.shareBannerTitleEl);'),
    'Expected title editability to rebind after share capability updates',
  );
  assert(
    editorSource.includes('this.updateEditableState();\n    this.updateShareBannerTitleDisplay();'),
    'Expected share edit gate updates to refresh title affordance state',
  );
  assert(
    editorSource.includes("const result = await shareClient.updateTitle(nextTitle);"),
    'Expected pill title edits to persist through share client',
  );
  assert(
    editorSource.includes("if (type === 'document.updated') {\n      if (typeof message.title === 'string') {\n        this.applyShareTitle(message.title);\n      }"),
    'Expected websocket document.updated handler to only mutate title when payload includes title',
  );
  assert(
    editorSource.includes('.proof-avatar-tooltip'),
    'Expected avatar hover tooltip styles for collaborator identity',
  );
  assert(
    editorSource.includes('Agent collaborator'),
    'Expected connected agent indicators to use collaborator-style tooltip labeling',
  );
  assert(
    !editorSource.includes('if (!menu.isConnected) return;'),
    'Expected menu cleanup to be idempotent and not retain stale cleanup handlers',
  );
  assert(
    editorSource.includes("right.textContent = ok ? 'Copied' : 'Failed';"),
    'Expected copy actions to use Copied/Failed feedback consistently',
  );
  assert(
    editorSource.includes('min-height:44px;min-width:44px;'),
    'Expected banner controls to preserve 44px touch targets',
  );

  const shareClientPath = path.resolve(process.cwd(), 'src', 'bridge', 'share-client.ts');
  const shareClientSource = readFileSync(shareClientPath, 'utf8');
  assert(
    shareClientSource.includes('async disconnectAgentPresence('),
    'Expected ShareClient.disconnectAgentPresence helper',
  );
  assert(
    shareClientSource.includes('async updateTitle('),
    'Expected ShareClient.updateTitle helper',
  );

  const collabClientPath = path.resolve(process.cwd(), 'src', 'bridge', 'collab-client.ts');
  const collabClientSource = readFileSync(collabClientPath, 'utf8');
  assert(
    !collabClientSource.includes('#22c55e')
      && !collabClientSource.includes('#ef4444')
      && !collabClientSource.includes('#eab308'),
    'Expected human collaborator palette to avoid review-state green/red/yellow colors',
  );
  assert(
    collabCursorSource.includes('background-image: linear-gradient(180deg, ${color}14 0%, ${color}0d 100%)')
      && collabCursorSource.includes('border-bottom: 2px solid ${color}66')
      && !collabCursorSource.includes('background-color: ${color}22')
      && !collabCursorSource.includes('box-shadow: inset 0 0 0 1px ${color}33'),
    'Expected collaborator selections to use distinct non-comment styling',
  );
  assert(
    marksSource.includes("if (data?.resolved) continue;"),
    'Expected resolved comments to be skipped when mark decorations are rebuilt',
  );

  const collabPath = path.resolve(process.cwd(), 'server', 'collab.ts');
  const collabSource = readFileSync(collabPath, 'utf8');
  assert(
    collabSource.includes('export function removeAgentPresenceFromLoadedCollab('),
    'Expected collab helper to remove agent presence and cursor atomically',
  );
  assert(
    collabSource.includes('function normalizeIsoTimestamp(value: unknown, fallbackIso: string): string {'),
    'Expected collab presence writes to normalize malformed timestamps to canonical ISO strings',
  );
  assert(
    collabSource.includes('const incomingAt = normalizeIsoTimestamp((entry as any).at, nowIso);'),
    'Expected presence apply path to sanitize incoming timestamp fields',
  );
  assert(
    collabSource.includes('normalizeAgentScopedId(entry.id)')
      && collabSource.includes('normalizeAgentScopedId(hint.id)')
      && collabSource.includes('pruneExpiredAgentEphemera(slug, doc)'),
    'Expected collab runtime to validate and prune invalid agent ids defensively',
  );

  const agentRoutesPath = path.resolve(process.cwd(), 'server', 'agent-routes.ts');
  const agentRoutesSource = readFileSync(agentRoutesPath, 'utf8');
  assert(
    agentRoutesSource.includes("agentRoutes.post('/:slug/presence/disconnect',"),
    'Expected API route for presence disconnect',
  );
  assert(
    agentRoutesSource.includes("const identity = resolveExplicitAgentIdentity(body, req.header('x-agent-id'));")
      && agentRoutesSource.includes("code: 'INVALID_AGENT_IDENTITY'")
      && !agentRoutesSource.includes('Read current document state (this auto-joins presence)'),
    'Expected agent routes to require explicit identity for presence and reject invalid ids',
  );
  assert(
    bridgeSource.includes('private enum ExplicitAgentIdResolution')
      && bridgeSource.includes('private func resolveExplicitAgentId(headers: [String: String], json: [String: Any]) -> ExplicitAgentIdResolution')
      && bridgeSource.includes('private func canonicalBridgeAgentId(_ raw: String) -> String?')
      && !bridgeSource.includes('if let by = json["by"] as? String, by.hasPrefix("ai:") {\n            return String(by.dropFirst(3))\n        }')
      && bridgeSource.includes('sendResponse(connection, status: 400, body: "{\\"error\\": \\"agentId must be agent-scoped\\"}")'),
    'Expected local Proof bridge to require explicit identity for presence and reject invalid agent ids',
  );

  console.log('✓ collab regression guards round 2 checks');
}

run();
