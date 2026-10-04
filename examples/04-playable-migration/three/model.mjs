// Original, deliberately bounded XZ-plane gameplay. No external physics library.
function keysOnly(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw new Error('Unknown or missing contract/action field');
}
export function validateContract(c) {
  keysOnly(c, ['schema','units','tickHz','speed','playerHalfSize','spawn','wall','floorSize','goal','camera','replay','snapshots','positionTolerance','cornerEpsilon']);
  keysOnly(c.wall, ['center','size','height']);
  keysOnly(c.goal, ['center','halfSize']);
  keysOnly(c.camera, ['position','lookAt','fov','near','far']);
  const vector = v => Array.isArray(v) && v.length === 2 && [0,1].every(i => Number.isFinite(v[i]));
  const positive = v => Number.isFinite(v) && v > 0;
  if (c.schema !== 1 || c.units !== 'metres' || c.tickHz !== 60) throw new Error('Expected schema 1, metres and 60 Hz');
  if (![c.speed, c.playerHalfSize, c.goal?.halfSize, c.wall?.height, c.positionTolerance, c.cornerEpsilon].every(positive) || !vector(c.spawn) || !vector(c.wall?.center) || !vector(c.wall?.size) || !c.wall.size.every(positive) || !vector(c.goal?.center) || !vector(c.floorSize) || !c.floorSize.every(positive)) throw new Error('Invalid geometry or motion');
  if (!Array.isArray(c.replay) || !c.replay.length) throw new Error('Replay is required');
  for (const entry of c.replay) {
    keysOnly(entry, ["ticks", "move"], ["restart"]);
    if (!Number.isInteger(entry.ticks) || entry.ticks < 1 || !vector(entry.move) || entry.move.some(v => Math.abs(v) > 1) || (entry.restart !== undefined && typeof entry.restart !== 'boolean')) throw new Error('Invalid replay entry');
  }
  const total = c.replay.reduce((n, e) => n + e.ticks, 0);
  const names = new Set();
  if (!Array.isArray(c.snapshots) || !c.snapshots.length) throw new Error('Snapshots are required');
  for (const shot of c.snapshots) {
    keysOnly(shot, ["id", "tick"]);
    if (typeof shot.id !== "string") throw new Error("Snapshot id must be a string");
    if (!/^[a-z0-9-]+$/.test(shot.id) || names.has(shot.id) || !Number.isInteger(shot.tick) || shot.tick < 0 || shot.tick > total) throw new Error('Invalid snapshot');
    names.add(shot.id);
  }
  const camera = c.camera;
  if (!camera || ![camera.position, camera.lookAt].every(v => Array.isArray(v) && v.length === 3 && [0,1,2].every(i => Number.isFinite(v[i]))) || !positive(camera.near) || !positive(camera.far) || !(camera.far > camera.near) || !positive(camera.fov) || !(camera.fov < 180)) throw new Error('Invalid camera');
  return c;
}

export function inputAt(c, tick) {
  if (!Number.isInteger(tick) || tick < 1) throw new Error('Input tick is one-based');
  let remaining = tick;
  for (const entry of c.replay) {
    if (remaining <= entry.ticks) return { move: [...entry.move], restart: Boolean(entry.restart && remaining === 1) };
    remaining -= entry.ticks;
  }
  return { move: [0, 0], restart: false };
}

export class Game {
  constructor(contract, { noCollision = false, noRestart = false } = {}) {
    this.c = validateContract(contract);
    this.noCollision = noCollision;
    this.noRestart = noRestart;
    this.tick = 0;
    this.reset();
  }
  reset() { this.position = [...this.c.spawn]; this.phase = 'playing'; this.elapsedTicks = 0; this.contact = false; }
  snapshot(events = []) {
    return { tick: this.tick, position: [...this.position], phase: this.phase, elapsedTicks: this.elapsedTicks, contact: this.contact, events };
  }
  step(action = {}) {
    keysOnly(action, [], ['move', 'restart']);
    const { move = [0, 0], restart = false } = action;
    if (!Array.isArray(move) || move.length !== 2 || [0,1].some(i => !Number.isFinite(move[i]) || Math.abs(move[i]) > 1) || typeof restart !== 'boolean') throw new Error('Invalid action');
    this.tick++;
    if (restart && !this.noRestart) { this.reset(); return this.snapshot(['restart']); }
    if (this.phase === 'won') return this.snapshot();
    this.elapsedTicks++;
    const events = [];
    const length = Math.max(1, Math.hypot(...move));
    let contact = false;
    // Swept interval clipping, X then Z. Even a displacement larger than the wall
    // cannot tunnel. Deliberately not a general-purpose rigid-body simulation.
    for (let axis = 0; axis < 2; axis++) {
      const other = 1 - axis;
      const delta = move[axis] / length * this.c.speed / this.c.tickHz;
      const old = this.position[axis];
      let next = old + delta;
      const min = this.c.wall.center[axis] - this.c.wall.size[axis] / 2 - this.c.playerHalfSize;
      const max = this.c.wall.center[axis] + this.c.wall.size[axis] / 2 + this.c.playerHalfSize;
      const otherMin = this.c.wall.center[other] - this.c.wall.size[other] / 2 - this.c.playerHalfSize;
      const otherMax = this.c.wall.center[other] + this.c.wall.size[other] / 2 + this.c.playerHalfSize;
      if (!this.noCollision && this.position[other] >= otherMin - this.c.cornerEpsilon && this.position[other] <= otherMax + this.c.cornerEpsilon) {
        if (delta > 0 && old <= min + 1e-10 && next >= min - 1e-7) { next = min; contact = true; }
        if (delta < 0 && old >= max - 1e-10 && next <= max + 1e-7) { next = max; contact = true; }
      }
      this.position[axis] = next;
    }
    if (contact && !this.contact) events.push('wall-contact');
    this.contact = contact;
    if (this.position.every((v, axis) => Math.abs(v - this.c.goal.center[axis]) <= this.c.goal.halfSize + 1e-5)) {
      this.phase = 'won'; events.push('goal');
    }
    return this.snapshot(events);
  }
}

export function replay(c, options, entries = c.replay) {
  const game = new Game(c, options);
  const frames = [game.snapshot()];
  const total = entries.reduce((n, entry) => n + entry.ticks, 0);
  for (let tick = 1; tick <= total; tick++) frames.push(game.step(inputAt({ ...c, replay: entries }, tick)));
  return frames;
}
