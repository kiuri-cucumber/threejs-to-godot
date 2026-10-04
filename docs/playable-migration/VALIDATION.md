# Recorded validation — 2026-10-04

Scope: the original playable sample in `examples/04-playable-migration/`, against repository baseline `f57b5538e5ad1bc631c4a8e59ef0bfd78c129ab2`. This record does not extend old static-example claims to all platforms.

## Environment

- Linux x86_64; Node v24.19.0
- Three.js 0.185.1; Playwright 1.63.0; installed Chromium 154.0.8037.57
- Godot 4.6.3-stable official, hash `7d41c59c457bd5a245092b4e7eb2d833e3b3f8c3`
- Godot Compatibility / OpenGL, Mesa llvmpipe (LLVM 19.1.7, 256 bits)
- Frozen scene captures: 960 × 540. No installed software or project dependencies were changed for this run.

The new fixture was measured on Godot 4.6.3. The rest of this repository's earlier measured environment is Godot 4.7/macOS; neither result is a substitute for the other.

## Executed and passed

| Check | Result |
| --- | --- |
| Model / contract unit suite | 10 tests, 0 failures, 0 skips |
| Main JS/native replay | All 261 frames agree on state, elapsed ticks, event ticks and contact; maximum positional error 0.00016245842 m, under the declared 0.0002 m |
| Native fresh-process repeat | Identical positions to a 1e-12 m comparison tolerance and identical state/events |
| Upper/lower exact-corner replays | 130 frames each; maximum error 0.00016078949 m; blocked while touching the edge, then moves after clearing it |
| Native input/UI | Named-action movement, release, focus-loss release, repeated Restart button, goal message |
| Browser input/UI | Keyboard movement, key release, blur, R, repeated Restart button, goal message; no page script errors |
| Collision disabled / restart ignored | Both rejected by the native behavior comparator |
| Capture contract | Full specification, ordered post-tick states, size and actual camera pose/FOV/clip planes checked; stale/malformed-contract and camera negatives have unit coverage |
| Source repeat captures | All four pixel-identical, mean RGB error 0 |
| Normal Three.js/Godot pairs | All four pass; mean absolute RGB error 0.11574–0.11747 on a 0–255 scale, limit 1.0 |
| +5° FOV control | All four fail image comparison, error about 3.99–4.17; visibly wrong and over 2× the limit. Actual camera validation also fails as expected |
| Existing Node/Chromium regressions | 65 tests, 0 failures, 0 skips, run through the supported cloud desktop |
| Existing headless Godot regressions | 33 tests / 149 checks pass |
| Existing physics example 03 | Passes Jolt and GodotPhysics3D, two processes each; original repeatability/fingerprint/end-position checks |
| JSON Schema | Draft 2020-12 schema self-check and the checked-in contract validate |
| Source preservation | Both MIT license files unchanged; original Japanese root README section byte-for-byte unchanged |
| Independent review | Exact-corner divergence and strict-validation holes found and fixed; edge/diagonal behavior probes rechecked |

## Opened images

Each [normal comparison](../../examples/04-playable-migration/expected/) places Three.js on the left and Godot on the right.

- `start.png`: same floor/player/wall/goal placement; small antialiasing differences at edges
- `wall-contact.png`: player stops at the wall; expected occlusion, no visible penetration
- `goal.png`: player reaches the green goal; both show the frozen won state
- `restart.png`: both recover the initial spawn composition
- `three-goal-ui.png` and `godot-goal-ui.png`: goal text and Restart control are readable, without clipped glyphs; the DOM and native overlay layouts are intentionally different
- All four source-repeat pairs and all four wrong-FOV pairs were also opened; repeat pairs match and the wrong-FOV scene is visibly smaller

Numeric measurements and image-review notes are stored in [expected.json](../../examples/04-playable-migration/expected.json). The threshold is deliberately provisional and measured only in this listed environment. It was not loosened to make a failing capture pass.

## Initially blocked, then resolved

A direct sandboxed Chromium launch could not create its Unix socket; the shell also had no display. That first aggregate run reported 57 passes and 8 browser skips. It was **not** treated as full validation. The supported cloud desktop successfully ran the browser suite, native viewport captures, and the full 65-test suite above. The user's computer was not used.

During implementation, the source static-server root had a trailing-slash bug; actual browser testing caught it and the final browser run passes. Independent review also caught exact-corner float behavior that the main path missed. The source now uses an explicit conservative closed corner boundary and the two dedicated native regressions pass, without increasing position tolerance.

## Not executed or not claimed

- A new full rendered run of old static examples 01/02. Their code/assets were unchanged; their existing recorded rendering claims remain as documented
- Godot 4.7 for this new sample, other OS/GPU combinations, or performance benchmarks
- Godot Web export, mobile/gamepad control, screen-reader compatibility of the native UI, audio, animation, multiplayer, arbitrary physics or shaders
- Third-party onboarding reproduction or public runtime deployment. This validation record was prepared before branch/PR publication; no merge or release

## Reproduce

From repository root after installing the already-pinned dependencies:

```sh
export GODOT=/path/to/godot
export TG_CHROMIUM_EXECUTABLE=/path/to/chromium
examples/04-playable-migration/run.sh
examples/04-playable-migration/run.sh --visual
(cd skills/threejs-to-godot-port/scripts && npm test)
GODOT="$GODOT" skills/threejs-to-godot-port/scripts/test-godot.sh
GODOT="$GODOT" examples/03-physics-recheck/run.sh
```

The visual command requires a working display and Chromium. Read the separate behavior and visual reports and open every comparison. A skipped, blocked or failed stage is not a pass.
