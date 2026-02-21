/**
 * Tinybird Request Limiter
 *
 * Limits outgoing requests to Tinybird API to avoid hitting organization daily limits
 * (e.g. 1000 requests/day on free tier). Prevents burst of parallel requests when
 * dashboard loads (9+ concurrent calls) from exhausting the quota.
 *
 * Set TINYBIRD_MAX_REQUESTS_PER_MINUTE:
 * - Free tier (1000/day): use 1 or 2
 * - Paid tier: use 30+ (default 30)
 */

const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;

// Sliding window: track timestamps of recent requests
const requestTimestamps: number[] = [];

function getMaxRequestsPerMinute(): number {
  const val = process.env.TINYBIRD_MAX_REQUESTS_PER_MINUTE;
  if (val === undefined || val === "") {
    return DEFAULT_MAX_REQUESTS_PER_MINUTE;
  }
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed < 1) {
    return DEFAULT_MAX_REQUESTS_PER_MINUTE;
  }
  return parsed;
}

function pruneOldTimestamps(now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

/**
 * Wait until we're under the rate limit, then allow the request to proceed.
 * Call this before each Tinybird API request.
 */
export async function waitForTinybirdSlot(): Promise<void> {
  const maxPerMinute = getMaxRequestsPerMinute();
  const windowMs = 60 * 1000;

  while (true) {
    const now = Date.now();
    pruneOldTimestamps(now, windowMs);

    if (requestTimestamps.length < maxPerMinute) {
      requestTimestamps.push(now);
      return;
    }

    // Over limit - wait for oldest request to age out
    const oldest = requestTimestamps[0];
    const waitMs = Math.min(Math.max(0, oldest + windowMs - now + 50), 10000);

    await new Promise((r) => setTimeout(r, waitMs));
  }
}
