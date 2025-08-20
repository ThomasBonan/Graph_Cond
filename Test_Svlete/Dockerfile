# ---- 1) BUILD FRONT (Vite) ----
FROM --platform=$BUILDPLATFORM node:20-bookworm AS builder
WORKDIR /app
ENV CI=1

COPY package*.json ./
# include=optional pour les binaires rollup natifs (si présents)
RUN npm install --no-audit --no-fund --include=optional

COPY . .
RUN npm run build

# ---- 2) RUNTIME (Caddy) ----
FROM caddy:2-alpine
WORKDIR /srv
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443