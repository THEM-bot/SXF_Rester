#!/usr/bin/env node
/**
 * Cross-platform mock zip (forward-slash paths, store-only). Preferred over .ps1 on Windows Agent.
 * Usage:
 *   node tools/pack-mock-zip.mjs --source path/to/dist --out path/to/out.zip
 *   node tools/pack-mock-zip.mjs --source path/to/dist --workspace-root path/to/repo [--project-name my-app]
 *
 * 硬门禁：源目录根下 `index.html` 必须存在且非空（去 BOM/空白后仍有内容），否则 exit 1 并打印中文提示（见 zip-store.assertPackableIndexHtml）。
 */
import path from 'node:path';
import { createZipFromDir } from './lib/zip-store.mjs';
import {
  defaultMockZipOut,
  parseCli,
  projectLabelForRoot,
} from './lib/demo-tools.mjs';

const args = parseCli(process.argv.slice(2));
if (args.help) {
  console.error(
    'Usage: node tools/pack-mock-zip.mjs --source <dist_dir> (--out <out.zip> | --workspace-root <dir> [--project-name <name>])\n' +
      'Requires non-empty index.html at source root.',
  );
  process.exit(0);
}

let outPath = args.out ? String(args.out) : '';
if (!outPath && args['workspace-root']) {
  const ws = String(args['workspace-root']);
  const label = args['project-name']
    ? String(args['project-name'])
    : projectLabelForRoot(ws);
  outPath = defaultMockZipOut(ws, label);
}

if (!args.source || !outPath) {
  console.error(
    'Usage: node tools/pack-mock-zip.mjs --source <dist_dir> (--out <out.zip> | --workspace-root <dir> [--project-name <name>])',
  );
  process.exit(1);
}

try {
  const source = path.resolve(String(args.source));
  const out = path.resolve(outPath);
  createZipFromDir(source, out);
  console.log(`Wrote: ${out}`);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
