/**
 * In-memory rate limiting and temporary blocking for order abuse protection.
 *
 * Note: In-memory state resets on redeploy. For Vercel, this is acceptable
 * because deployments are infrequent and attackers must restart their flood.
 * For persistent state across instances, migrate to Vercel KV (Redis).
 */

// ---------------------------------------------------------------------------
// Sliding-window rate limiter
// ---------------------------------------------------------------------------

const requestTimestamps = new Map<string, number[]>();

/**
 * Returns true if the key has exceeded maxRequests within windowMs.
 */
export function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = requestTimestamps.get(key) ?? [];

  // Keep only timestamps inside the current window
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    requestTimestamps.set(key, valid);
    return true;
  }

  valid.push(now);
  requestTimestamps.set(key, valid);
  return false;
}

// ---------------------------------------------------------------------------
// Global velocity circuit breaker
// ---------------------------------------------------------------------------

let globalCount = 0;
let globalWindowStart = Date.now();

const GLOBAL_WINDOW_MS = 60_000; // 1 minute
const GLOBAL_MAX_ORDERS = 30; // max orders per minute site-wide

export function isGloballyThrottled(): boolean {
  const now = Date.now();
  if (now - globalWindowStart > GLOBAL_WINDOW_MS) {
    globalCount = 0;
    globalWindowStart = now;
  }
  globalCount++;
  return globalCount > GLOBAL_MAX_ORDERS;
}

// ---------------------------------------------------------------------------
// Temporary blocklist with escalating duration
// ---------------------------------------------------------------------------

interface BlockEntry {
  until: number;
  violations: number;
}

const blocklist = new Map<string, BlockEntry>();

/**
 * Record a violation for a key (e.g. an IP address).
 * After enough violations the key is temporarily blocked with escalating duration.
 *
 * Escalation ladder:
 *   3 violations  →  5 minutes
 *   5 violations  →  1 hour
 *  10 violations  → 24 hours
 */
export function recordViolation(key: string): void {
  const entry = blocklist.get(key) ?? { until: 0, violations: 0 };
  entry.violations++;

  const now = Date.now();
  if (entry.violations >= 10) {
    entry.until = now + 24 * 60 * 60_000; // 24 hours
  } else if (entry.violations >= 5) {
    entry.until = now + 60 * 60_000; // 1 hour
  } else if (entry.violations >= 3) {
    entry.until = now + 5 * 60_000; // 5 minutes
  }

  blocklist.set(key, entry);
}

/**
 * Returns true if the key is currently blocked.
 */
export function isBlocked(key: string): boolean {
  const entry = blocklist.get(key);
  if (!entry) return false;

  if (Date.now() > entry.until) {
    // Block expired but keep violation count (it only decays on cleanup)
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Periodic cleanup — prevent unbounded memory growth
// ---------------------------------------------------------------------------

function cleanup(): void {
  const now = Date.now();

  // Clean rate-limit timestamps older than 1 hour
  for (const [key, timestamps] of requestTimestamps) {
    const valid = timestamps.filter((t) => now - t < 3_600_000);
    if (valid.length === 0) {
      requestTimestamps.delete(key);
    } else {
      requestTimestamps.set(key, valid);
    }
  }

  // Clean expired blocks older than 48 hours (gives decay time)
  for (const [key, entry] of blocklist) {
    if (now > entry.until + 48 * 60 * 60_000) {
      blocklist.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanup, 10 * 60_000).unref();
