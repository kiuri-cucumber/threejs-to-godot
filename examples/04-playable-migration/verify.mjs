#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { replay } from './three/model.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export function compareTrace(c, reference, candidate) {
  const failures=[]; let maxPositionError=0;
  if (!Array.isArray(candidate) || candidate.length!==reference.length) return {passed:false,failures:['frame-count'],maxPositionError:null};
  for(let index=0;index<reference.length;index++) {
    const a=reference[index],b=candidate[index];
    for(const key of ['tick','phase','elapsedTicks','contact','events']) if(JSON.stringify(a[key])!==JSON.stringify(b?.[key])) failures.push(`${index}:${key}`);
    if(!Array.isArray(b?.position)||b.position.length!==2||!b.position.every(Number.isFinite)) {failures.push(`${index}:position-invalid`);continue;}
    for(let axis=0;axis<2;axis++) {const error=Math.abs(a.position[axis]-b.position[axis]);maxPositionError=Math.max(maxPositionError,error);if(error>c.positionTolerance) failures.push(`${index}:position[${axis}]`);}
  }
  return {passed:failures.length===0,failures,maxPositionError,tolerance:c.positionTolerance};
}
export function runGodot(out, control='', scenario='') {
  const result=spawnSync(process.env.GODOT||'godot',['--headless','--path',path.join(root,'godot'),'--script','res://replay.gd','--',`--out=${out}`,`--control=${control}`,`--scenario=${scenario}`],{encoding:'utf8',timeout:30000});
  fs.writeFileSync(out+'.log',`${result.stdout??''}\n${result.stderr??''}`);
  if(result.error||result.status!==0||/SCRIPT ERROR|^ERROR:/m.test(result.stdout+result.stderr)||!result.stdout.includes('PLAYABLE_TRACE_OK')) throw new Error(`Godot trace failed (${control||'normal'}): ${result.error||result.stdout+result.stderr}`);
  return JSON.parse(fs.readFileSync(out));
}
function main() {
  const out=path.resolve(process.argv[2]||path.join(root,'out'));
  fs.mkdirSync(out,{recursive:true});
  const c=JSON.parse(fs.readFileSync(path.join(root,'godot/contract.json')));
  const reference=replay(c);
  fs.writeFileSync(path.join(out,'three-trace.json'),JSON.stringify({schema:1,frames:reference},null,2));
  const normal=runGodot(path.join(out,'godot-trace.json'));
  const again=runGodot(path.join(out,'godot-trace-again.json'));
  const collision=runGodot(path.join(out,'control-no-collision.json'),'no-collision');
  const restart=runGodot(path.join(out,'control-no-restart.json'),'no-restart');
  const comparisons={normal:compareTrace(c,reference,normal.frames),repeat:compareTrace({...c,positionTolerance:1e-12},normal.frames,again.frames),noCollision:compareTrace(c,reference,collision.frames),noRestart:compareTrace(c,reference,restart.frames)};
  const edges=JSON.parse(fs.readFileSync(path.join(root,'godot/edge-replays.json')));
  const edgeComparisons={};
  for(const [name,entries] of Object.entries(edges)) {
    const native=runGodot(path.join(out,name+'.json'),'',name);
    edgeComparisons[name]=compareTrace(c,replay(c,{},entries),native.frames);
  }
  const edgePassed=Object.values(edgeComparisons).every(result=>result.passed);
  const geometry=normal.geometry;
  const geometryPassed=Math.abs(geometry.playerHalfSize-c.playerHalfSize)<1e-6&&geometry.wallSize.every((v,i)=>Math.abs(v-c.wall.size[i])<1e-6)&&geometry.cameraFov===c.camera.fov;
  const uiPassed=Object.values(normal.uiChecks).every(v=>v===true);
  const report={schema:1,passed:edgePassed&&uiPassed&&geometryPassed&&comparisons.normal.passed&&comparisons.repeat.passed&&!comparisons.noCollision.passed&&!comparisons.noRestart.passed,environment:{node:process.version,os:os.platform(),architecture:os.arch(),godot:normal.engine.string},geometryPassed,edgeComparisons,uiChecks:normal.uiChecks,comparisons,visualValidation:'not run by this command',limitations:['Fixed XZ movement, one axis-aligned wall, no gravity or general physics equivalence.','Desktop behavior validation does not establish Web export support.']};
  fs.writeFileSync(path.join(out,'behavior-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.passed) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
