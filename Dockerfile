# syntax=docker/dockerfile:1

# ---- Build the React client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- Run the same-origin Express/Socket.IO application ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7860
# Hugging Face Persistent Storage is mounted at this path.
ENV FLEX_DATA_DIR=/data
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
# index.js is /app/src/index.js, so ../../client/dist resolves to this directory.
COPY --from=client-build /app/client/dist /app/client/dist
RUN mkdir -p /data/uploads /data/backups

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7860/healthz >/dev/null || exit 1
CMD ["node", "src/index.js"]
