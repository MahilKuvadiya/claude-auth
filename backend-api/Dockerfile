# Build stage — install production deps only.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Runtime — distroless Node 22 (no shell, minimal attack surface).
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY openapi ./openapi
# Cloud Run sets PORT; config.js reads it (default 8080).
CMD ["src/index.js"]
