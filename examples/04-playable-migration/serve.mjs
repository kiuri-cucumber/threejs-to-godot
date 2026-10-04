#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../skills/threejs-to-godot-port/scripts/lib/harness.mjs';
const server = await startServer({ userRoot: path.dirname(fileURLToPath(import.meta.url)) });
console.log(`Open ${server.origin}/user/three/index.html`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
