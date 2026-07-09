#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  RhymeMath Continuous Miner
#  Keeps running cid-auto-mine.mjs in a loop.
#  When all artists are on cooldown it waits 6 hours then retries.
# ─────────────────────────────────────────────────────────────

export GENIUS_TOKEN="${GENIUS_TOKEN:-2eKGsXG31hJYunM85zb-3IyIZsNhZ1uPBAyoV1qfWz4Zx-rPGmZ9ihaIv6lKsaFL}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:TsKMoFmORcQVhbhlDMJVlsbTrKGmRELC@reseau.proxy.rlwy.net:12215/railway}"
export API_BASE="${API_BASE:-https://rhymemath-production.up.railway.app}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WAIT_HOURS=6
RUN=0

echo "╔══════════════════════════════════════════════╗"
echo "║  RhymeMath Continuous Mine Loop              ║"
echo "║  Ctrl+C to stop at any time                  ║"
echo "╚══════════════════════════════════════════════╝"

while true; do
  RUN=$((RUN + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  RUN #${RUN} — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  node "$SCRIPT_DIR/cid-auto-mine.mjs"
  EXIT=$?

  if [ $EXIT -ne 0 ]; then
    echo ""
    echo "⚠  Miner exited with error (code $EXIT). Retrying in 5 minutes..."
    sleep 300
    continue
  fi

  echo ""
  echo "✅  Run #${RUN} complete. Waiting ${WAIT_HOURS}h for cooldowns to clear..."
  echo "    Next run at: $(date -v +${WAIT_HOURS}H '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d "+${WAIT_HOURS} hours" '+%Y-%m-%d %H:%M:%S')"
  sleep $((WAIT_HOURS * 3600))
done
