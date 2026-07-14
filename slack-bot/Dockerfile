# Two-stage build → distroless runtime (mirrors backend-api/Dockerfile).
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
# Use `npm install` (not `npm ci`) until a package-lock.json is committed.
RUN npm install --omit=dev

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production
# distroless nodejs image's entrypoint is `node`; Cloud Run injects PORT.
CMD ["src/index.js"]
