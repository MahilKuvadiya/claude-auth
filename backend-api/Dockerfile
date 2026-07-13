# Build stage — install all deps, generate the Prisma client, then drop dev deps.
# (Prisma's client + query engine are generated into node_modules and survive the prune;
# only the `prisma` CLI devDependency is removed.)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npm prune --omit=dev

# Runtime — distroless Node 22 (no shell, minimal attack surface).
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY openapi ./openapi
# Cloud Run sets PORT; config.js reads it (default 8080).
CMD ["src/index.js"]
