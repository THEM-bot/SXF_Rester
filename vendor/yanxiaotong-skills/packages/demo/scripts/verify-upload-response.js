#!/usr/bin/env node
'use strict';
// Launcher: always delegates to .cjs (safe when host project has "type":"module").
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, 'verify-upload-response.cjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status === null ? 1 : r.status);
