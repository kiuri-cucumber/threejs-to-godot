#!/usr/bin/env node
// Explicit browser-free scope. Do not rely on the integration suite auto-skipping.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(path.join(here, 'test')).filter(name => name.endsWith('.test.mjs') && name !== 'integration.test.mjs').sort().map(name => path.join(here, 'test', name));
if (!files.length) throw new Error('No unit test files were found');
console.log('Scope: deterministic Node tests. Excludes browser integration, native Godot and rendered/GPU comparisons.');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
