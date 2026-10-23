#!/bin/bash
set -euo pipefail
app="$1"; evidence="$2"
for attempt in 1 2; do
  "$app" > "$evidence/runtime-$attempt.log" 2>&1 &
  pid=$!
  trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
  sleep 12
  kill -0 "$pid"
  xdotool search --onlyvisible --name 'Dashcam Card Scanner' > "$evidence/windows-$attempt.txt"
  while read -r window; do
    xwininfo -id "$window" >> "$evidence/windows-$attempt.txt.details"
    xprop -id "$window" >> "$evidence/windows-$attempt.txt.details"
  done < "$evidence/windows-$attempt.txt"
  if command -v import >/dev/null; then import -window root "$evidence/screen-$attempt.png"; fi
  echo "attempt=$attempt pid=$pid native visible window confirmed" | tee -a "$evidence/restarts.txt"
  kill -TERM "$pid"
  wait "$pid" || true
  trap - EXIT
  sleep 3
done
