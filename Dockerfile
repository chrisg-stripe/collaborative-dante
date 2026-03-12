# Stage 1: Install dependencies + compile native addons (better-sqlite3)
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN npm install

# Stage 2: Build Vite frontend (IIFE bundle → dist/)
FROM deps AS builder
COPY . .
RUN npm run build

# Stage 3: Production image
FROM node:20-slim
WORKDIR /app

# Install openssl for start.sh secret generation
RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Copy pre-compiled node_modules (includes better-sqlite3 native addon)
COPY --from=deps /app/node_modules/ ./node_modules/
COPY --from=deps /app/packages/ ./packages/

# Copy application source
COPY package.json tsconfig.json ./
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY docs/agent-docs.md ./docs/agent-docs.md
COPY AGENT_CONTRACT.md ./

# Copy built frontend from builder
COPY --from=builder /app/dist/ ./dist/

# Copy entrypoint
COPY start.sh ./start.sh
RUN chmod +x start.sh

ENV PORT=4000
ENV NODE_ENV=production
ENV PROOF_ENV=production
ENV PROOF_TRUST_PROXY_HEADERS=true

EXPOSE 4000

CMD ["./start.sh"]
