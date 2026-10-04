# Offline migration preflight

`preflight.mjs` is a planning gate before an export or a manual port. It reads JSON declarations and optional reports already produced by `export-scene.mjs` and `dump-settings.mjs`. It does not execute JavaScript, open a browser, download assets, validate licenses, or run Godot. It reuses `findLosses` and the stable L01–L13 rules from the existing exporter.

## Three result states

- **supported**: a bounded path exists for the stated feature, or it was declared absent. Import, behavior and images still need validation.
- **needs-manual**: native reconstruction, measurement, inventory or other evidence is required. Unknown is never treated as absent.
- **unsupported**: the current automatic/validated path cannot cover it, or a required asset is missing. This does not mean a human cannot port it.

Every report sets `portabilityVerified: false`. Even an all-supported report only recommends the existing export-and-verification workflow. A declared empty feature list cannot certify that a real application has no behavior or dependencies.

## Inventory format, schema 1

All fields are required; unknown fields/enums are rejected. Declare `unknown` when uncertain. Revision is a string such as `"185"`, or `null` when unknown.

```json
{
  "schema": 1,
  "source": { "label": "My prototype", "threeRevision": "185" },
  "features": {
    "geometry": "static-meshes",
    "camera": "perspective",
    "materials": "basic-standard",
    "input": "unknown",
    "ui": "unknown",
    "state": "unknown",
    "animation": "unknown",
    "physics": "unknown"
  },
  "externalAssets": { "inventory": "unknown", "items": [] }
}
```

| Feature | Allowed declarations |
| --- | --- |
| geometry | static-meshes, instanced, skinned, unknown |
| camera | perspective, orthographic, unknown |
| materials | basic-standard, physical, toon, custom-shader, unknown |
| input | none, keyboard-pointer, gamepad, unknown |
| ui | none, dom, canvas, unknown |
| state | none, custom, unknown |
| animation | none, clips, procedural, unknown |
| physics | none, custom, engine, unknown |

`externalAssets.inventory` is `complete` or `unknown`. Every item has a unique short `id`, `kind` (mesh/texture/audio/font/other), `storage` (local/embedded/remote/unknown), `availability` (verified/missing/unknown), and `license` (confirmed/unknown). For example:

```json
{"id":"ground-texture","kind":"texture","storage":"remote","availability":"unknown","license":"unknown"}
```

Use identifiers, not URLs, credentials, signed links or private path names. No asset is fetched. A `confirmed` license is the inventory author's declaration, not an automated legal check. Existing audit warning text can be reproduced in a report; review it before sharing.

## Run from the skill's scripts folder

```sh
node preflight.mjs --inventory inventory.json --out preflight.json
node preflight.mjs --inventory inventory.json --loss-report out/scene.lost.json --settings out/scene.settings.json --out preflight.json --strict
```

Exit 0 means the report was produced. Exit 1 means invalid input/tool failure. With `--strict`, exit 2 means at least one manual or unsupported item remains. This strict planning gate is deliberately separate from a complete-port acceptance test.

The repository's `examples/04-playable-migration/migration-inventory.json` describes the runnable source fixture. It correctly reports manual input, DOM UI, state and custom collision work, even though the paired example demonstrates one explicit implementation of that work.

## Why those categories are conservative

- The current harness does not pass AnimationClips into GLTFExporter; it does not translate procedural animation. Both are outside the automatic path, despite glTF's own animation capabilities.
- Custom ShaderMaterial/onBeforeCompile code needs native shader work. Observed audit evidence overrides an optimistic basic-standard declaration.
- Orthographic cameras remain outside the current capture pipeline. An imported fallback camera is not proof of a matching port.
- Input, DOM/canvas UI, state and JavaScript physics are reconstructed and remeasured. Refer to `input-state-ui.md` and `physics.md`.
- Instanced/skinned/line/point/sprite imports are not certified by this pipeline. Existing L11 evidence remains visible.
- Textures/environment resources observed with an empty asset list flag incomplete inventory. Neither the audit nor the declarations prove that all dynamic assets were found.
- Only Three.js r185 is the measured source revision; older-than-r155 source is outside the assumed light model, while other/unknown revisions require revalidation.

Optional settings must be complete schema-1 dump-settings output. Observed source revision, camera, material types, instancing, environment resources and warning/extra fields can escalate a declaration; they cannot erase an incompatibility. Material/object property evidence remains manual: use the existing export audit for L05/L08 and other property-level losses, rather than assuming basic material names prove those properties portable.

Reports recompute loss rules from a structurally validated audit rather than trusting a saved `findings: []`. They reject malformed inputs and preserve observed incompatibilities. They cannot detect omitted behavior, misleading declarations, dynamic loading, or a fabricated audit. Run the original application and gather evidence before relying on the plan.
