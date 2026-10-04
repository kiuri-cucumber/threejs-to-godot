#!/usr/bin/env node
// Read declarative JSON only. Never import source JavaScript or fetch assets.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/harness.mjs';
import { preflight } from './lib/preflight.mjs';
const USAGE = `Usage: node preflight.mjs --inventory <inventory.json> [--loss-report <scene.lost.json>] [--settings <scene.settings.json>] [--out <report.json>] [--strict]

Offline compatibility planning. Reuses existing export audit rules.
Supported means a bounded path exists, not that a port is complete.
Missing knowledge needs manual inspection; arbitrary JS/assets are never executed/fetched.
Exit: 0 report produced; 1 invalid input/tool failure; 2 --strict found manual or unsupported work.`;
function read(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Input exceeds the 8 MiB limit');
  return JSON.parse(bytes.toString('utf8'));
}
export function main(argv) {
  if (argv.includes('--help')) { console.log(USAGE); return 0; }
  const args = parseArgs(argv, { inventory: { type: 'string', required: true }, 'loss-report': { type: 'string' }, settings: { type: 'string' }, out: { type: 'string' }, strict: { type: 'boolean' } });
  const inputPaths = [args.inventory, args['loss-report'], args.settings].filter(Boolean);
  if (args.out) {
    const outputPath = path.resolve(args.out);
    const outputInfo = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
    if (inputPaths.some(file => {
      const inputPath = path.resolve(file);
      if (inputPath === outputPath) return true;
      if (!outputInfo) return false;
      const inputInfo = fs.statSync(inputPath);
      return fs.realpathSync(inputPath) === fs.realpathSync(outputPath) || (inputInfo.dev === outputInfo.dev && inputInfo.ino === outputInfo.ino);
    })) throw new Error('Output must not overwrite an input or its file alias');
  }
  const report = preflight(read(args.inventory), { lossReport: args['loss-report'] ? read(args['loss-report']) : undefined, settings: args.settings ? read(args.settings) : undefined });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (args.out) {
    const destination = path.resolve(args.out);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = path.join(path.dirname(destination), `.preflight-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, json, { flag: 'wx' });
      // Replace the directory entry atomically; never follow an output symlink
      // that may have changed since validation.
      fs.renameSync(temporary, destination);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  else process.stdout.write(json);
  return args.strict && (report.summary.unsupported || report.summary['needs-manual']) ? 2 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
