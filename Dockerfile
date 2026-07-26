# ---- Build client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- Server ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV FLEX_DATA_DIR=/data
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist
RUN mkdir -p /data/uploads /data/backups
EXPOSE 4000
CMD ["node", "src/index.js"]
