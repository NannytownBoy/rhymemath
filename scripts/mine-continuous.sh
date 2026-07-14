#!/bin/bash
# mine-continuous.sh
# RhymeMath — Continuous miner with cooldown override
#
# Runs the lyric miner in a permanent loop.
# - FORCE_ALL=1     bypasses the 3-day cooldown on every pass
# - CONTINUOUS=1    signals the miner it's in loop mode
# - Sleeps 90 minutes between full sweeps (adjustable via SLEEP_MINS)
# - Logs to /tmp/mine-continuous.log
# - To stop: kill $(cat /tmp/mine-continuous.pid)

SLEEP_MINS=${SLEEP_MINS:-90}
LOG=/tmp/mine-continuous.log
PID_FILE=/tmp/mine-continuous.pid

echo $$ > "$PID_FILE"
echo "Mine loop started (PID $$) — sleeping ${SLEEP_MINS}m between sweeps" | tee -a "$LOG"

while true; do
  echo "" >> "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$LOG"
  echo "SWEEP START: $(date)" >> "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$LOG"

  FORCE_ALL=1 \
  CONTINUOUS=1 \
  GENIUS_TOKEN="${GENIUS_TOKEN}" \
  DATABASE_URL="${DATABASE_URL}" \
  node scripts/cid-auto-mine.mjs 2>&1 | tee -a "$LOG"

  echo "" >> "$LOG"
  echo "SWEEP END: $(date) — sleeping ${SLEEP_MINS}m" >> "$LOG"
  sleep $((SLEEP_MINS * 60))
done
