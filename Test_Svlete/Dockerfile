# ---- 1) BUILD FRONT (Vite) ----
FROM --platform=$BUILDPLATFORM node:20-bookworm AS builder
WORKDIR /app
ENV CI=1

COPY package*.json ./
# include=optional pour les binaires rollup natifs (si présents)
RUN npm install --no-audit --no-fund --include=optional

COPY . .
RUN npm run build

# ---- 2) RUNTIME (Node + SQLite) ----
FROM node:20-bookworm
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY server ./server

RUN mkdir -p data

EXPOSE 3000
CMD ["node", "server/index.js"]
