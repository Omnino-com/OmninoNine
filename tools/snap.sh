#!/bin/bash
# Takes one still from the MacBook's built-in camera and saves ONLY an enlarged
# crop of the two LCD panels (left panel on top, right panel below). The rest of
# the frame is discarded. The camera is only on for the second or two this takes.
#
#   tools/snap.sh [label]
#
# Prints the path of the saved photo. The first 45 frames are skipped so
# auto-exposure can settle. The crop values assume the board stays where it is;
# set SNAP_FULL=1 to save a whole frame when re-aiming.

set -euo pipefail

CAMERA="MacBook Air Camera"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/captures/photos"
LABEL="${1:-snap}"
OUT="$DIR/$(date +%H%M%S)-${LABEL}.jpg"

# Panel positions in the 1920x1080 frame (w:h:x:y).
LEFT_CROP="${SNAP_LEFT:-810:190:200:460}"
RIGHT_CROP="${SNAP_RIGHT:-815:180:1105:495}"

mkdir -p "$DIR"

if [ "${SNAP_FULL:-0}" = "1" ]; then
  FILTER='[0:v]select=gte(n\,45)[out]'
else
  FILTER="[0:v]select=gte(n\\,45),split=2[a][b];[a]crop=${LEFT_CROP},scale=1600:-2[l];[b]crop=${RIGHT_CROP},scale=1600:-2[r];[l][r]vstack[out]"
fi

ffmpeg -hide_banner -loglevel fatal -y \
  -f avfoundation -framerate 30 -video_size 1920x1080 -pixel_format nv12 -i "$CAMERA" \
  -filter_complex "$FILTER" -map '[out]' -frames:v 1 -fps_mode vfr -q:v 2 "$OUT"

echo "$OUT"
