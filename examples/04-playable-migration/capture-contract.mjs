import { isDeepStrictEqual } from 'node:util';
import { replay } from './three/model.mjs';
export function validateCapture(c, metadata) {
  const fail=[];
  if (metadata?.schema!==1||!isDeepStrictEqual(metadata.size,[960,540])) fail.push('schema/size');
  if (!isDeepStrictEqual(metadata?.contract,c)) fail.push('stale-contract');
  if (!Array.isArray(metadata?.snapshots)||metadata.snapshots.length!==c.snapshots.length) return [...fail,'snapshot-count'];
  const frames=replay(c);
  c.snapshots.forEach((shot,index)=>{
    const actual=metadata.snapshots[index],expected=frames[shot.tick];
    if(actual?.id!==shot.id||actual.tick!==shot.tick||actual.phase!==expected.phase) fail.push(`${shot.id}:state`);
    if(!Array.isArray(actual?.position)||actual.position.length!==2||actual.position.some((v,axis)=>!Number.isFinite(v)||Math.abs(v-expected.position[axis])>c.positionTolerance)) fail.push(`${shot.id}:position`);
  });
  return fail;
}
export function validateCamera(c, camera) {
  if(!camera||!Array.isArray(camera.position)||camera.position.length!==3||camera.position.some((v,i)=>!Number.isFinite(v)||Math.abs(v-c.camera.position[i])>1e-5)) return false;
  for(const key of ['fov','near','far']) if(!Number.isFinite(camera[key])||Math.abs(camera[key]-c.camera[key])>1e-5) return false;
  const q=camera.quaternion;
  if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>1e-5) return false;
  const [x,y,z,w]=q;
  // Camera local -Z transformed by its world quaternion.
  const forward=[-2*(x*z+w*y),-2*(y*z-w*x),-(1-2*(x*x+y*y))];
  const up=[2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x)];
  const target=c.camera.lookAt.map((v,i)=>v-c.camera.position[i]);
  const length=Math.hypot(...target);
  const direction=target.map(v=>v/length);
  // This fixture uses +Y-up with no roll; project world-up onto the view plane.
  const expectedUp=[-direction[0]*direction[1],1-direction[1]**2,-direction[2]*direction[1]];
  const upLength=Math.hypot(...expectedUp);
  return length>0&&upLength>1e-6&&forward.every((v,i)=>Math.abs(v-direction[i])<1e-5)&&up.every((v,i)=>Math.abs(v-expectedUp[i]/upLength)<1e-5);
}
