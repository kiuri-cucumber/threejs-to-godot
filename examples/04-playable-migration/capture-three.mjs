#!/usr/bin/env node
// Browser checks are required here: a launch failure fails, rather than skips.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startServer, launchBrowser } from '../../skills/threejs-to-godot-port/scripts/lib/harness.mjs';
import { compareTrace } from './verify.mjs';
import { replay } from './three/model.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(process.argv[2]||path.join(root,'out/three'));
fs.mkdirSync(out,{recursive:true});
const server=await startServer({userRoot:root});
let browser;
try {
  browser=await launchBrowser();
  const page=await browser.newPage({viewport:{width:1000,height:780},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
  const url=`${server.origin}/user/three/index.html?manual`;
  const open=async()=>{const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForFunction(()=>window.sample);};
  await open();
  await page.keyboard.down('ArrowRight');
  const moved=await page.evaluate(()=>{for(let n=0;n<10;n++)window.sample.step();return window.sample.state();});
  assert.ok(moved.position[0]>-3);
  await page.keyboard.up('ArrowRight');
  assert.deepEqual((await page.evaluate(()=>window.sample.step())).position,moved.position);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(()=>dispatchEvent(new Event('blur')));
  assert.deepEqual((await page.evaluate(()=>window.sample.step())).position,moved.position);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('r');
  assert.deepEqual((await page.evaluate(()=>window.sample.step())).position,[-3,0]);
  for(let n=0;n<3;n++) {
    await page.evaluate(()=>window.sample.step({move:[1,0]}));
    await page.getByRole('button',{name:'Restart',exact:true}).click();
    const state=await page.evaluate(()=>window.sample.step());
    assert.deepEqual(state.position,[-3,0]);assert.equal(state.elapsedTicks,0);
  }
  await open();
  const c=await page.evaluate(()=>window.sample.contract);
  const frames=await page.evaluate(()=>[window.sample.state()]);
  const snapshots=[];
  for(const shot of c.snapshots) {
    const advanced=await page.evaluate(target=>{
      const s=window.sample,result=[];
      while(s.state().tick<target) {
        let remaining=s.state().tick+1,action={move:[0,0],restart:false};
        for(const entry of s.contract.replay) {if(remaining<=entry.ticks){action={move:entry.move,restart:Boolean(entry.restart&&remaining===1)};break;}remaining-=entry.ticks;}
        result.push(s.step(action));
      }
      s.draw();return result;
    },shot.tick);
    frames.push(...advanced);
    const state=await page.evaluate(()=>window.sample.state());
    assert.equal(state.tick,shot.tick);
    const png=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png').split(',')[1]);
    fs.writeFileSync(path.join(out,shot.id+'.png'),Buffer.from(png,'base64'));
    if(shot.id==='goal') {await page.getByRole('status').filter({hasText:'Goal reached!'}).waitFor();await page.screenshot({path:path.join(out,'goal-ui.png'),fullPage:true});}
    snapshots.push({id:shot.id,tick:state.tick,position:state.position,phase:state.phase});
  }
  assert.ok(compareTrace(c,replay(c),frames).passed,'browser state matches source model');
  assert.deepEqual(errors,[],'no browser script errors');
  const metadata={schema:1,contract:c,size:[960,540],snapshots,browser:browser.version(),three:'0.185.1',uiChecks:{keyboard:true,keyRelease:true,blurReleasesKeys:true,restartKey:true,repeatedRestartButton:true,goalMessage:true},camera:await page.evaluate(()=>({position:window.sample.camera.position.toArray(),quaternion:window.sample.camera.quaternion.toArray(),fov:window.sample.camera.getEffectiveFOV(),near:window.sample.camera.near,far:window.sample.camera.far}))};
  fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify(metadata,null,2));
  console.log('PLAYABLE_BROWSER_OK '+JSON.stringify(metadata));
} finally {try{if(browser)await browser.close();}finally{await server.close();}}
