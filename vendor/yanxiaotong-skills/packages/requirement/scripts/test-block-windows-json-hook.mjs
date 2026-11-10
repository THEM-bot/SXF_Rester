#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../hooks/block-windows-json-body.mjs',
);

const cases = [
  { c: 'node -e "const x=1"', expect: 'allow' },
  {
    c: 'node -e "fs.writeFileSync(\'body.json\', JSON.stringify({a:1}))"',
    expect: 'deny',
  },
  {
    c: 'node -e "const d=\'中文\'; fs.writeFileSync(\'a.json\',d)"',
    expect: 'deny',
  },
  { c: 'Set-Content -Path req-create-body.json -Value $json', expect: 'deny' },
  {
    c: 'node tools/requirement-api.mjs create --json body.json --out resp.json',
    expect: 'allow',
  },
];

let failed = 0;
for (const t of cases) {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ command: t.c }),
    encoding: 'utf8',
  });
  const out = JSON.parse(String(r.stdout || '{}').trim() || '{}');
  const ok = out.permission === t.expect;
  console.log(ok ? 'OK' : 'FAIL', t.expect, out.permission, t.c.slice(0, 70));
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
