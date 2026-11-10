import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..');
const destination = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'pm-flow');
const target = path.join(destination, 'SKILL.md');
if (fs.existsSync(target)) {
  console.error(`已存在 ${target}，为保护现有配置，请先检查后再处理。`);
  process.exit(1);
}
const template = fs.readFileSync(path.join(directory, 'skill', 'SKILL.md'), 'utf8');
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(target, template.replace('__PM_FLOW_ROOT__', root), { encoding: 'utf8', flag: 'wx' });
console.log(`已安装 pm-flow skill：${target}`);
