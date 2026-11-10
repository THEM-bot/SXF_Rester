#!/usr/bin/env node
/**
 * 缺陷 NL 解析统一入口
 * SSOT：reference/intent-routing.md
 */
import fs from 'node:fs';
import { parseCli, readSessionFile, resolveOutPath } from './lib/defect-tools.mjs';
import { parseIntent } from './lib/parse-intent-core.mjs';
import { prepareIntent } from './lib/prepare-execute.mjs';
import { readUserTextFromArgs } from '../../../tools/lib/read-user-text.mjs';

const args = parseCli(process.argv.slice(2));

async function main() {
  const text = readUserTextFromArgs(args);
  if (!text) {
    console.log(`Usage: parse-intent.mjs --text "用户句" | --text-file utf8.txt [--prepare] [--out intent.json]`);
    process.exit(args.help ? 0 : 1);
  }

  let intent = parseIntent(text, readSessionFile());

  if (args.prepare) {
    try {
      intent = await prepareIntent(intent, {});
    } catch (e) {
      if (e.code === 'FULL_CREATE_MODE') {
        intent._error = 'FULL_CREATE_MODE';
      } else if (e.code === 'MISSING_FIELDS') {
        intent = e.intent || intent;
      } else {
        intent._prepareError = e.message;
      }
    }
  }

  const payload = `${JSON.stringify(intent, null, 2)}\n`;
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, payload, 'utf8');
    console.error(`OK: wrote ${outPath}`);
  } else {
    console.log(payload.trimEnd());
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
