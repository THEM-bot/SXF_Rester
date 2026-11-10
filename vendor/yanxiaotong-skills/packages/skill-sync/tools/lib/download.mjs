import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fetchSkillZipToFile } from './open-api-client.mjs';
import { findSkillMdDir } from './paths.mjs';

export async function downloadSkillZipToStaging(skillId, stagingDir, opts = {}) {
  const zipPath = path.join(os.tmpdir(), `skill-sync-${skillId}-${randomUUID()}.zip`);
  try {
    await fetchSkillZipToFile(skillId, zipPath, opts);
    fs.mkdirSync(stagingDir, { recursive: true });
    extractZip(zipPath, stagingDir);
    const skillDir = findSkillMdDir(stagingDir);
    if (!skillDir) {
      throw new Error('SKILL.md not found in downloaded package');
    }
    return { stagingDir, skillDir, zipPath };
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
}

/**
 * 解压 skill-zip。服务端须 UTF-8 出包（SkillsSnapshotPackageUtil）；客户端优先 tar，Windows 回退 .NET ZipFile（P-259）。
 */
export function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const errors = [];

  try {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
    return;
  } catch (e) {
    errors.push(`tar: ${e.message || e}`);
  }

  if (process.platform === 'win32') {
    try {
      extractZipWinDotNet(zipPath, destDir);
      return;
    } catch (e) {
      errors.push(`ZipFile: ${e.message || e}`);
    }
    try {
      const cmd = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
      execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'pipe' });
      return;
    } catch (e) {
      errors.push(`Expand-Archive: ${e.message || e}`);
    }
  }

  throw new Error(`Failed to extract zip (${errors.join('; ')})`);
}

function extractZipWinDotNet(zipPath, destDir) {
  const ps = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip='${zipPath.replace(/'/g, "''")}'`,
    `$dest='${destDir.replace(/'/g, "''")}'`,
    'if (Test-Path $dest) { Get-ChildItem -LiteralPath $dest -Force | Remove-Item -Recurse -Force }',
    '[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)',
  ].join('; ');
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'pipe' });
}
