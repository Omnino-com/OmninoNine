#!/bin/bash
# Builds the Companion module and packs it into a zip with everything a user needs
# to load it as a Companion developer module.
#
#   scripts/package-companion.sh
#
# Output: release/OmninoNine-cloud9-companion-v<version>.zip
# Run `npm install` in companion-modules/cloud9-button-board once first.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODULE="$ROOT/companion-modules/cloud9-button-board"
VERSION="$(node -p "require('$MODULE/package.json').version")"
MANIFEST_VERSION="$(node -p "require('$MODULE/companion/manifest.json').version")"
NAME="OmninoNine-cloud9-companion-v$VERSION"
STAGE="$ROOT/release/$NAME"
ZIP="$ROOT/release/$NAME.zip"
DEST="$STAGE/companion-modules/cloud9-button-board"

if [ "$VERSION" != "$MANIFEST_VERSION" ]; then
  echo "Version mismatch: package.json has $VERSION, companion/manifest.json has $MANIFEST_VERSION" >&2
  exit 1
fi
if [ ! -d "$MODULE/node_modules" ]; then
  echo "Run 'npm install' in $MODULE first" >&2
  exit 1
fi

echo "== Build and test"
(cd "$MODULE" && npm run build && npm test)

echo "== Stage $NAME"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$DEST/node_modules"
cp -R "$MODULE/companion" "$MODULE/dist" "$MODULE/package.json" "$DEST/"
cp "$ROOT/LICENSE" "$DEST/"

# Production dependencies only. Symlinks are copied as real files, so the driver in
# lib/ ends up inside the module and the folder works anywhere.
(cd "$MODULE" && npm ls --omit=dev --all --parseable) | tail -n +2 | while read -r dep; do
  rel="${dep#"$MODULE/"}"
  mkdir -p "$DEST/$(dirname "$rel")"
  cp -RL "$dep" "$DEST/$rel"
done

cp "$ROOT/packaging/README.md" "$ROOT/LICENSE" "$STAGE/"
cp -R "$ROOT/packaging/linux" "$STAGE/"
mkdir -p "$STAGE/docs"
cp "$ROOT/docs/PROTOCOL.md" "$STAGE/docs/"

echo "== Zip"
(cd "$ROOT/release" && zip -qrX "$NAME.zip" "$NAME" -x '*.DS_Store')
echo "Wrote $ZIP ($(du -h "$ZIP" | cut -f1))"
