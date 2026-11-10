import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function settingsFile() {
  return path.join(process.env.PMF_CONFIG_DIR || path.join(os.homedir(), '.pm-flow'), 'settings.json');
}

export function readSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`无法读取 pm-flow 本地配置：${error.message}`);
  }
}

export function saveSettings(patch) {
  const file = settingsFile();
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return next;
}

export function setupComplete(settings) {
  return typeof settings.root === 'string' && Boolean(settings.root.trim()) &&
    typeof settings.yanxiaotong === 'boolean' && typeof settings.obsidian === 'boolean';
}
