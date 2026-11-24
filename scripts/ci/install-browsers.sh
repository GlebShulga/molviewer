#!/usr/bin/env bash
# Installs the browsers the E2E and snapshot workflows use, and the system
# packages they need, trying a stalled or failed part once more.
#
# A normal install takes under a minute. In run 45257461464 (2026-11-23) one
# shard printed nothing for 10 minutes and was stopped, so none of its tests
# ran, while another fetched the apt packages at 394 kB/s instead of ~12 MB/s
# and finished after 6 minutes. A stalled attempt is killed and run again on
# a fresh connection, with limits that let slow but working installs finish:
# - system packages: 8 minutes, above that 6-minute case;
# - browsers: 12 minutes. They are 390 MB (Chromium 172, its headless shell
#   115, WebKit 100, ffmpeg 2), about 16.5 minutes at 394 kB/s. Playwright
#   keeps the browsers that finished, so the second attempt fetches only the
#   rest: the first gets Chromium, the second the other ~217 MB.
#
# The system packages and the browsers are separate steps so that the log
# shows which of them stalled; the stalled shard above never said.
#
# Worst case, every attempt stalling: 2 x 8.5 + 2 x 12.5 = 42 minutes. The
# workflow steps' timeout-minutes (45) sits above that.
set -euo pipefail

BROWSERS=(chromium webkit)

# run_with_retry <minutes> <label> <command...>
# Runs the command with a time limit (TERM, then KILL 30 s later, to the
# whole process group) and runs it once more if it stalled or failed.
run_with_retry() {
  local minutes=$1 label=$2
  shift 2
  local try status
  for try in 1 2; do
    status=0
    timeout --kill-after=30s "${minutes}m" "$@" || status=$?
    if [ "$status" -eq 0 ]; then
      return 0
    fi
    if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
      echo "::warning::$label: attempt $try stalled and was stopped after $minutes minutes"
    else
      echo "::warning::$label: attempt $try failed (exit $status)"
    fi
    if [ "$try" -eq 1 ]; then
      # A killed apt-get can keep running under sudo and hold the dpkg lock,
      # or leave dpkg half done; either would fail the second attempt.
      sudo pkill -KILL -x apt-get || true
      sudo dpkg --configure -a || true
    fi
  done
  echo "::error::$label: both attempts stalled or failed"
  return 1
}

run_with_retry 8 "System packages for the browsers" \
  pnpm exec playwright install-deps "${BROWSERS[@]}"
run_with_retry 12 "Browser download" \
  pnpm exec playwright install "${BROWSERS[@]}"
