#!/usr/bin/env node
/**
 * 解析用户句 → intent.json（可选 --prepare 拉 R02 合并）
 * SSOT：reference/create-defaults.md
 */
import fs from 'node:fs';
import { parseCli, readSessionFile, resolveOutPath, resolveToken, publicEnvLabel } from './lib/task-tools.mjs';
import { parseCreateIntent } from './lib/parse-create-intent.mjs';
import { prepareQuickCreate } from './lib/quick-create.mjs';

const args = parseCli(process.argv.slice(2));

async function main() {
  if (args.help) {
    console.log(`Usage:
  parse-create-intent.mjs --text "用户句" [--prepare] [--out intent.json]
  parse-create-intent.mjs --json partial.json [--prepare] [--out intent.json]`);
    process.exit(0);
  }

  const text = args.text;
  const jsonIn = args.json;
  if (!text && !jsonIn) {
    console.error('--text or --json is required');
    process.exit(1);
  }

  let intent;
  if (jsonIn) {
    const raw = jsonIn === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(jsonIn, 'utf8');
    intent = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } else {
    const session = readSessionFile();
    intent = parseCreateIntent(text, session?.last_create_defaults || null);
  }

  if (args.prepare) {
    const token = args.token || resolveToken({ environment: publicEnvLabel() });
    if (!token) {
      console.error('No token');
      process.exit(1);
    }
    if (intent.create_mode === 'full') {
      console.error('FULL_CREATE_MODE');
      process.exit(2);
    }
    intent = await prepareQuickCreate(intent, { token });
  }

  const payload = `${JSON.stringify(intent, null, 2)}\n`;
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, payload, 'utf8');
    console.error(`OK: wrote ${outPath}`);
  } else {
    process.stdout.write(payload);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
