export function createScene({ THREE, canvas, width, height, contract }) {
  const c = contract;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#16243a');
  // Unlit colors isolate shape/camera/state validation from the light tests in 01/02.
  const box = (name, size, position, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
    mesh.name = name; mesh.position.set(...position); scene.add(mesh); return mesh;
  };
  box('Floor', [c.floorSize[0], .2, c.floorSize[1]], [0, -.1, 0], '#475569');
  box('Wall', [c.wall.size[0], c.wall.height, c.wall.size[1]], [c.wall.center[0], c.wall.height/2, c.wall.center[1]], '#f59e0b');
  box('Goal', [c.goal.halfSize*2, .04, c.goal.halfSize*2], [c.goal.center[0], .02, c.goal.center[1]], '#34d399');
  const player = box('Player', [c.playerHalfSize*2, .8, c.playerHalfSize*2], [c.spawn[0], .4, c.spawn[1]], '#60a5fa');
  const camera = new THREE.PerspectiveCamera(c.camera.fov, width/height, c.camera.near, c.camera.far);
  camera.position.set(...c.camera.position); camera.lookAt(...c.camera.lookAt);
  const draw = state => { player.position.set(state.position[0], .4, state.position[1]); renderer.render(scene, camera); };
  return { renderer, scene, camera, draw };
}
