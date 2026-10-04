#!/usr/bin/env node
// This small fixture has explicit frozen-state provenance, independent of the
// static pipeline's cumulative at.step shots. Do not silently mix the formats.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validateCapture, validateCamera } from './capture-contract.mjs';
import { meanAbsDiff } from '../../skills/threejs-to-godot-port/scripts/lib/png-metrics.mjs';
const require=createRequire(new URL('../../skills/threejs-to-godot-port/scripts/package.json',import.meta.url));
const {PNG}=require('pngjs');
const root=fileURLToPath(new URL('.',import.meta.url));
const out=path.resolve(process.argv[2]||path.join(root,'out'));
const c=JSON.parse(fs.readFileSync(path.join(root,'godot/contract.json')));
const limits={meanAbsDiff:1.0}; // Provisional: validate, do not widen to hide a failure.
function compare(aDir,bDir,label,imageLimit=limits.meanAbsDiff) {
  const aMeta=JSON.parse(fs.readFileSync(path.join(aDir,'capture.json'))),bMeta=JSON.parse(fs.readFileSync(path.join(bDir,'capture.json')));
  const metadataErrors=[...validateCapture(c,aMeta),...validateCapture(c,bMeta)];
  if(metadataErrors.length) throw new Error('Invalid capture metadata: '+metadataErrors.join(', '));
  const cameraPassed=validateCamera(c,aMeta.camera)&&validateCamera(c,bMeta.camera);
  const results=[];
  for(const shot of c.snapshots) {
    const aState=aMeta.snapshots.find(s=>s.id===shot.id),bState=bMeta.snapshots.find(s=>s.id===shot.id);
    if(!aState||!bState||aState.tick!==shot.tick||bState.tick!==shot.tick||aState.phase!==bState.phase||aState.position.some((v,i)=>Math.abs(v-bState.position[i])>c.positionTolerance)) throw new Error('State provenance mismatch: '+shot.id);
    const a=PNG.sync.read(fs.readFileSync(path.join(aDir,shot.id+'.png'))),b=PNG.sync.read(fs.readFileSync(path.join(bDir,shot.id+'.png')));
    if([a,b].some(img=>img.width!==960||img.height!==540)) throw new Error('Capture dimensions must be 960 × 540');
    const difference=meanAbsDiff(a,b);
    const pair=new PNG({width:1920,height:540});
    PNG.bitblt(a,pair,0,0,960,540,0,0);PNG.bitblt(b,pair,0,0,960,540,960,0);
    fs.mkdirSync(path.join(out,label),{recursive:true});
    fs.writeFileSync(path.join(out,label,shot.id+'.png'),PNG.sync.write(pair));
    results.push({id:shot.id,meanAbsDiff:difference,limit:imageLimit,passed:difference<=imageLimit});
  }
  return {passed:cameraPassed&&results.every(r=>r.passed),cameraPassed,shots:results};
}
const normal=compare(path.join(out,'three'),path.join(out,'godot'),'pairs');
const stability=compare(path.join(out,'three'),path.join(out,'three-again'),'stability-pairs',.1);
const control=compare(path.join(out,'three'),path.join(out,'control-fov-plus-5'),'control-pairs');
const stable=stability.shots.every(s=>s.meanAbsDiff<=.1);
const sensitive=control.shots.some(s=>s.meanAbsDiff>=limits.meanAbsDiff*2);
const report={schema:1,passed:normal.passed&&stable&&!control.passed&&sensitive,normal,stability:{...stability,passed:stable,limit:.1},fovControl:control,controlAtLeastTwiceLimit:sensitive,manualImageReview:'required; open every pair and both goal-ui.png images',limitsStatus:'provisional until measured on your target environment'};
fs.writeFileSync(path.join(out,'visual-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
