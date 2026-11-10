import fs from 'node:fs';
import path from 'node:path';
import { fetchWithRetry } from '../../../../tools/lib/http-json.mjs';
import {
  getActiveEnv,
  parseCli,
  publicEnvBaseUrl,
  publicEnvLabel,
  resolveToken,
} from '../../../../tools/lib/open-api-token.mjs';

export { parseCli, publicEnvBaseUrl, publicEnvLabel, resolveToken, getActiveEnv };

export function resolveBaseUrl(cliBase) {
  const b = String(cliBase || '').trim();
  return b || publicEnvBaseUrl();
}

export async function fetchSyncMeta(skillId, { token, baseUrl } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const t =
    token ||
    resolveToken({ environment: publicEnvLabel() }) ||
    (() => {
      throw new Error('No token');
    })();
  const url = `${base.replace(/\/$/, '')}/api/open/skills/imported/${encodeURIComponent(skillId)}/sync-meta`;
  const res = await fetchWithRetry(
    () =>
      fetch(url, {
        method: 'GET',
        headers: {
          'X-Open-Api-Token': t,
          Accept: 'application/json',
        },
      }),
    { method: 'GET', urlPath: '/api/open/skills/imported/{id}/sync-meta' },
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error(`Non-JSON sync-meta (${res.status}): ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (!res.ok || json.success === false || (json.code != null && json.code !== 200 && json.code !== '200')) {
    const err = new Error(json.message || json.msg || `sync-meta failed (${res.status})`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

export async function fetchSkillZipToFile(skillId, destZipPath, { token, baseUrl } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const t =
    token ||
    resolveToken({ environment: publicEnvLabel() }) ||
    (() => {
      throw new Error('No token');
    })();
  const url = `${base.replace(/\/$/, '')}/api/open/skills/imported/${encodeURIComponent(skillId)}/skill-zip`;
  const res = await fetchWithRetry(
    () =>
      fetch(url, {
        method: 'GET',
        headers: {
          'X-Open-Api-Token': t,
          Accept: 'application/zip, application/octet-stream, */*',
        },
      }),
    { method: 'GET', urlPath: '/api/open/skills/imported/{id}/skill-zip' },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.message || j.msg || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg || `skill-zip failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error('Downloaded zip too small');
  }
  fs.mkdirSync(path.dirname(destZipPath), { recursive: true });
  fs.writeFileSync(destZipPath, buf);
  return destZipPath;
}
