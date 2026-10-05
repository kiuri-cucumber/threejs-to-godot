#!/usr/bin/env node
// Reuse the existing native tests; a fresh output directory prevents stale passes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { replay } from '../../examples/04-playable-migration/three/model.mjs';
import { compareTrace } from '../../examples/04-playable-migration/verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'out/godot-ci'));
fs.mkdirSync(output, { recursive: true });
const run = fs.mkdtempSync(path.join(output, 'run-'));
const result = {
  passed: false,
  node: process.version,
  os: os.platform(),
  architecture: os.arch(),
  expectedGodot: process.env.GODOT_EXPECTED_VERSION || '4.6.3.stable.official',
  godot: null,
  visualValidation: 'not run',
  webExportValidation: 'not run',
};
const env = { ...process.env };
for (const [key, directory] of Object.entries({
  XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_CONFIG_HOME: 'config', TMPDIR: 'tmp',
})) {
  env[key] = path.join(run, directory);
  fs.mkdirSync(env[key], { recursive: true });
}

function execute(command, args, log, timeout) {
  const child = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(run, log), `${child.stdout ?? ''}\n${child.stderr ?? ''}`);
  if (child.error || child.status !== 0) {
    throw new Error(`${log}: ${child.error?.message || `exit ${child.status}, signal ${child.signal}`}`);
  }
  return child.stdout;
}

try {
  if (process.argv.length > 3) throw new Error('Usage: node run-godot-checks.mjs [output-directory]');
  if (!env.GODOT) throw new Error('Set GODOT to an existing executable; this script installs nothing.');
  result.godot = execute(env.GODOT, ['--version'], 'version.log', 15_000).trim();
  if (!result.godot.startsWith(`${result.expectedGodot}.`)
      || !/^[0-9a-f]{9}$/.test(result.godot.slice(result.expectedGodot.length + 1))) {
    throw new Error(`Expected ${result.expectedGodot} build, got ${result.godot}`);
  }

  const unitLog = execute('bash', ['-e', path.join(root, 'skills/threejs-to-godot-port/scripts/test-godot.sh')], 'unit.log', 330_000);
  result.unitTests = unitLog.match(/^ALL TESTS PASSED \(([1-9]\d*) tests, ([1-9]\d*) checks\)$/m)?.[0];
  if (!result.unitTests) throw new Error('Native unit tests did not report executed tests and checks.');

  const playable = path.join(run, 'playable');
  execute(process.execPath, [path.join(root, 'examples/04-playable-migration/verify.mjs'), playable], 'verify.log', 210_000);
  const report = JSON.parse(fs.readFileSync(path.join(playable, 'behavior-report.json'), 'utf8'));
  const native = JSON.parse(fs.readFileSync(path.join(playable, 'godot-trace.json'), 'utf8'));
  // Engine.get_version_info().string uses a different format from --version.
  const engine = native.engine;
  const version = [engine.major, engine.minor, ...(engine.patch ? [engine.patch] : []),
    engine.status, engine.build, engine.hash.slice(0, 9)].join('.');
  if (version !== result.godot) throw new Error('Replay engine differs from the checked executable.');
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'examples/04-playable-migration/godot/contract.json'), 'utf8'));
  result.controlBehavior = {};
  for (const [control, options] of [
    ['no-collision', { noCollision: true }], ['no-restart', { noRestart: true }],
  ]) {
    const trace = JSON.parse(fs.readFileSync(path.join(playable, `control-${control}.json`), 'utf8'));
    const proof = compareTrace(contract, replay(contract, options), trace.frames);
    result.controlBehavior[control] = { passed: proof.passed, maxPositionError: proof.maxPositionError };
    if (trace.schema !== 1 || trace.control !== control || trace.engine.hash !== engine.hash || !proof.passed) {
      throw new Error(`Control ${control} lacks a valid trace of the intended disabled behavior.`);
    }
  }
  const comparisons = report.comparisons;
  if (report.passed !== true
      || comparisons.normal.passed !== true || comparisons.repeat.passed !== true
      || comparisons.noCollision.passed !== false || comparisons.noRestart.passed !== false
      || !comparisons.noCollision.failures.length || !comparisons.noRestart.failures.length) {
    throw new Error('Native comparison must pass and both negative controls must be rejected.');
  }
  result.frames = native.frames.length;
  result.comparisons = Object.fromEntries(Object.entries(comparisons).map(([key, value]) => [key, {
    passed: value.passed, maxPositionError: value.maxPositionError, failureCount: value.failures.length,
  }]));
  result.passed = true;
} catch (error) {
  result.error = error.message;
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(run, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, evidence: run }, null, 2));
}
