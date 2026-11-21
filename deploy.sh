#!/bin/bash
# deploy.sh — build all 7 services and start/reload with PM2
# Run once on a fresh Utho VM:  bash deploy.sh --fresh
# Redeploy after a git pull:    bash deploy.sh

set -e

FRESH=${1:-""}

# ── 1. Install Node deps for every service ──────────────────
SERVICES=(users-service gigs-service events-service payment-service media-service search-service support-service)

for svc in "${SERVICES[@]}"; do
  echo "→ Installing $svc"
  (cd "$svc" && npm ci --omit=dev)
done

# ── 2. Build TypeScript ──────────────────────────────────────
for svc in "${SERVICES[@]}"; do
  echo "→ Building $svc"
  (cd "$svc" && npm run build)
done

# ── 3. Start or reload PM2 ──────────────────────────────────
if [ "$FRESH" = "--fresh" ]; then
  npm install -g pm2 2>/dev/null || true
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup   # prints a command — run it once to survive reboots
else
  pm2 reload ecosystem.config.js --update-env
fi

echo ""
echo "✓ All services running. Check with: pm2 status"
