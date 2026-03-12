# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Proof SDK — an open-source collaborative markdown editor with provenance tracking and an agent HTTP bridge. The hosted product is [Proof](https://proofeditor.ai). This repo contains the editor frontend, collaboration server, document store, and agent bridge.

## Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start Vite dev server (editor on :3000, proxies API to :4000)
npm run serve            # Start Express API/collab server on :4000
npm run build            # Vite build + finalize web artifact
npm test                 # Run all tests (proof-sdk + server-routes-share)
```

Run a single test file directly with tsx:

```bash
npx tsx src/tests/<test-file>.test.ts
```

The two test suites invoked by `npm test`:
- `npm run test:proof-sdk` — agent bridge client tests
- `npm run test:server-routes-share` — server routes and share flow tests

For local development, run `npm run dev` and `npm run serve` in parallel (two terminals). The Vite dev server proxies `/api`, `/d`, `/documents`, `/ws`, and other server routes to localhost:4000.

## Architecture

### Monorepo Structure

npm workspaces with packages under `packages/*` and apps under `apps/*`.

**Root `src/`** — Main application source (not a package):
- `src/editor/` — ProseMirror/Milkdown editor runtime, plugins, schema
- `src/agent/` — Agent orchestrator, HTTP bridge client, skills, tools
- `src/bridge/` — Bridge executor and route handlers (share, collab, marks)
- `src/ui/` — UI components (agent presence, review menu, theme picker, etc.)
- `src/shared/` — Shared utilities (agent identity, live markdown)
- `src/formats/` — Marks, provenance sidecar, remark plugins
- `src/tests/` — All test files (run with tsx, no test framework)

**`server/`** — Express server (not under src):
- `server/index.ts` — Entry point, mounts all route groups
- `server/routes.ts` — Core document CRUD and share routes
- `server/agent-routes.ts` — Agent operation routes
- `server/bridge.ts` — Bridge mount router for `/d` and `/documents` prefixes
- `server/collab.ts` — Hocuspocus collab runtime (Yjs-based)
- `server/db.ts` — SQLite database (better-sqlite3)
- `server/mutation-coordinator.ts` — Coordinates mutations with dual-write

**`packages/`** — Extractable SDK packages (re-export from root src/server):
- `@proof/core` — Document types, marks, provenance
- `@proof/editor` — Editor runtime and plugins
- `@proof/server` — Server route factories (`mountProofSdkRoutes`)
- `@proof/sqlite` — SQLite storage adapters
- `@proof/agent-bridge` — Agent bridge client and route helpers

**`apps/proof-example/`** — Reference demo app with agent bridge example

### Key Patterns

- **Collaboration**: Yjs + Hocuspocus for realtime CRDT collaboration over WebSocket (`/ws`)
- **Editor**: Milkdown (ProseMirror wrapper) with custom plugins for suggest-changes, comments, provenance
- **Agent bridge**: HTTP REST API at `/documents/:slug/bridge/*` for agent read/write operations (state, marks, comments, suggestions, rewrite, presence)
- **Document lifecycle**: `POST /documents` creates a doc, returns slug + tokens. Mutations via `POST /documents/:slug/ops`. Event polling via `/documents/:slug/events/pending`
- **Auth tokens**: `ownerSecret` (full owner access) vs `accessToken` (scoped viewer/commenter/editor)
- **Tests**: Plain tsx test files with built-in assertions (no Jest/Vitest). Each file is self-contained.

### Route Mounting

Routes are mounted at multiple prefixes for compatibility:
- `/documents/*` — Canonical SDK routes
- `/api/*` — Legacy internal routes
- `/d/*` — Bridge mount (share viewer)

## TypeScript

- Strict mode enabled, `noUnusedLocals` and `noUnusedParameters` enforced
- ESM modules (`"type": "module"`) throughout
- Target ES2020, module resolution `bundler`
- Server code runs via `tsx` (no compile step needed for dev)

## Key Docs

- `AGENT_CONTRACT.md` — Full agent HTTP contract (create, read, mutate, poll)
- `docs/agent-docs.md` — Agent documentation
- `docs/PROVENANCE-SPEC-v2.md` — Provenance model spec
- `docs/adr/2026-03-proof-sdk-public-core.md` — SDK extraction ADR
