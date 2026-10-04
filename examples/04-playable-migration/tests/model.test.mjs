import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Game, inputAt, replay, validateContract } from '../three/model.mjs';
import { validateCapture, validateCamera } from '../capture-contract.mjs';
import { movementFromCodes } from '../three/input.mjs';
import { compareTrace } from '../verify.mjs';
const c = JSON.parse(fs.readFileSync(new URL('../godot/contract.json', import.meta.url)));

test('fixed replay stops at the wall, wins, freezes and fully restarts', () => {
  const trace = replay(c);
  assert.equal(trace.length, 261);
  assert.deepEqual(trace[60].position, [-.9, 0]);
  assert.deepEqual(trace[42].events, ['wall-contact']);
  assert.equal(trace[224].phase, 'won');
  assert.deepEqual(trace[224].events, ['goal']);
  assert.deepEqual(trace[250].position, trace[224].position);
  assert.equal(trace[250].elapsedTicks, 224);
  assert.deepEqual(trace[251], {tick:251,position:[-3,0],phase:'playing',elapsedTicks:0,contact:false,events:['restart']});
  assert.deepEqual(trace, replay(c), 'a fresh run is deterministic');
});
test('normalization avoids diagonal speed boost', () => {
  const g = new Game(c); const state = g.step({move:[1,-1]});
  assert.ok(Math.abs(Math.hypot(state.position[0]+3,state.position[1])-.05)<1e-12);
});
test('swept clipping prevents tunneling and works from both sides', () => {
  const fast = structuredClone(c); fast.speed = 600;
  const g = new Game(fast); assert.equal(g.step({move:[1,0]}).position[0], -.9);
  g.position = [3,0]; assert.equal(g.step({move:[-1,0]}).position[0], .9);
});
test('release stops movement; restarts from playing and repeats safely', () => {
  const g=new Game(c); g.step({move:[1,0]});
  assert.deepEqual(g.step().position, [-2.95,0]);
  for(let i=0;i<3;i++) {const state=g.step({restart:true,move:[1,0]});assert.deepEqual(state.position,c.spawn);assert.equal(state.elapsedTicks,0);}
});
test('input restart is an edge at the first tick, sampling is one-based', () => {
  const cc=structuredClone(c);cc.replay=[{ticks:3,move:[0,0],restart:true}];
  assert.equal(inputAt(cc,1).restart,true); assert.equal(inputAt(cc,2).restart,false);
  assert.throws(()=>inputAt(c,0));assert.deepEqual(inputAt(c,999),{move:[0,0],restart:false});
});
test('contract rejects unsupported schema and malformed actions, snapshots and camera', () => {
  for(const mutate of [c=>c.schema=2,c=>c.tickHz=0,c=>c.speed=NaN,c=>c.wall.size=[0,3],c=>c.replay[0].ticks=.5,c=>c.replay[0].move=[2,0],c=>c.snapshots[0].tick=999,c=>c.snapshots[1].id='start',c=>c.camera.fov=181,c=>delete c.snapshots[0].id,c=>c.snapshots[0].id=undefined,c=>c.replay[0].jump=true,c=>c.jump=true,c=>c.camera.fov="45",c=>c.camera.far="100",c=>c.camera.far=Infinity,c=>c.camera.position=new Array(3)]) {
    const invalid=structuredClone(c);mutate(invalid);assert.throws(()=>validateContract(invalid));
  }
  assert.throws(()=>new Game(c).step({move:[NaN,0]}));
  assert.throws(()=>new Game(c).step({jump:true}));
  assert.throws(()=>new Game(c).step({move:new Array(2)}));
});
test('trace validator rejects collision, restart and missing-frame negative controls', () => {
  const reference=replay(c);
  assert.equal(compareTrace(c,reference,reference).passed,true);
  assert.equal(compareTrace(c,reference,replay(c,{noCollision:true})).passed,false);
  assert.equal(compareTrace(c,reference,replay(c,{noRestart:true})).passed,false);
  assert.equal(compareTrace(c,reference,reference.slice(1)).passed,false);
  const invalid=structuredClone(reference);invalid[60].position[0]=NaN;
  assert.equal(compareTrace(c,reference,invalid).passed,false);
});

test('duplicate bindings do not outweigh the opposite action', () => {
  assert.deepEqual(movementFromCodes(new Set(['KeyD','ArrowRight','KeyA'])),[0,0]);
  assert.deepEqual(movementFromCodes(new Set(['KeyD','ArrowRight','KeyW'])),[1,-1]);
  assert.deepEqual(movementFromCodes(new Set(['Space'])),[0,0]);
});

test('capture provenance binds the full contract, ordered post-tick states and actual camera', () => {
  const frames=replay(c);
  const metadata={schema:1,size:[960,540],contract:structuredClone(c),snapshots:c.snapshots.map(s=>({id:s.id,tick:s.tick,phase:frames[s.tick].phase,position:frames[s.tick].position}))};
  assert.deepEqual(validateCapture(c,metadata),[]);
  const stale=structuredClone(metadata);stale.contract.speed=4;assert.ok(validateCapture(c,stale).includes('stale-contract'));
  const wrong=structuredClone(metadata);wrong.snapshots[0].position[0]=NaN;assert.ok(validateCapture(c,wrong).length);
  const reordered=structuredClone(metadata);reordered.snapshots.reverse();assert.ok(validateCapture(c,reordered).length);
  const camera={position:[0,9,11],quaternion:[-0.3361864815817844,0,0,0.9417954393612556],fov:45,near:.1,far:100};
  assert.ok(validateCamera(c,camera));assert.ok(!validateCamera(c,{...camera,fov:50}));
  assert.ok(!validateCamera(c,{...camera,quaternion:[0,0,0,1]}));
  assert.ok(!validateCamera(c,{...camera,near:NaN}));
});

test('both exact wall corners stay blocked until the player clears the edge', () => {
  const edges=JSON.parse(fs.readFileSync(new URL('../godot/edge-replays.json',import.meta.url)));
  for(const entries of Object.values(edges)) {
    const frames=replay(c,{},entries);
    assert.equal(frames[118].position[0],-.9);
    assert.equal(frames[118].contact,true);
    assert.ok(Math.abs(frames[129].position[0]+.4)<1e-10);
  }
});
