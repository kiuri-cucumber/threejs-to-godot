# 04 — Playable migration: wall, goal, restart

A tiny original Three.js game and a hand-ported, editable Godot project. Walk the blue box around the amber wall onto the green goal. Use WASD / arrows, then R or the Restart button. There are no downloaded art assets, imported private game code, or new npm dependencies.

This is a teaching example, **not an automatic converter**. The static export/material tools do not translate JavaScript, DOM UI, input, or game state. Here those parts are explicitly rebuilt and tested. The floor is visual: movement is constrained to the XZ plane with no gravity. Leaving its painted area does not cause a fall.

## Run either version

From the repository root, install the existing tool dependencies if needed:

```sh
(cd skills/threejs-to-godot-port/scripts && npm ci)
node examples/04-playable-migration/serve.mjs
```

Open the printed local URL for the Three.js original. The server binds only to 127.0.0.1; stop it with Ctrl-C.

Open `godot/project.godot` in Godot 4.6+ and press F6 on `main.tscn`, or:

```sh
godot --path examples/04-playable-migration/godot
```

The floor, player, wall, goal, camera, collision shapes, and Control UI are visible and editable in the scene tree. `contract.json` is the shared specification; if changing the level, update the scene and specification together, then rerun validation. This fixture uses Compatibility rendering and unlit materials to isolate geometry and gameplay. Existing examples 01/02 cover lighting and materials separately.

## Preflight the source

```sh
node skills/threejs-to-godot-port/scripts/preflight.mjs --inventory examples/04-playable-migration/migration-inventory.json
```

Run this from repository root. Input, DOM UI, state and custom collision are reported as manual reconstruction work. The report describes the source's needs; it does not automatically recognize or certify the hand-written port in this example. See the [preflight guide](../../skills/threejs-to-godot-port/references/preflight.md).

## Validate

```sh
export GODOT=/path/to/godot
examples/04-playable-migration/run.sh
```

This runs ten model/contract tests, a 261-frame native Godot replay, a second fresh-process native replay, two exact-corner route replays, actual InputMap/button-signal checks, and two native negative controls. It fails if collision-off or restart-off is not detected. See `out/behavior-report.json`; this command makes no image-parity claim.

For browser input/UI checks and four frozen-state image pairs:

```sh
# If using an already installed browser, explicitly select it:
export TG_CHROMIUM_EXECUTABLE=/path/to/chromium
# Otherwise install the pinned Playwright Chromium as described in the main README.
examples/04-playable-migration/run.sh --visual
```

The visual path requires windowed Godot. A missing browser/display is a failure, not a passing skip. It captures the source twice, checks stability, compares the port, and requires a +5° FOV control to fail by at least 2× the provisional image limit. Open every `out/pairs/*.png`, every negative-control pair, and both `goal-ui.png` files. UI appearance is intentionally rebuilt rather than pixel-equal; UI state/interaction is tested separately.

On a constrained runner, set `XDG_DATA_HOME`, `XDG_CACHE_HOME`, and `XDG_CONFIG_HOME` to writable directories if Godot cannot create its ordinary user-data directories. Do not disable security restrictions or treat a headless renderer as visual validation.

## Files

- `three/model.mjs`: standalone source behavior, swept X-then-Z collision, replay/validation
- `three/scene.mjs`, `three/app.mjs`, `three/index.html`: original render and DOM input/UI
- `godot/main.tscn`: editable native scene, CharacterBody3D, StaticBody3D, Camera3D, Control UI
- `godot/game.gd`: manual behavior port using native `move_and_collide`
- `godot/contract.json`, `contract.schema.json`, `contract.d.ts`: versioned sample-only specification
- `verify.mjs`, `godot/replay.gd`: source/native trace comparison, repeatability and negative controls
- `capture-three.mjs`, `godot/capture.gd`, `compare-visuals.mjs`: frozen-state images and browser UI checks
- [Migration walkthrough](../../docs/playable-migration/README.md): what moved and what was rebuilt
- [Recorded validation](../../docs/playable-migration/VALIDATION.md): executed, failed and unexecuted checks

## Contract v1

One unit is one metre. +X is right; -Z is up/forward on the ground. Both engines use the same world positions and perspective camera. There is no automatic handedness flip.

- Tick 0 is the initial state. Input at tick N applies exactly once; frame N records the **post-update** state.
- Each replay entry holds a movement vector for `ticks` ticks. Each component is -1…1; vectors longer than one are normalized. `restart` is pressed only on the first tick of an entry.
- Updates run at 60 Hz and 3 m/s. Restart takes precedence over movement. It resets position, state, elapsed ticks, and contact; the overall trace tick keeps increasing.
- `wall-contact` is an entry into blocked movement, not every engine-internal contact notification. Position tolerance is 0.0002 m; states, event ticks, and elapsed ticks must match exactly.
- At an exact wall corner, overlap uses a closed boundary with `cornerEpsilon` = 0.0002 m. A player touching the edge must clear it before crossing sideways; upper/lower 38-tick corner routes test this rule separately. This does not widen the position-error tolerance.
- The goal checks the player's centre in its square with a 0.00001 m boundary epsilon. Reaching it freezes gameplay until restart. The epsilon prevents roundoff at the inclusive edge from delaying the event by one tick.
- Capture sidecars bind the full contract, ordered state snapshots and actual camera pose/FOV/clip planes. Stale sidecars are rejected. Frames 0, 60, 240 and 260 are frozen for start/contact/goal/restart images. Waiting for a draw cannot advance the simulation.
- JSON Schema describes structural validation; `validateContract` additionally checks cross-field camera range, unique snapshot names, and snapshot bounds. This schema does not claim to validate all existing static-export formats.

Non-goals: gravity, moving/rotated/concave obstacles, stairs/slopes, rigid bodies, arbitrary shaders, animation, audio, networking, mobile/gamepad input, Godot Web export, and pixel-identical DOM/Control UI.

## 日本語

Three.js の小さな原作と、編集できる Godot 版を並べた移行例です。青い箱を WASD / 矢印キーで動かし、壁を回り込んで緑のゴールへ進みます。R または Restart で再開できます。

入力・UI・ゲーム状態は自動変換せず、Godot の機能で作り直しています。固定 tick の位置・接触・ゴール・再開を照合し、わざと衝突や再開を壊した版が不合格になることも調べます。画像比較と実機描画の確認状況は、上の検証記録で別に示します。任意のゲームを丸ごと自動移植する機能ではありません。
