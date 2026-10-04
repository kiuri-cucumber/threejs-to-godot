# threejs-to-godot-skill

An agent skill for porting a three.js scene or game to Godot 4 (GDScript), and for proving the port matches.

AI agents can write Godot code from three.js code. What they lack is a way to know the result is right. This skill gives an agent an order of work, a pass or fail check at each stage, and small tools for the checks:

1. Capture the three.js render from fixed viewpoints (the reference).
2. Carry the shapes, either through glTF or by porting the scene-building code.
3. Rebuild what glTF cannot carry (materials, lights, camera, fog, background, shadows) in Godot.
4. Capture the same viewpoints in Godot and compare them numerically, then open every image.
5. Treat physics and determinism as something to measure again, not to port.

It comes from a real port done by an AI agent. The record, with eight side-by-side images, is in [`docs/case-study/`](docs/case-study/README.md).

## What is in this repository

| Path | Purpose |
| --- | --- |
| `skills/threejs-to-godot-port/SKILL.md` | The skill: stages, the check that ends each stage, tool reference |
| `skills/threejs-to-godot-port/references/` | Material mapping, lights, camera and environment mapping, pitfalls (symptom, cause, fix), physics guidance |
| `skills/threejs-to-godot-port/scripts/` | The tools (below), their tests, and the Godot-side scripts and shaders |
| `examples/` | Two small scenes ported end to end, with a comparison that passes and negative controls that must fail |
| `docs/case-study/` | The case study and its physics numbers |
| `.claude-plugin/marketplace.json` | Makes the repository installable as a Claude Code plugin marketplace |

### Tools

| Tool | What it does |
| --- | --- |
| `export-scene.mjs` | Exports a three.js scene to `.glb`, collects the exporter's warnings, audits the scene, and writes a list of what is lost in translation |
| `dump-settings.mjs` | Writes lights, camera, fog, background, tone mapping, shadow settings and a material inventory to JSON |
| `godot/apply_settings.gd`, `godot/build_scene.gd` | Build the Godot environment, lights and camera from that JSON; load the `.glb` |
| `compare-shots.mjs` | Compares paired screenshots (brightness, color, blocks, probes, shadow ratio, outline pixels, camera pose) and writes a side-by-side image and a report |
| `capture-three.mjs`, `godot/capture_godot.gd` | Capture the two sides from one shot sheet |
| `doctor.mjs` | Checks the environment, including that a Godot window can draw |

## Install

Claude Code:

```
claude plugin marketplace add namayasai/threejs-to-godot-skill
claude plugin install threejs-to-godot-port@threejs-to-godot-skill
```

Other agents that read `SKILL.md` skills:

```
npx skills add namayasai/threejs-to-godot-skill
```

Or copy `skills/threejs-to-godot-port/` into your agent's skills folder.

**What an install of the skill folder contains.** The skill is the folder `skills/threejs-to-godot-port/`: `SKILL.md`, `LICENSE`, `references/` and `scripts/` (every tool, test and Godot script the workflow needs). `npx skills add` and a manual copy take only that folder. `examples/` and `docs/case-study/` are at the repository root, next to `skills/`, and are left behind. `SKILL.md` names them in places; take them from this repository when you want to run the examples or read the case study.

Status of these commands: the skill folder and the marketplace file pass `claude plugin validate`. Installing from GitHub was not tried before publication, so the commands above are untested.

## Requirements

- Node.js 22 (tested with 22.14.0), then `cd skills/threejs-to-godot-port/scripts && npm ci && npx playwright install chromium`
- Godot 4.7 (tested with 4.7.stable.official.5b4e0cb0f); set the environment variable `GODOT` to the executable
- A display for Godot captures (headless Godot does not draw). Tests run headless.
- Full rendering parity was measured on macOS (Apple Silicon). Node regressions and headless Godot unit tests also run on Linux; Linux/Windows end-to-end rendering parity is not verified.

Then check the setup:

```
node skills/threejs-to-godot-port/scripts/doctor.mjs
```

If Chromium is already installed, `TG_CHROMIUM_EXECUTABLE=/path/to/chromium` explicitly selects that executable instead of Playwright's downloaded browser. Its actual version is recorded; parity thresholds still need calibration.

## Run the examples

```
export GODOT=/path/to/Godot
examples/run-all.sh
```

Each example exports a three.js scene, builds the Godot side, captures both, and compares. After a passing run, the script also runs negative controls: deliberately wrong Godot sides (for example, forgetting to divide the light intensity by PI) that the comparison must reject. See `examples/README.md`.

## Tests

```
cd skills/threejs-to-godot-port/scripts
npm test                              # unit tests and Chromium tests
GODOT=/path/to/Godot ./test-godot.sh  # Godot-side unit tests, headless
```

## Capture validation

Fresh captures write a `captureDefinition` sidecar containing the requested dimensions and the full ordered camera/step timeline. Comparison requires both valid sidecars by default and rejects missing metadata, stale definitions and incorrect image dimensions. Re-capture images created by older versions of the tools. `--image-only` explicitly compares legacy/external PNGs without camera or provenance validation; the report marks that mode.

A shot's `fov` is its effective vertical field of view. Fixed captures reset source-camera zoom and cropping; use `camera.getEffectiveFOV()` when deriving the shot sheet. `--only` limits saved images but still advances the complete shot timeline, so the same shot has the same requested state when captured alone or as part of the sheet.

## What was measured, and what was not

Measured here (three.js r185, Godot 4.7.stable, Apple M1): the light unit (Godot energy equals three.js intensity divided by PI; the glTF importer does not convert), the diffuse model (Burley against Lambert), what the glTF importer does with lights, materials and shadows, the loss list for the two example scenes, and that capture and comparison are stable. The page mode (`--page`) was also run against a real application scene of 216 objects, which is not part of this repository. The numbers are in `examples/*/expected.json` and in the references.

Not measured: other platforms, other versions, point and spot light attenuation, fog curves, orthographic cameras, many materials from the glTF extensions, frame rate. Such rows in the references are marked unverified.

The comparison thresholds are initial proposals. They were calibrated on two small scenes on one machine. Calibrate them on your own scene.

## Known gaps

Where a tool can detect one of these, it warns or stops with a message. None of them is handled.

- **`InstancedMesh`**: how Godot imports the exporter's `EXT_mesh_gpu_instancing` output was not measured. A hook matches meshes by node name, so an instanced mesh can be missed. `dump-settings.mjs` and `apply_settings.gd` warn.
- **A `gradientMap` made from an image**: pixel values are recorded only for a `DataTexture`. `dump-settings.mjs` warns and writes no `gradientMap`.
- **`OrthographicCamera`**: `dump-settings.mjs` writes it and warns, the Godot side falls back to a perspective camera, `shots.json` requires a `fov`, and `capture-three.mjs` refuses it. Not supported by capture and compare.
- **A camera that looks straight up or down**: `lookAt` has no single answer; `shots.json` is rejected. Offset the position or give a quaternion.
- **`Fog` and `FogExp2`**: the curves differ between three.js and Godot, and the brightness match was not measured. `dump-settings.mjs` warns.
- **A JavaScript physics engine in the original (for example cannon-es)**: no tool records its behavior, and module mode cannot import it. See `references/physics.md`, section 6.
- **Other bare imports in module mode**: only `three` and `three/addons/...` resolve. Use relative imports or page mode.
- **three.js before r155**: not tested. Its light units differ, so the divide-by-PI rule may not hold.
- **End-to-end captures on operating systems other than macOS**: not measured; Linux headless/unit regressions do not establish rendering parity.
- **Not measured**: point and spot light attenuation, tone mapping other than none, exposure, the glTF material extensions, frame rate.

## Third-party software

This repository does not include or redistribute third-party code. It depends on, at run time:

- three.js (MIT), including its `GLTFExporter`
- Playwright (Apache-2.0) and the Chromium it downloads
- pngjs (MIT)
- Godot Engine (MIT), which you install yourself

Versions are pinned in `skills/threejs-to-godot-port/scripts/package-lock.json`.

## License

MIT. See `LICENSE`.

---

## 日本語の要約

three.js のシーンやゲームを Godot 4（GDScript）へ移植し、移植結果が元のレンダリングと一致しているかを検証するための AI エージェント向け Skill です。

AI は three.js のコードから Godot のコードを書くことができますが、その結果が「合っている」かを確かめる手段が不足していました。この Skill は、作業手順、各段階での合否判定、および判定用ツールを提供します。

1. **基準の撮影**: three.js の画面を決まった視点からキャプチャする
2. **形状の移行**: glTF 経由でエクスポートするか、シーン構築コードを移植する
3. **パラメータの再構築**: glTF に乗らない要素（マテリアル、ライト、カメラ、フォグ、背景、影）を Godot 側で作り直す
4. **比較・検証**: 同じ視点で Godot の画面を撮り、数値で差分を比較した上で、比較画像を並べて確認する
5. **物理と決定性**: コードをそのまま移すのではなく、挙動を改めて計測・調整する

ツールは4つあります。失われた要素の一覧を出すエクスポーター、光やカメラの設定を JSON に書き出すスクリプト、その JSON から Godot のシーン環境を構築する GDScript、そしてキャプチャ画像を並べて差分を算出する比較ツールです。同梱の2つの例で、正常な移植がパスすること、および意図的に間違えた Godot 側が正しく不合格になることを確認しています。

実測した主な仕様（three.js r185、Godot 4.7、Apple M1）：
- Godot の光の強さ（energy）は、three.js の強さ（intensity）を $\pi$ で割った値に相当します（glTF インポート時は自動換算されません）。
- Godot の標準マテリアルは Burley 拡散モデルを採用しているため、three.js の Lambert とはわずかに明るさが異なります。

事例の詳細は `docs/case-study/` にまとめています。AI が実際に three.js の場面を Godot へ移した経緯や落とし穴、比較画像8枚、物理の測定結果を掲載しています。未検証の項目（他の OS、別バージョン、フレームレートなど）についても明記しています。比較の判定閾値は初期設定値のため、ご自身のシーンに合わせて調整してください。

Skill の本体は `skills/threejs-to-godot-port/` フォルダです。`npx skills add` や手作業でこのフォルダのみをコピーした場合、リポジトリ直下の `examples/` と `docs/case-study/` は含まれません。例や事例が必要な場合は本リポジトリ全体を参照してください。

現時点で未対応の項目（InstancedMesh、画像から生成した gradientMap、OrthographicCamera、真上や真下を向くカメラ、フォグ曲線の差異、JavaScript 物理エンジンの挙動記録、three.js r155 未満、macOS 以外の検証など）は「Known gaps」に記載しています。ツール側で検知できるものは警告を表示するか、理由を出力して停止します。

ライセンスは MIT です。
