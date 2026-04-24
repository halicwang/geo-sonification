#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Zixiao Wang
#
# Encode the seven ambience WAVs to Opus 128 kbps in place.
#
# Source:      frontend/audio/ambience/<name>.wav
# Destination: frontend/audio/ambience/<name>.opus
#
# Both source and destination are gitignored. The .opus files are what
# the audio-engine fetches in production (from R2) and locally (served
# by Express). After running this script, re-upload the .opus files to
# R2 with: see docs/DEPLOYMENT.md → "How to re-deploy each layer → R2".
#
# Bitrate rationale: 128 kbps libopus is transparent for ambient
# textures (no perceptible loss vs WAV). 96 kbps is also fine; 160 kbps
# wastes bytes for no audible benefit.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "error: ffmpeg not found on PATH. Install with: brew install ffmpeg" >&2
    exit 1
fi

NAMES=(bare crop forest grass shrub urban water)
SRC_DIR="frontend/audio/ambience"

echo "Encoding ${#NAMES[@]} ambience WAVs to Opus 128k..."
for name in "${NAMES[@]}"; do
    wav="$SRC_DIR/${name}.wav"
    opus="$SRC_DIR/${name}.opus"
    if [[ ! -f "$wav" ]]; then
        echo "  skip ${name}: $wav missing"
        continue
    fi
    ffmpeg -hide_banner -loglevel error -y \
        -i "$wav" \
        -c:a libopus -b:a 128k -vbr on -compression_level 10 -application audio \
        "$opus"
    size=$(ls -lh "$opus" | awk '{print $5}')
    printf "  %-12s -> %s\n" "${name}.opus" "$size"
done

echo ""
echo "Total Opus payload:"
du -sh "$SRC_DIR"/*.opus 2>/dev/null | awk '{s+=$1} END {printf "  combined ~%dM\n", s}' \
    || du -ch "$SRC_DIR"/*.opus | tail -1
