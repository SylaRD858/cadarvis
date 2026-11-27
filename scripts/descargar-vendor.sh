#!/usr/bin/env bash
# Descarga Leaflet 1.9.4 a public/vendor/leaflet para que el mapa no dependa de un CDN.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=public/vendor/leaflet
BASE=https://unpkg.com/leaflet@1.9.4/dist
mkdir -p "$DEST/images"
for f in leaflet.js leaflet.css; do curl -fsSL "$BASE/$f" -o "$DEST/$f"; done
for f in layers.png layers-2x.png marker-icon.png marker-icon-2x.png marker-shadow.png; do
  curl -fsSL "$BASE/images/$f" -o "$DEST/images/$f"
done
echo "Leaflet descargado en $DEST"
