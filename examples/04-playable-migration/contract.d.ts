export interface Action { move: [number, number]; restart?: boolean }
export interface Contract {
  schema: 1; units: 'metres'; tickHz: 60; speed: number; playerHalfSize: number;
  spawn: [number, number]; floorSize: [number, number];
  wall: { center: [number, number]; size: [number, number]; height: number };
  goal: { center: [number, number]; halfSize: number };
  camera: { position: [number, number, number]; lookAt: [number, number, number]; fov: number; near: number; far: number };
  replay: (Action & { ticks: number })[];
  snapshots: { id: string; tick: number }[]; positionTolerance: number; cornerEpsilon: number;
}
export interface Frame {
  tick: number; position: [number, number]; phase: 'playing' | 'won'; elapsedTicks: number; contact: boolean;
  events: ('wall-contact' | 'goal' | 'restart')[];
}
