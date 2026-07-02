// NOTIF-A (A3) — the ONE documented config object for confirmation-request escalation-until-ack.
// A read receipt is NOT an acknowledgement: only a real chat confirmation_ack (references_message_id
// → the confirmation_request, msg_type='confirmation_ack') stops escalation. This is the whole point.
//
// Schedule (all minutes, server-stamped): a confirmation_request that stays unacked past
// `staleAfterMinutes` becomes eligible; the escalation job re-fires the web push up to
// `maxAttempts` times, waiting the escalating gap in `intervalsMinutes` between attempts
// (attempt 1→2 waits intervalsMinutes[0], 2→3 waits intervalsMinutes[1], …). After the last
// attempt (≈ staleAfterMinutes + Σ intervalsMinutes) the office thread list shows an
// "UNACKNOWLEDGED" badge — surfaced read-only via `unacknowledgedBadgeAfterMinutes`.
export const CHAT_ESCALATION_CONFIG = {
  /** N — a confirmation_request unacked at least this long is eligible for the first re-fire. */
  staleAfterMinutes: 2,
  /** Escalating gap between re-fires; the last value repeats if attempts exceed its length. */
  intervalsMinutes: [2, 5, 10] as const,
  /** Bounded retries — never re-fire more than this many times per confirmation_request. */
  maxAttempts: 3,
  /** After this long unacked, the office DispatchChatPage thread row shows the UNACKNOWLEDGED badge. */
  unacknowledgedBadgeAfterMinutes: 17,
  /** Cron cadence — evaluate every minute (America/Chicago). */
  tickCron: "* * * * *",
} as const;

export type ChatEscalationConfig = typeof CHAT_ESCALATION_CONFIG;

/** One candidate confirmation_request the escalation tick is weighing. */
export type EscalationCandidate = {
  messageId: string;
  /** confirmation_request server_ts (server-stamped). */
  serverTs: Date;
  /** true only when a real confirmation_ack references it — read receipts do NOT set this. */
  acked: boolean;
  /** carried for logging only; NEVER used to exclude (read receipt ≠ acknowledgement). */
  hasReadReceipt: boolean;
  /** how many times we have already re-fired for this message this process-lifetime. */
  attempts: number;
  /** when we last re-fired (in-memory), or null if never. */
  lastEscalatedAt: Date | null;
};

/**
 * Pure escalation selector (A5-tested). Returns the candidates to re-fire NOW.
 * Rules:
 *   - acked (real confirmation_ack) → excluded.
 *   - younger than staleAfterMinutes → excluded (not stale yet).
 *   - attempts ≥ maxAttempts → excluded (bounded retries).
 *   - re-fired more recently than the current escalating interval → excluded (wait).
 *   - hasReadReceipt is IGNORED for exclusion → read-but-unacked is STILL selected.
 */
export function selectEscalations(
  candidates: EscalationCandidate[],
  now: Date,
  config: ChatEscalationConfig = CHAT_ESCALATION_CONFIG,
): EscalationCandidate[] {
  const nowMs = now.getTime();
  return candidates.filter((c) => {
    if (c.acked) return false;
    const ageMin = (nowMs - c.serverTs.getTime()) / 60000;
    if (ageMin < config.staleAfterMinutes) return false;
    if (c.attempts >= config.maxAttempts) return false;
    if (c.lastEscalatedAt) {
      const idx = Math.min(c.attempts, config.intervalsMinutes.length - 1);
      const waitMin = config.intervalsMinutes[idx];
      const sinceLastMin = (nowMs - c.lastEscalatedAt.getTime()) / 60000;
      if (sinceLastMin < waitMin) return false;
    }
    return true;
  });
}
