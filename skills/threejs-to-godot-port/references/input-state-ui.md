# Input, state and UI: a bounded playable port

Static geometry export does not translate JavaScript, DOM/React interfaces, input listeners or gameplay state. Rebuild those deliberately. The repository's `examples/04-playable-migration/` contains an original runnable Three.js page, editable Godot scene and trace tests; it is not included in a folder-only Skill install.

1. **Isolate state updates.** Define named actions, units, fixed-tick rate, initial state, phase transitions and reset behavior. Preserve a runnable source. Specify whether each recorded frame is before or after its update.
2. **Choose native structures.** Map input to InputMap, controllable movement to the appropriate Godot body, and UI to Control nodes. Do not convert every DOM element mechanically. Native collision shapes are editable; a visual mesh alone is not a collider.
3. **Replay semantic actions.** Use the same held/pressed/released actions and fixed ticks on both sides. Record position, phase, elapsed ticks, contact-entry/goal/restart events. Compare floating-point values with a justified tolerance, events/state with explicit rules. Native physics is remeasured, not assumed deterministic across engines.
4. **Test interruptions.** Key release and loss of focus must clear held movement. Restart must work during play and after success, cancel old motion, reset counters/contact, and remain safe when repeated. A button signal and keyboard action must exercise the same reset path.
5. **Freeze image states.** Pause simulation at the exact requested post-tick state before allowing draw frames. Capture start/contact/goal/restart. Compare gameplay images and inspect the rebuilt UI independently; differing DOM/Control layout is not automatically a failure.
6. **Break the port on purpose.** Collision-disabled and restart-ignored variants must fail behavior checks. Wrong-camera variants must fail image checks for visual reasons. Missing browser/display stages must be reported as blocked or not run, never silently counted as full validation.

Example 04 is deliberately limited to fixed XZ movement, one axis-aligned wall and a centre-in-square goal. It uses no gravity, audio, animation, third-party physics, multiplayer, mobile/gamepad input or Web export. Its schema and TypeScript types cover the sample contract only. Do not advertise those as a universal migration format.

A port report must state what was rebuilt, known differences, executed checks, failed/blocked checks, versions and renderer/OS, and which images were actually opened. Keep sample-specific measurements separate from the existing static examples' macOS measurements.
