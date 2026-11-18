#!/bin/bash
# Films the ticker bands only, as a contact sheet, while sending one ticker command.
# The camera starts first, so the sheet shows the moment the message begins.
#
#   tools/ticker-film.sh "54 01 01 01" "SOME TEXT" label [seconds] [fps] [settle-seconds]
#
# Frames run left to right, top to bottom, and each frame holds two strips:
# the left panel's ticker band above the right panel's.
# Strip positions come from STRIP_LEFT and STRIP_RIGHT (w:h:x:y in the 1080p frame).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEADER="$1"
TEXT="$2"
LABEL="$3"
SECONDS_TO_FILM="${4:-10}"
FPS="${5:-2}"
SETTLE="${6:-2.5}"
STRIP_LEFT="${STRIP_LEFT:-700:48:370:893}"
STRIP_RIGHT="${STRIP_RIGHT:-750:48:1165:913}"
CAMERA="MacBook Air Camera"
DIR="$ROOT/captures/photos"
OUT="$DIR/$(date +%H%M%S)-ticker-${LABEL}.jpg"

FRAMES=$(awk -v s="$SECONDS_TO_FILM" -v f="$FPS" 'BEGIN{print int(s*f)}')
ROWS=$(( (FRAMES + 1) / 2 ))
TOTAL=$(awk -v s="$SECONDS_TO_FILM" -v w="$SETTLE" 'BEGIN{print s+w+1}')
TRIM=$(awk -v w="$SETTLE" 'BEGIN{print w-0.5}')

mkdir -p "$DIR"
cd "$ROOT"

ffmpeg -hide_banner -loglevel fatal -y \
  -f avfoundation -framerate 30 -video_size 1920x1080 -pixel_format nv12 -t "$TOTAL" -i "$CAMERA" \
  -filter_complex "[0:v]trim=start=${TRIM},setpts=PTS-STARTPTS,fps=${FPS},split=2[a][b];[a]crop=${STRIP_LEFT},scale=800:-2[l];[b]crop=${STRIP_RIGHT},scale=800:-2[r];[l][r]vstack,tile=2x${ROWS}:padding=6:color=white[out]" \
  -map '[out]' -frames:v 1 -q:v 3 "$OUT" &
CAMERA_PID=$!

sleep "$SETTLE"
TEXT_HEX="$(printf '%s' "$TEXT" | xxd -p | tr -d '\n' | sed 's/../& /g')"
FIRST="$(echo "$HEADER" | awk '{print $1}')"
node tools/probe.js --base "$HEADER $TEXT_HEX" --pos 0 --first "0x$FIRST" --last "0x$FIRST" \
  --gap 50 --keep-going --label "ticker film: $HEADER '$TEXT'" | grep -E ' RECV | ERROR ' || true

wait "$CAMERA_PID"
echo "$OUT"
