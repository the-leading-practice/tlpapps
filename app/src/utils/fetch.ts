export const safeJsonParse = (data: string) => {
  try {
    return JSON.parse(data);
  } catch (e) {
    return undefined;
  }
};

export const fetchJson = async (url: string, options: RequestInit) => {
  let data;
  let status;
  let error = '';

  try {
    const resp = await fetch(url, options);
    status = resp.status;

    if (resp.ok) {
      data = await resp.json();
    } else {
      data = await resp.text();
      error = resp.statusText;
    }
  } catch (e: unknown) {
    error = (e as Error).message;
    status = -1;
    data = null;
  }

  return { status, data, error };
};

export type RequestRetryInit = RequestInit & { maxRetries: number };

export const fetchWithRetries = async (
  url: string,
  options: RequestRetryInit,
  retryCount: number = 0,
): Promise<Response> => {
  const { maxRetries = 3, ...remainingOptions } = options;
  try {
    return await fetch(url, remainingOptions);
  } catch (error) {
    if (retryCount < maxRetries) {
      return fetchWithRetries(url, options, retryCount + 1);
    }
    throw error;
  }
};

// ── EDGE-02: status-aware backoff retry (429 + 5xx, Retry-After aware) ──────
// Distinct from fetchWithRetries above (which only retries on thrown network
// errors): this retries on HTTP status codes too, with capped exponential
// backoff + jitter, honoring Retry-After when present. Additive — does not
// change fetchWithRetries/fetchJson/safeJsonParse behavior or signatures.

export type FetchWithBackoffOptions = RequestInit & {
  /** Max retry attempts (not counting the initial try). Default 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default 250. */
  backoffBaseMs?: number;
  /** Upper clamp for any single wait (including Retry-After), in ms. Default 30000. */
  maxDelayMs?: number;
  /** Injectable for tests — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests — defaults to a real setTimeout-based sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function computeBackoffMs(attempt: number, baseMs: number, maxDelayMs: number): number {
  const exp = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return Math.min(exp + jitter, maxDelayMs);
}

function retryAfterMs(resp: Response, maxDelayMs: number): number | undefined {
  const header = resp.headers?.get?.('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds * 1000, maxDelayMs);
}

/**
 * Fetch with capped exponential backoff on 429 + 5xx (Retry-After honored)
 * and on thrown network errors. Returns the final Response on success or
 * after the retry cap is reached (last non-throwing response); rethrows if
 * the cap is exhausted on thrown errors.
 */
export const fetchWithBackoff = async (
  url: string,
  options: FetchWithBackoffOptions = {},
): Promise<Response> => {
  const {
    maxRetries = 3,
    backoffBaseMs = 250,
    maxDelayMs = 30_000,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    ...remainingOptions
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      const resp = await fetchImpl(url, remainingOptions);
      if (!RETRYABLE_STATUSES.has(resp.status) || attempt >= maxRetries) {
        return resp;
      }
      const delay = retryAfterMs(resp, maxDelayMs) ?? computeBackoffMs(attempt, backoffBaseMs, maxDelayMs);
      await sleepImpl(delay);
      attempt += 1;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      const delay = computeBackoffMs(attempt, backoffBaseMs, maxDelayMs);
      await sleepImpl(delay);
      attempt += 1;
    }
  }
};
