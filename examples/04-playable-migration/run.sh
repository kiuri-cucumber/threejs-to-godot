#!/usr/bin/env bash
# Default: required model + native behavior checks. --visual also requires a
# working Chromium and windowed Godot renderer, and never silently skips them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [[ "$#" -gt 1 || ( -n "${1:-}" && "${1:-}" != "--visual" ) ]]; then
  echo "Usage: $0 [--visual]" >&2
  exit 2
fi
node --test "$HERE/tests/model.test.mjs"
node "$HERE/verify.mjs"
if [[ "${1:-}" == "--visual" ]]; then
  node "$HERE/capture-three.mjs" "$HERE/out/three"
  node "$HERE/capture-three.mjs" "$HERE/out/three-again"
  "${GODOT:-godot}" --path "$HERE/godot" --script res://capture.gd -- --out="$HERE/out/godot"
  "${GODOT:-godot}" --path "$HERE/godot" --script res://capture.gd -- --out="$HERE/out/control-fov-plus-5" --control=fov-plus-5
  node "$HERE/compare-visuals.mjs"
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--visual]" >&2
  exit 2
fi
