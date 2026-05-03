# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apk add --no-cache git openssh-client
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY worker/package.json ./worker/
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache git openssh-client
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# Install Claude Code CLI globally so the pipeline can spawn `claude`
RUN npm install -g @anthropic-ai/claude-code
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/worker/node_modules ./worker/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY shared ./shared
COPY worker ./worker
COPY web/package.json ./web/
COPY worker/scripts/bootstrap-claude-auth.sh /usr/local/bin/bootstrap-claude-auth.sh
RUN chmod +x /usr/local/bin/bootstrap-claude-auth.sh
ENV NODE_ENV=production
# Workspace clones live here; mount a Railway Volume at this path for persistence
ENV WORKSPACE_REPOS_DIR=/data/workspace/repos
RUN mkdir -p /data/workspace/repos /root/.claude
ENTRYPOINT ["/usr/local/bin/bootstrap-claude-auth.sh"]
CMD ["pnpm", "--filter", "@seo-forge/worker", "start"]
