#!/usr/bin/env bash
# Friday PostHog review — runs headless via cron.
#
# Pulls weekly metrics, then asks Claude (headless) to draft a short founder-voice
# review and append it to ~/Documents/makerly-friday-review.md. No babysitting.
#
# Install:
#   crontab -e
#   3 9 * * 5  /Users/pareen/conductor/workspaces/maker/tyler/scripts/posthog-friday.sh
#
# Logs: /tmp/posthog-friday.log
set -euo pipefail

REPO="/Users/pareen/conductor/workspaces/maker/tyler"
OUT="$HOME/Documents/makerly-friday-review.md"
LOG="/tmp/posthog-friday.log"
WEEK="$(date +%Y-%m-%d)"

cd "$REPO"

# Pull metrics
METRICS="$(node scripts/posthog-weekly.js 2>&1)" || {
  echo "[$WEEK] metrics pull failed" >> "$LOG"
  echo "$METRICS" >> "$LOG"
  exit 1
}

# Headless Claude: turn raw numbers into a one-page review
PROMPT="You're reviewing this week's Makerly metrics with the founder. Be terse,
specific, founder-voice. No corporate language. Call out: top WoW deltas, funnel
drop-offs, one thing to fix next week, one thing working that we should double down
on. Output markdown. Numbers below.

$METRICS"

REVIEW="$(claude -p "$PROMPT" --allowedTools 'Read,Bash' 2>&1 || echo "claude -p failed; raw metrics only")"

{
  echo
  echo "# Makerly weekly review — $WEEK"
  echo
  echo "$REVIEW"
  echo
  echo "---"
  echo
  echo "<details><summary>Raw metrics</summary>"
  echo
  echo '```'
  echo "$METRICS"
  echo '```'
  echo
  echo "</details>"
} >> "$OUT"

echo "[$WEEK] wrote review to $OUT" >> "$LOG"
