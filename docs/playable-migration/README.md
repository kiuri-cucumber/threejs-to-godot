# From a playable Three.js prototype to an editable Godot scene

This walkthrough covers [example 04](../../examples/04-playable-migration/README.md). It adds input, collision, game state and restart UI to the repository's static-scene teaching material. It deliberately uses a new, tiny original game so every source file can be read and shared.

## 1. Save the runnable original and define success

Run the Three.js page before porting it. Its scene has four named boxes: Floor, Wall, Goal, Player. Keep the controller independent of drawing: `Game.step(action)` advances exactly one 1/60-second tick; `createScene().draw(state)` only renders.

The shared contract records world units, initial state, dimensions, camera, controls, replay and frozen capture moments. Success means the player cannot cross the wall, can go around it, reaches the goal at the same tick, stops after winning, and returns to a clean initial state after restart. Do not start by translating arbitrary source syntax.

## 2. Choose how geometry moves

For four original boxes, manually recreate editable BoxMesh and BoxShape3D resources in a `.tscn`. This is intentionally simpler than exporting/importing them. For authored meshes and textures, use the existing glTF workflow instead. Input handlers and DOM UI are not carried by glTF.

The level has no shadows, textures, lights, or custom shaders. Three.js MeshBasicMaterial maps to an unshaded StandardMaterial3D; rendering differences in lit materials belong to examples 01/02. Keep the identical camera world pose, vertical FOV, near and far planes. Three.js and Godot are both right-handed here: do not negate an axis merely because the engine changed.

## 3. Rebuild behavior using native objects

| Three.js original | Godot port | Evidence |
| --- | --- | --- |
| `keydown` / `keyup` set held actions | InputMap actions consumed in `_physics_process` | Native action press/release checks; separate browser keyboard checks |
| Swept intervals clip X then Z against one box | CharacterBody3D uses `move_and_collide` X then Z against StaticBody3D | Every post-tick position and contact event compared |
| `{phase, elapsedTicks, contact, position}` | Explicit script fields | Full trace plus fresh-process repeat |
| Goal-centre square check | Same rule using native player position | Exact goal event tick and frozen won state |
| DOM status and button | Label and Button in CanvasLayer/Control tree | Goal text, repeated button restart, clean state |
| requestAnimationFrame fixed accumulator | Fixed physics tick | Render cadence does not define gameplay |

This does not prove general physics equivalence. The native collision query produces a small position difference under the explicit 0.2 mm tolerance on the measured run. The native query explicitly uses a 1 mm recovery margin; its measured positional difference is reported separately. Do not loosen the tolerance or invent an engine-level explanation when a different environment fails; inspect the first divergent tick.

The Godot project is editable, not a rasterized browser view. Changing a wall node changes native geometry. Keep scene and contract in sync, rerun the geometry/behavior checks, and update the source when deliberately changing the specification.

## 4. Validate behavior before pictures

Run `examples/04-playable-migration/run.sh`. It writes source and native traces, environment version, maximum position error, and failures. Two controls disable the native collision mask or ignore restart. The checker must reject both. The browser tests also cover key release, loss of focus, restart key, and repeated button clicks when the browser is available.

The trace checker is stricter for state/events than for floating-point position. It is not a checksum comparison between different physics engines. `contract.schema.json` and `contract.d.ts` describe this fixture only; an unknown schema or unsupported action must not be accepted as a successful migration.

## 5. Freeze, capture, compare, then inspect

Capture the exact post-tick states at 0/start, 60/wall contact, 240/goal, and 260/restart. Both sides disable automatic state advancement while rendering. This avoids the extra-physics-tick drift documented for continuously moving static-pipeline captures.

`run.sh --visual` captures the original twice, then the native port and a wrong-FOV port. It requires stable source images and a visibly sensitive rejection of the wrong camera. Scene-only pairs are compared numerically; open them all. Also open both full UI goal screenshots and check text, overlap, clipped controls and restart affordances. An unexecuted renderer or browser stage remains unexecuted even when unit tests pass.

## What is intentionally not automated

This example does not translate JavaScript or HTML, infer game rules, migrate a physics library, or preserve arbitrary animation, sound or shaders. It does not certify Godot Web export or all GPU/OS combinations. Use the [recorded validation](VALIDATION.md) to distinguish demonstrated behavior from work still needed.

## Primary references

- [Godot CharacterBody3D](https://docs.godotengine.org/en/stable/classes/class_characterbody3d.html)
- [Godot InputMap](https://docs.godotengine.org/en/stable/classes/class_inputmap.html)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)

All original repository MIT notices and provenance remain intact.
