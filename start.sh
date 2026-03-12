#!/bin/bash
set -e

# Auto-generate collab signing secret if not set
if [ -z "$PROOF_COLLAB_SIGNING_SECRET" ]; then
  export PROOF_COLLAB_SIGNING_SECRET=$(openssl rand -hex 32)
  echo "[start] Generated ephemeral PROOF_COLLAB_SIGNING_SECRET"
fi

exec npx tsx server/index.ts
