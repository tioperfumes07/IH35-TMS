/** Shared rolling 60s window for B8 customers + B9 vendors + B10 accounts QBO master push schedulers. */
export const QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100;

const pushTimestamps: number[] = [];

export function resetQboMasterPushRateLimiterForTests() {
  pushTimestamps.length = 0;
}

export function getQboMasterPushRateWindowCount(nowMs = Date.now()): number {
  const cutoff = nowMs - 60_000;
  while (pushTimestamps.length > 0 && pushTimestamps[0] < cutoff) {
    pushTimestamps.shift();
  }
  return pushTimestamps.length;
}

export function recordQboMasterPushAttempt(nowMs = Date.now()) {
  pushTimestamps.push(nowMs);
}

export function canPushWithinMasterRateLimit(nowMs = Date.now()): boolean {
  return getQboMasterPushRateWindowCount(nowMs) < QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN;
}
