#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli } from './lib/open-api-client.mjs';
import { upsertSkill, readRegistry, listSkills } from './lib/registry.mjs';
import { resolveSkillsRoot } from './lib/paths.mjs';

const args = parseCli(process.argv.slice(2));
const action = String(args._[0] || '');

async function main() {
  if (args.help || !action) {
    console.log(`Usage:
  node tools/registry.mjs read --skills-root <path>
  node tools/registry.mjs upsert --skills-root <path> --json '<entry>'
  node tools/registry.mjs list --skills-root <path>`);
    process.exit(0);
  }
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  if (action === 'read') {
    console.log(JSON.stringify(readRegistry(skillsRoot), null, 2));
  } else if (action === 'list') {
    console.log(JSON.stringify(listSkills(skillsRoot), null, 2));
  } else if (action === 'upsert') {
    const raw = args.json || args._[1];
    if (!raw) throw new Error('upsert requires --json');
    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const saved = upsertSkill(skillsRoot, entry);
    console.log(JSON.stringify(saved, null, 2));
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
