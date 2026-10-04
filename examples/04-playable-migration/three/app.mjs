import * as THREE from 'three';
import { Game } from './model.mjs';
import { bindings, movementFromCodes } from './input.mjs';
import { createScene } from './scene.mjs';
const contract = await (await fetch('../godot/contract.json')).json();
const game = new Game(contract);
const view = createScene({ THREE, canvas: document.querySelector('canvas'), width: 960, height: 540, contract });
const status = document.querySelector('#status');
const keys = new Set();
let restart = false;
addEventListener('keydown', event => {
  if (bindings[event.code] || event.code === 'KeyR') event.preventDefault();
  if (event.code === 'KeyR' && !event.repeat) restart = true;
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); restart = false; accumulator = 0; });
document.querySelector('#restart').addEventListener('click', () => { restart = true; });
const draw = () => {
  view.draw(game.snapshot());
  const text = game.phase === 'won' ? 'Goal reached! Restart to play again.' : 'Playing · go around the wall';
  if (status.textContent !== text) status.textContent = text;
};
const action = () => ({ move: movementFromCodes(keys), restart });
let previous = performance.now(), accumulator = 0;
const manual = new URLSearchParams(location.search).has('manual');
function frame(now) {
  if (!manual) {
    accumulator += Math.min((now-previous)/1000, .1);
    while (accumulator >= 1/contract.tickHz) { game.step(action()); restart = false; accumulator -= 1/contract.tickHz; }
  }
  previous = now; draw(); requestAnimationFrame(frame);
}
// Test/capture mode freezes simulation between explicit ticks; rAF only redraws.
window.sample = { game, contract, step(input) { const state = game.step(input ?? action()); restart = false; draw(); return state; }, state: () => game.snapshot(), draw, camera: view.camera };
draw(); requestAnimationFrame(frame);
