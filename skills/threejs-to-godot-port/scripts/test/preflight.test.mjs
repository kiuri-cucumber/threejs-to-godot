import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preflight, validateInventory, FEATURE_VALUES } from '../lib/preflight.mjs';
import * as THREE from 'three';
import { collectSettings } from '../lib/page-fns.mjs';
import { emptyAudit, material } from './helpers.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', `preflight-${name}.json`)));
const check = (report, id) => report.checks.find(item => item.id === id);
const settingsReport = camera => ({ schema: 1, source: {three:'185'}, camera, renderer: null, background: {type:'none'}, fog:null, environment:{hasEnvironmentMap:false}, materials:[], objects:[], lights:[] });
const loss = audit => ({ schema: 1, audit, warnings: [], findings: [] });

test('declared static path is supported but never a portability certificate', () => {
  const report = preflight(fixture('static'));
  assert.equal(report.recommendation, 'run-export-and-verification');
  assert.equal(report.summary.unsupported, 0);
  assert.equal(report.summary['needs-manual'], 0);
  assert.equal(report.portabilityVerified, false);
  assert.equal(report.coverage.lossAuditPresent, false);
  assert.match(report.meaning.supported, /not verified/);
  assert.deepEqual(report, preflight(fixture('static')));
});

test('unsupported fixture catches shaders, clips, camera, geometry and missing remote assets', () => {
  const report = preflight(fixture('unsupported'));
  assert.equal(report.recommendation, 'stop-current-pipeline');
  for (const id of ['materials', 'animation', 'camera', 'geometry', 'asset:missing-texture']) assert.equal(check(report, id).status, 'unsupported', id);
  for (const id of ['input', 'ui', 'state', 'physics']) assert.equal(check(report, id).status, 'needs-manual', id);
  assert.match(check(report, 'animation').notes.join(' '), /does not pass AnimationClips/);
});

test('input, UI, state and physics require native work even when declared explicitly', () => {
  const input = fixture('static');
  Object.assign(input.features, { input: 'keyboard-pointer', ui: 'dom', state: 'custom', physics: 'custom' });
  const report = preflight(input);
  assert.equal(report.recommendation, 'plan-manual-work');
  for (const id of ['input', 'ui', 'state', 'physics']) assert.equal(check(report, id).status, 'needs-manual');
  assert.match(check(report, 'input').actions.join(' '), /InputMap/);
});

test('every unknown feature and unknown asset inventory stays manual', () => {
  const input = fixture('static');
  for (const key of Object.keys(FEATURE_VALUES)) input.features[key] = 'unknown';
  input.source.threeRevision = null; input.externalAssets.inventory = 'unknown';
  assert.ok(preflight(input).checks.every(item => item.status === 'needs-manual'));
});

test('animations are not silently certified and unmeasured versions are flagged', () => {
  for (const animation of ['clips', 'procedural']) {
    const input = fixture('static'); input.features.animation = animation;
    assert.equal(check(preflight(input), 'animation').status, 'unsupported');
  }
  for (const [revision, status] of [['154', 'unsupported'], ['184', 'needs-manual'], ['186', 'needs-manual']]) {
    const input = fixture('static'); input.source.threeRevision = revision;
    assert.equal(check(preflight(input), 'three-version').status, status);
  }
});

test('asset availability and license declarations never replace import/legal inspection', () => {
  const input = fixture('static');
  input.externalAssets.items = [{ id: 'texture', kind: 'texture', storage: 'local', availability: 'verified', license: 'confirmed' }];
  const report = preflight(input);
  assert.equal(check(report, 'asset:texture').status, 'needs-manual');
  assert.match(check(report, 'asset:texture').actions.join(' '), /not a legal audit/);
});

test('observed audit overrides optimistic declarations and reuses original L rules', () => {
  const audit = emptyAudit();
  audit.materials = [material({ isShaderMaterial: true, type: 'ShaderMaterial', onBeforeCompile: true })];
  audit.objects.skinned = 1;
  const report = preflight(fixture('static'), { lossReport: loss(audit) });
  assert.equal(check(report, 'materials').status, 'unsupported');
  assert.equal(check(report, 'geometry').status, 'unsupported');
  for (const id of ['loss:L01', 'loss:L04', 'loss:L11']) assert.equal(check(report, id).status, 'unsupported');
  assert.equal(report.coverage.lossAuditPresent, true);
});

test('textures, renderer state and ordinary export losses require manual checks', () => {
  const audit = emptyAudit();
  audit.materials = [material({ textures: [{ slot: 'map' }] })];
  audit.scene.background = 'color'; audit.objects.castShadow = ['box'];
  const report = preflight(fixture('static'), { lossReport: loss(audit) });
  for (const id of ['external-assets', 'loss:L08', 'loss:L09', 'loss:L12']) assert.equal(check(report, id).status, 'needs-manual');
});

test('settings reject observed non-perspective or missing cameras', () => {
  for (const camera of [null, { type: 'OrthographicCamera' }]) {
    const report = preflight(fixture('static'), { settings: settingsReport(camera) });
    assert.equal(check(report, 'camera').status, 'unsupported');
  }
});

test('malformed or unknown inventory/audit/settings inputs fail rather than passing', () => {
  const mutations = [v => v.schema = 2, v => delete v.features.animation, v => v.features.input = 'automatic', v => v.source.threeRevision = 185, v => v.source.label = '', v => v.features.network = 'none', v => v.externalAssets.items = 'none', v => v.externalAssets.items = [{ url: 'https://example.invalid/private-token' }]];
  for (const mutate of mutations) { const input = fixture('static'); mutate(input); assert.throws(() => validateInventory(input)); }
  for (const invalid of [{}, { schema: 1, audit: {}, warnings: [] }, { schema: 2, audit: emptyAudit(), warnings: [] }]) assert.throws(() => preflight(fixture('static'), { lossReport: invalid }));
  assert.throws(() => preflight(fixture('static'), { settings: { schema: 1 } }));
});

test('CLI strict negative fixtures fail, reports are deterministic, and inputs cannot be overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-preflight-'));
  const tool = path.join(here, '..', 'preflight.mjs');
  const run = args => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 10000 });
  try {
    const positive = path.join(here, 'fixtures', 'preflight-static.json'), negative = path.join(here, 'fixtures', 'preflight-unsupported.json');
    assert.equal(run(['--help']).status, 0);
    const good = run(['--inventory', positive, '--strict']); assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout, run(['--inventory', positive, '--strict']).stdout);
    assert.equal(JSON.parse(good.stdout).portabilityVerified, false);
    assert.equal(run(['--inventory', negative, '--strict']).status, 2);
    assert.equal(run(['--inventory', negative]).status, 0, 'report generation is distinct from strict readiness');
    assert.equal(run(['--inventory', positive, '--invented']).status, 1);
    assert.equal(run(['--inventory', positive, '--out', positive]).status, 1);
    const file = path.join(dir, 'report.json'); assert.equal(run(['--inventory', negative, '--strict', '--out', file]).status, 2);
    assert.equal(JSON.parse(fs.readFileSync(file)).recommendation, 'stop-current-pipeline');
    assert.ok(!fs.readFileSync(file, 'utf8').includes(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('observed version and malformed perspective data cannot be greenwashed by declarations', () => {
  const audit = emptyAudit(); audit.revision = '154';
  assert.equal(check(preflight(fixture('static'), {lossReport:loss(audit)}), 'three-version').status, 'unsupported');
  audit.revision = null;
  assert.equal(check(preflight(fixture('static'), {lossReport:loss(audit)}), 'three-version').status, 'needs-manual');
  const camera={type:'PerspectiveCamera',effectiveFOV:45,near:.1,far:100,position:[0,2,5],quaternion:[0,0,0,1]};
  assert.equal(check(preflight(fixture('static'), {settings:settingsReport(camera)}), 'camera').status, 'supported');
  for(const mutate of [c=>c.effectiveFOV='45',c=>c.far=Infinity,c=>c.quaternion=[0,0,0,0],c=>c.position=new Array(3)]) {
    const bad=structuredClone(camera);mutate(bad);
    assert.throws(()=>preflight(fixture('static'), {settings:settingsReport(bad)}));
  }
});

test('full settings evidence overrides optimistic inventory across observed categories', () => {
  const settings=settingsReport({type:'PerspectiveCamera',effectiveFOV:45,near:.1,far:100,position:[0,2,5],quaternion:[0,0,0,1]});
  settings.source.three='154';
  settings.materials=[{type:'ShaderMaterial'}];
  settings.objects=[{instanced:true}];
  settings.warnings=['InstancedMesh import was not measured'];
  settings.background={type:'texture'};
  const report=preflight(fixture('static'), {settings});
  for(const id of ['three-version','materials','geometry']) assert.equal(check(report,id).status,'unsupported');
  for(const id of ['external-assets','settings-warnings']) assert.equal(check(report,id).status,'needs-manual');
  assert.equal(report.recommendation,'stop-current-pipeline');
  settings.materials=[];settings.objects=[];settings.source.three='185';settings.futureFeature={};
  assert.equal(check(preflight(fixture('static'), {settings}),'settings-unclassified').status,'needs-manual');
});

test('CLI refuses symlink and hardlink aliases without changing its input', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tg-preflight-alias-'));
  try {
    const input=path.join(dir,'inventory.json'),symlink=path.join(dir,'symlink.json'),hardlink=path.join(dir,'hardlink.json');
    const original=JSON.stringify(fixture('static'));fs.writeFileSync(input,original);
    fs.symlinkSync(input,symlink);fs.linkSync(input,hardlink);
    for(const out of [symlink,hardlink]) {
      const result=spawnSync(process.execPath,[path.join(here,'..','preflight.mjs'),'--inventory',input,'--out',out],{encoding:'utf8'});
      assert.equal(result.status,1);assert.match(result.stderr,/alias/);assert.equal(fs.readFileSync(input,'utf8'),original);
    }
    const out=path.join(dir,'ordinary-output.json');fs.writeFileSync(out,'old report');
    const result=spawnSync(process.execPath,[path.join(here,'..','preflight.mjs'),'--inventory',input,'--out',out],{encoding:'utf8'});
    assert.equal(result.status,0);assert.equal(JSON.parse(fs.readFileSync(out)).portabilityVerified,false);
    assert.ok(!fs.readdirSync(dir).some(name=>name.endsWith('.tmp')));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('actual dump-settings material and shadow properties are never silently certified', () => {
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({side:THREE.BackSide}));
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.z=5;
  const previous=globalThis.window;
  try {
    globalThis.window={__tg:{THREE,scene,camera,renderer:null},__tgPageRevision:'185'};
    const settings=collectSettings();
    const report=preflight(fixture('static'),{settings});
    assert.equal(check(report,'settings-properties').status,'needs-manual');
    assert.equal(report.recommendation,'plan-manual-work');
  } finally {if(previous===undefined) delete globalThis.window;else globalThis.window=previous;}
});
