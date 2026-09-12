# Using slim (glibc) rather than alpine — better-sqlite3's prebuilt binaries
# target glibc, and building from source on musl can fail without extra tooling.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# NOTE: /app/data holds the SQLite file. To persist it across deploys/restarts,
# attach a Railway Volume mounted at /app/data via the service's Volumes settings
# (dashboard or railway.json/railway.toml "volumes" config) — Docker's VOLUME
# instruction is not supported by Railway's build system.

CMD ["node", "src/server.js"]
