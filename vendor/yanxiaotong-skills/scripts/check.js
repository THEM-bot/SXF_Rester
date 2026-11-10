#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const PACK_ROOT = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'self-check.js')], {
  stdio: 'inherit',
  cwd: PACK_ROOT,
});
