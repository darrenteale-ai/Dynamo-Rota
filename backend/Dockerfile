# Using slim (glibc) rather than alpine — better-sqlite3's prebuilt binaries
# target glibc, and building from source on musl can fail without extra tooling.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# /app/data holds the SQLite file — mount a volume here so data survives container restarts.
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
