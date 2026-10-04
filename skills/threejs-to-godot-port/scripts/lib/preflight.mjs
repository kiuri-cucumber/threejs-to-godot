// Offline planning, not a JavaScript analyser or a portability certificate.
// Reuse the exporter's audit rules rather than implementing a second loss list.
import { findLosses } from './loss-rules.mjs';

export const FEATURE_VALUES = {
  geometry: ['static-meshes', 'instanced', 'skinned', 'unknown'],
  camera: ['perspective', 'orthographic', 'unknown'],
  materials: ['basic-standard', 'physical', 'toon', 'custom-shader', 'unknown'],
  input: ['none', 'keyboard-pointer', 'gamepad', 'unknown'],
  ui: ['none', 'dom', 'canvas', 'unknown'],
  state: ['none', 'custom', 'unknown'],
  animation: ['none', 'clips', 'procedural', 'unknown'],
  physics: ['none', 'custom', 'engine', 'unknown'],
};
const RANK = { supported: 0, 'needs-manual': 1, unsupported: 2 };
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function fields(value, required, label) {
  object(value, label);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key))) throw new Error(`${label} has missing or unknown fields`);
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
}
function text(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${label} must be short single-line text`);
}
export function validateInventory(value) {
  fields(value, ['schema', 'source', 'features', 'externalAssets'], 'inventory');
  if (value.schema !== 1) throw new Error('inventory.schema must be 1');
  fields(value.source, ['label', 'threeRevision'], 'source');
  text(value.source.label, 'source.label');
  if (value.source.threeRevision !== null && (typeof value.source.threeRevision !== 'string' || !/^\d{1,4}$/.test(value.source.threeRevision))) throw new Error('source.threeRevision must be a revision string such as "185", or null');
  fields(value.features, Object.keys(FEATURE_VALUES), 'features');
  for (const [key, allowed] of Object.entries(FEATURE_VALUES)) choice(value.features[key], allowed, `features.${key}`);
  fields(value.externalAssets, ['inventory', 'items'], 'externalAssets');
  choice(value.externalAssets.inventory, ['complete', 'unknown'], 'externalAssets.inventory');
  if (!Array.isArray(value.externalAssets.items) || value.externalAssets.items.length > 1000) throw new Error('externalAssets.items must be an array with at most 1000 items');
  const ids = new Set();
  for (const asset of value.externalAssets.items) {
    fields(asset, ['id', 'kind', 'storage', 'availability', 'license'], 'asset');
    if (typeof asset.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(asset.id) || ids.has(asset.id)) throw new Error('asset.id must be a unique short identifier');
    ids.add(asset.id);
    choice(asset.kind, ['mesh', 'texture', 'audio', 'font', 'other'], 'asset.kind');
    choice(asset.storage, ['local', 'embedded', 'remote', 'unknown'], 'asset.storage');
    choice(asset.availability, ['verified', 'missing', 'unknown'], 'asset.availability');
    choice(asset.license, ['confirmed', 'unknown'], 'asset.license');
  }
  return value;
}

// Require the fields consumed by findLosses. A malformed/old audit must fail
// explicitly, not become an empty loss report. Extra exporter fields are kept compatible.
function validateLossReport(report) {
  object(report, 'loss report');
  if (report.schema !== 1) throw new Error('loss report.schema must be 1');
  object(report.audit, 'loss report.audit');
  const audit = report.audit;
  if (audit.revision !== null && (typeof audit.revision !== 'string' || !/^\d{1,4}$/.test(audit.revision))) throw new Error('audit.revision must be a revision string or null');
  object(audit.objects, 'audit.objects'); object(audit.scene, 'audit.scene');
  for (const key of ['total', 'meshes', 'instanced', 'points', 'lines', 'sprites', 'skinned']) if (!Number.isInteger(audit.objects[key]) || audit.objects[key] < 0) throw new Error(`audit.objects.${key} must be a nonnegative integer`);
  for (const key of ['castShadow', 'receiveShadow']) if (!Array.isArray(audit.objects[key]) || !audit.objects[key].every(v => typeof v === 'string')) throw new Error(`audit.objects.${key} must contain names`);
  if (!Array.isArray(audit.materials) || !Array.isArray(audit.lights) || !Array.isArray(report.warnings)) throw new Error('loss report arrays are missing');
  for (const material of audit.materials) {
    object(material, 'audit material');
    if (typeof material.type !== 'string' || typeof material.side !== 'string' || !Array.isArray(material.users) || !material.users.every(v => typeof v === 'string') || !Array.isArray(material.textures)) throw new Error('invalid audit material');
    for (const key of ['isShaderMaterial', 'onBeforeCompile', 'gradientMap', 'vertexColors', 'colorAttributeOnSomeUser']) if (typeof material[key] !== 'boolean') throw new Error(`audit material.${key} must be boolean`);
  }
  for (const light of audit.lights) {
    object(light, 'audit light');
    if (typeof light.type !== 'string' || typeof light.name !== 'string' || typeof light.castShadow !== 'boolean' || !(light.decay === null || Number.isFinite(light.decay)) || !(light.targetIsChild === null || typeof light.targetIsChild === 'boolean')) throw new Error('invalid audit light');
  }
  if (typeof audit.scene.environment !== 'boolean' || ![audit.scene.fog, audit.scene.background].every(v => v === null || typeof v === 'string')) throw new Error('invalid audit scene');
  if (audit.renderer !== null) {
    object(audit.renderer, 'audit.renderer');
    if (!Number.isFinite(audit.renderer.toneMapping)) throw new Error('invalid audit renderer');
  }
  for (const warning of report.warnings) {
    object(warning, 'exporter warning');
    if (typeof warning.message !== 'string') throw new Error('warning.message must be text');
  }
  return audit;
}

export function preflight(inventory, { lossReport, settings } = {}) {
  const input = validateInventory(inventory);
  const checks = new Map();
  function add(id, status, basis, note, action) {
    const current = checks.get(id) ?? { id, status: 'supported', basis: [], notes: [], actions: [] };
    if (RANK[status] > RANK[current.status]) current.status = status;
    for (const [key, value] of [['basis', basis], ['notes', note], ['actions', action]]) if (!current[key].includes(value)) current[key].push(value);
    checks.set(id, current);
  }
  const declared = (id, status, note, action) => add(id, status, 'declared inventory', note, action);
  const { features } = input;
  for (const [id, value] of Object.entries(features)) {
    if (value === 'unknown') {
      declared(id, 'needs-manual', 'Not inventoried; absence has not been established.', 'Inspect the runnable source and update this declaration.');
    } else if (value === 'none') {
      declared(id, 'supported', 'Declared absent; there is no claimed conversion work for this feature.', 'Confirm the declaration against the runnable source.');
    } else if (id === 'geometry' && value === 'static-meshes') {
      declared(id, 'supported', 'Static meshes have an existing glTF or editable-scene carrying path.', 'Export/import, inspect the node tree, and compare geometry and images.');
    } else if (id === 'camera' && value === 'perspective') {
      declared(id, 'supported', 'The capture pipeline supports a non-degenerate perspective camera.', 'Check world pose, effective vertical FOV, clip planes, and fixed shots.');
    } else if (id === 'materials' && value === 'basic-standard') {
      declared(id, 'supported', 'Basic/standard materials have a bounded carrying path.', 'Run the existing material/light audit and rendered comparisons.');
    } else if (id === 'geometry' || id === 'camera' || (id === 'materials' && value === 'custom-shader') || id === 'animation') {
      const note = id === 'animation'
        ? 'This harness does not pass AnimationClips to GLTFExporter and does not translate procedural animation.'
        : `${value} is outside the currently validated automatic export/capture path.`;
      declared(id, 'unsupported', note, 'Scope a small manual prototype or extend the tool and its negative tests before proceeding.');
    } else {
      const action = { input: 'Rebuild named actions with InputMap and test press, release and focus loss.', ui: 'Rebuild with Control nodes; check text, layout and interactions.', state: 'Specify state transitions, fixed ticks, success and complete restart; compare traces.', physics: 'Rebuild collision/physics and remeasure; do not assume engine equivalence.', materials: 'Rebuild or tune the material using the existing loss report, then compare rendered images.' }[id];
      declared(id, 'needs-manual', `${value} needs explicit native reconstruction or measurement.`, action);
    }
  }
  const revision = input.source.threeRevision;
  declared('three-version', revision === '185' ? 'supported' : revision !== null && Number(revision) < 155 ? 'unsupported' : 'needs-manual', revision === '185' ? 'r185 is the measured source revision for these tools.' : 'The declared revision is unknown or outside the measured r185 environment.', 'Record actual versions; revalidate behavior and rendering on the target environment.');

  const assets = input.externalAssets;
  declared('external-assets', assets.inventory === 'complete' && assets.items.length === 0 ? 'supported' : 'needs-manual', assets.inventory === 'unknown' ? 'External-asset inventory is incomplete.' : `${assets.items.length} external assets declared.`, 'Verify all resource paths, availability, redistribution rights and target imports; no assets are fetched by this tool.');
  for (const asset of assets.items) {
    const status = asset.availability === 'missing' ? 'unsupported' : 'needs-manual';
    add(`asset:${asset.id}`, status, 'declared inventory', `${asset.kind}; ${asset.storage}; availability ${asset.availability}; license ${asset.license}.`, asset.availability === 'missing' ? 'Obtain an authorized readable copy or replace/remove this dependency before migration.' : 'Verify content, import support and license evidence manually; "confirmed" is a declaration, not a legal audit.');
  }

  if (lossReport !== undefined) {
    const audit = validateLossReport(lossReport);
    // Recompute rules from audit data; do not trust a stored empty findings list.
    const { findings } = findLosses(audit, lossReport.warnings.map(w => w.message));
    for (const finding of findings) {
      const status = ['L01', 'L04', 'L11'].includes(finding.id) ? 'unsupported' : 'needs-manual';
      add(`loss:${finding.id}`, status, 'existing export audit', finding.what, finding.action);
    }
    if (audit.objects.instanced || audit.objects.skinned || audit.objects.points || audit.objects.lines || audit.objects.sprites) add('geometry', 'unsupported', 'existing export audit', 'The audit contains object kinds outside the validated static-mesh path.', 'Resolve any conflict with the declaration; test a small native import first.');
    if (audit.materials.some(m => m.isShaderMaterial || m.onBeforeCompile)) add('materials', 'unsupported', 'existing export audit', 'Custom shader code is observed, regardless of the declared material category.', 'Rewrite and validate the shader in Godot.');
    if (audit.materials.some(m => !['MeshBasicMaterial', 'MeshStandardMaterial'].includes(m.type))) add('materials', 'needs-manual', 'existing export audit', 'The audit includes other material classes.', 'Use the existing material mapping guidance and compare images.');
    if ((audit.materials.some(m => m.textures.length) || audit.scene.background === 'texture' || audit.scene.environment) && assets.items.length === 0) add('external-assets', 'needs-manual', 'existing export audit', 'Texture/environment resources are observed but the asset inventory is empty.', 'Complete the asset inventory; the audit does not establish URLs, availability or licenses.');
    if (audit.revision !== revision || audit.revision === null) add('three-version', audit.revision !== null && Number(audit.revision) < 155 ? 'unsupported' : 'needs-manual', 'existing export audit', 'Audited Three.js revision is unknown or disagrees with the declaration.', 'Reconcile source/exporter versions before using measured mappings.');
    if (lossReport.exporterRevision !== undefined && lossReport.exporterRevision !== '185') add('three-version', 'needs-manual', 'existing export audit', 'Exporter revision differs from the measured r185 tooling.', 'Record the exporter version and rerun compatibility checks.');
  }
  if (settings !== undefined) {
    object(settings, 'settings');
    const settingKeys = ['schema', 'source', 'renderer', 'camera', 'background', 'fog', 'environment', 'lights', 'objects', 'materials'];
    if (settings.schema !== 1 || settingKeys.some(key => !Object.hasOwn(settings, key))) throw new Error('settings must be a complete schema 1 dump-settings report');
    object(settings.source, 'settings.source'); object(settings.background, 'settings.background'); object(settings.environment, 'settings.environment');
    const observedRevision = settings.source.three;
    if (observedRevision !== null && (typeof observedRevision !== 'string' || !/^\d{1,4}$/.test(observedRevision))) throw new Error('settings.source.three must be a revision string or null');
    if (observedRevision !== revision || observedRevision === null) add('three-version', observedRevision !== null && Number(observedRevision) < 155 ? 'unsupported' : 'needs-manual', 'existing settings', 'Settings source revision is unknown or disagrees with the declaration.', 'Reconcile source versions before using measured mappings.');
    if (!Array.isArray(settings.materials) || !Array.isArray(settings.objects) || !Array.isArray(settings.lights)) throw new Error('settings materials/objects/lights must be arrays');
    if (settings.materials.length || settings.objects.length) add('settings-properties', 'needs-manual', 'existing settings', 'Material/object properties are observed; property-level portability is not classified from settings alone.', 'Run the existing export loss audit, reconcile both reports, and verify native material/shadow application.');
    for (const material of settings.materials) {
      object(material, 'settings material');
      if (typeof material.type !== 'string') throw new Error('settings material.type must be text');
      if (material.type.includes('ShaderMaterial')) add('materials', 'unsupported', 'existing settings', 'Settings observe custom shader material code.', 'Rewrite and validate the shader in Godot.');
      else if (!['MeshBasicMaterial', 'MeshStandardMaterial'].includes(material.type)) add('materials', 'needs-manual', 'existing settings', `Observed material class: ${material.type}.`, 'Use existing material mapping guidance and rendered verification.');
    }
    for (const item of settings.objects) {
      object(item, 'settings object');
      if (typeof item.instanced !== 'boolean') throw new Error('settings object.instanced must be boolean');
      if (item.instanced) add('geometry', 'unsupported', 'existing settings', 'Settings contain InstancedMesh objects outside the validated path.', 'Test a small native import and material/shadow mapping before proceeding.');
    }
    if (typeof settings.background.type !== 'string' || typeof settings.environment.hasEnvironmentMap !== 'boolean') throw new Error('invalid settings background/environment');
    if (settings.background.type === 'texture' || settings.environment.hasEnvironmentMap) add('external-assets', 'needs-manual', 'existing settings', 'Settings observe background or environment textures.', 'Reconcile the asset inventory and verify paths, availability and rights.');
    if (settings.renderer !== null || settings.fog !== null || settings.lights.length || settings.background.type !== 'none') add('settings-rendering', 'needs-manual', 'existing settings', 'Scene/renderer/light settings require native rebuilding and measured comparison.', 'Use apply_settings.gd and the existing material/light/camera guidance, then capture and compare.');
    for (const key of ['warnings', 'notes']) {
      if (settings[key] !== undefined && (!Array.isArray(settings[key]) || !settings[key].every(value => typeof value === 'string'))) throw new Error(`settings.${key} must contain text`);
      if (settings[key]?.length) add('settings-warnings', 'needs-manual', 'existing settings', `The settings report contains ${key}; they must be reviewed.`, 'Read the original settings warning/note text and resolve each item.');
    }
    if (Object.keys(settings).some(key => ![...settingKeys, 'warnings', 'notes'].includes(key))) add('settings-unclassified', 'needs-manual', 'existing settings', 'Settings contain fields this preflight version does not classify.', 'Inspect the extra evidence manually; do not treat it as absent.');
    if (settings.camera === null) add('camera', 'unsupported', 'existing settings', 'No camera was captured in settings.', 'Supply and validate a perspective source camera.');
    else {
      object(settings.camera, 'settings.camera');
      if (typeof settings.camera.type !== 'string') throw new Error('settings.camera.type must be text');
      if (settings.camera.type !== 'PerspectiveCamera') add('camera', 'unsupported', 'existing settings', `Observed camera type: ${settings.camera.type}.`, 'The current capture path requires PerspectiveCamera; do not accept the fallback as a valid match.');
      else {
        const c = settings.camera;
        const vector = (v, n) => Array.isArray(v) && v.length === n && Array.from({ length: n }, (_, i) => i).every(i => Number.isFinite(v[i]));
        if (!Number.isFinite(c.effectiveFOV) || c.effectiveFOV <= 0 || c.effectiveFOV >= 180 || !Number.isFinite(c.near) || !Number.isFinite(c.far) || c.near <= 0 || c.far <= c.near || !vector(c.position, 3) || !vector(c.quaternion, 4) || Math.abs(Math.hypot(...c.quaternion) - 1) > 1e-4) throw new Error('Perspective settings require valid effective FOV, clip planes and world pose');
      }
    }
  }
  const list = [...checks.values()].sort((a, b) => a.id.localeCompare(b.id));
  const summary = Object.fromEntries(Object.keys(RANK).map(status => [status, list.filter(check => check.status === status).length]));
  return {
    schema: 1, source: input.source, portabilityVerified: false,
    recommendation: summary.unsupported ? 'stop-current-pipeline' : summary['needs-manual'] ? 'plan-manual-work' : 'run-export-and-verification',
    summary, checks: list,
    coverage: { inventory: 'user declarations, not source-code analysis', lossAuditPresent: lossReport !== undefined, settingsPresent: settings !== undefined, notInspected: ['JavaScript behavior and dynamic loading', 'asset bytes, URLs, credentials or license documents', 'Godot import/runtime', 'browser or GPU rendering', 'Web export and other target platforms'] },
    meaning: { supported: 'A bounded path exists for the declaration; success is not verified.', 'needs-manual': 'Rebuild, inspect or gather missing evidence.', unsupported: 'Outside the current automatic/validated path, or blocked by missing inputs; manual migration may still be possible.' },
  };
}
