export const bindings = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
export function movementFromCodes(codes) {
  const held = [...codes].map(code => bindings[code]).filter(Boolean);
  // Actions have strength 0 or 1 regardless of duplicate keys. Opposites cancel.
  return [0, 1].map(axis => Number(held.some(v => v[axis] > 0)) - Number(held.some(v => v[axis] < 0)));
}
