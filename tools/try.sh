#!/bin/bash
# Sends one report to the board, then photographs the panels.
#
#   tools/try.sh "53 00 00 07" label [fill-hex]
#
# The bytes are padded to 64 with the fill (default 00). Logged by probe.js.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BYTES="$1"
LABEL="${2:-try}"
FILL="${3:-00}"
FIRST="$(echo "$BYTES" | awk '{print $1}')"

cd "$ROOT"
node tools/probe.js --base "$BYTES" --pos 0 --first "0x$FIRST" --last "0x$FIRST" \
  --fill "$FILL" --gap 300 --keep-going --label "try: $BYTES fill=$FILL" | grep -E ' RECV | ERROR ' || true
tools/snap.sh "$LABEL"
