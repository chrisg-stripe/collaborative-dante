import { readFileSync } from 'node:fs';
import path from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  const serverSource = readFileSync(path.resolve(process.cwd(), 'server/index.ts'), 'utf8');

  const healthStart = serverSource.indexOf("app.get('/health', (_req, res) => {");
  assert(healthStart !== -1, 'Expected /health route in server/index.ts');

  const healthEnd = serverSource.indexOf('\n});\n\n', healthStart);
  assert(healthEnd !== -1, 'Expected to isolate /health route body');

  const healthBlock = serverSource.slice(healthStart, healthEnd);

  const railwayIdx = healthBlock.indexOf('process.env.RAILWAY_GIT_COMMIT_SHA');
  const githubIdx = healthBlock.indexOf('process.env.GITHUB_SHA');
  const commitIdx = healthBlock.indexOf('process.env.COMMIT_SHA');
  const proofIdx = healthBlock.indexOf('process.env.PROOF_BUILD_SHA');

  assert(railwayIdx !== -1, 'Expected /health to read RAILWAY_GIT_COMMIT_SHA');
  assert(githubIdx !== -1, 'Expected /health to read GITHUB_SHA');
  assert(commitIdx !== -1, 'Expected /health to read COMMIT_SHA');
  assert(proofIdx !== -1, 'Expected /health to read PROOF_BUILD_SHA');
  assert(
    railwayIdx < proofIdx && githubIdx < proofIdx && commitIdx < proofIdx,
    'Regression guard: /health must prefer runtime deploy commit env vars ahead of fallback PROOF_BUILD_SHA so stale manual env values do not lie about the active deployment',
  );

  console.log('✓ /health prefers runtime deploy SHA env vars before fallback PROOF_BUILD_SHA');
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
