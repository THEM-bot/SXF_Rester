/** 开放 API HTTP 工具（有限重试 · P-304） */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 400;

function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function isIdempotentRequest(method, urlPath) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(urlPath || '');
  if (m === 'GET') return true;
  if (m === 'POST' && /\/findPage|\/detail\//i.test(p)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {() => Promise<Response>} doFetch
 */
export async function fetchWithRetry(doFetch, { method, urlPath } = {}) {
  const maxAttempts = isIdempotentRequest(method, urlPath) ? MAX_RETRIES + 1 : 1;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await doFetch();
      if (isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1 && isIdempotentRequest(method, urlPath)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('fetch failed');
}
