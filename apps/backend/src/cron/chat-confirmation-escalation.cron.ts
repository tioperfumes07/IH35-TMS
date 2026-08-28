// NOTIF-A (A3) — escalation-until-ack for per-load dispatch confirmations.
// Finds confirmation_request messages that are stale AND have NO confirmation_ack (a read receipt is
// NOT an ack — carried for logging, never excludes) and re-fires the driver web push on the escalating
// schedule in CHAT_ESCALATION_CONFIG (the ONE config object). Bounded retries tracked in-memory
// (no schema change / no migration — attempt state resets on restart, which is safe: the DB NOT-EXISTS
// ack check re-derives eligibility every tick). Every re-fire appends ONE events.log_event via the
// CHAT-2 spine (subject_type 'load'/'driver', NEVER a direct events.event_log insert).
//
// Cross-tenant read: runs under withLuciaBypass → chat.* SELECT policies allow identity.is_lucia_bypass(),
// so the tick sees pending confirmations across every operating company in one pass.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { dispatchDriverWebPush } from "../notifications/web-push-dispatcher.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import {
  CHAT_ESCALATION_CONFIG,
  selectEscalations,
  type EscalationCandidate,
} from "../chat/escalation-config.js";

const CRON_NAME = "chat.confirmation_escalation";

let initialized = false;

// In-memory attempt ledger: message_id → { attempts, lastEscalatedAt }. Bounded retries with no
// migration. Pruned opportunistically for messages no longer surfacing as pending.
type AttemptState = { attempts: number; lastEscalatedAt: Date | null };
const attemptLedger = new Map<string, AttemptState>();

/** Exposed for tests — resets the in-memory attempt ledger. */
export function __resetEscalationLedgerForTests(): void {
  attemptLedger.clear();
}

type PendingRow = {
  message_id: string;
  thread_id: string;
  operating_company_id: string;
  body: string | null;
  server_ts: string | Date;
  load_id: string | null;
  load_ref_cache: string | null;
  driver_id: string | null;
  has_read_receipt: boolean;
};

/** Stale unacked confirmation_requests + their driver participant + read-receipt flag, across all tenants. */
async function loadPendingConfirmations(): Promise<PendingRow[]> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<PendingRow>(
      `
        SELECT m.id AS message_id, m.thread_id, m.operating_company_id, m.body, m.server_ts,
               t.load_id, t.load_ref_cache,
               p.driver_id,
               EXISTS (
                 SELECT 1 FROM chat.message_receipts r
                 JOIN chat.participants dp ON dp.id = r.participant_id AND dp.driver_id = p.driver_id
                 WHERE r.message_id = m.id AND r.state = 'read'
               ) AS has_read_receipt
        FROM chat.messages m
        JOIN chat.threads t ON t.id = m.thread_id
        JOIN chat.participants p
          ON p.thread_id = m.thread_id AND p.party_type = 'driver' AND p.left_at IS NULL
        WHERE m.msg_type = 'confirmation_request'
          AND m.status = 'active'
          AND m.server_ts < now() - ($1 * interval '1 minute')
          AND NOT EXISTS (
            SELECT 1 FROM chat.messages ack
            WHERE ack.references_message_id = m.id
              AND ack.msg_type = 'confirmation_ack'
              AND ack.status = 'active'
          )
        ORDER BY m.server_ts ASC
        LIMIT 500
      `,
      [CHAT_ESCALATION_CONFIG.staleAfterMinutes],
    );
    return res.rows;
  });
}

/** Re-fire the driver web push + append the spine event for one escalation attempt. */
async function escalateOne(row: PendingRow, attemptNumber: number): Promise<void> {
  if (!row.driver_id) return;
  const label = row.load_ref_cache ? String(row.load_ref_cache) : String(row.load_id ?? "").slice(0, 8);
  const threadTag = `chat-confirm-${row.thread_id}`;

  // Re-fire the (enhanced, requireInteraction) web push — reuse the existing dispatcher.
  await dispatchDriverWebPush({
    operatingCompanyId: row.operating_company_id,
    driverId: row.driver_id,
    title: "Confirmation still needed",
    body: label
      ? `Load ${label}: a dispatch confirmation is still waiting on you.`
      : "A dispatch confirmation is still waiting on you.",
    tag: threadTag,
    data: {
      kind: "chat_confirmation",
      thread_id: row.thread_id,
      message_id: row.message_id,
      load_id: String(row.load_id ?? ""),
      escalation_attempt: String(attemptNumber),
    },
  });

  // Append ONE spine event per attempt (subject 'load'/'driver'; system actor → attributed to subject).
  // Wrapped defensively: a permission gap on schema events must not kill the loud-alert escalation.
  const subjectType: "load" | "driver" = row.load_id ? "load" : "driver";
  const subjectId = row.load_id ?? row.driver_id;
  // Validate the per-row tenant id before we set it as DB context + write the spine event. The
  // cross-tenant sweep runs under lucia-bypass, so each row carries its own operating_company_id;
  // a null/malformed value would corrupt the event's tenant scope. Fail loud (guard = B-017).
  assertTenantContext(row.operating_company_id, CRON_NAME);
  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [row.operating_company_id]);
      await client.query(
        `SELECT events.log_event($1, $2, $3, $4, $5, $6, $7::jsonb, $8) AS log_event`,
        [
          row.operating_company_id,
          "chat.confirmation_escalated",
          "system",
          subjectId,
          subjectType,
          subjectId,
          JSON.stringify({
            thread_id: row.thread_id,
            message_id: row.message_id,
            escalation_attempt: attemptNumber,
            max_attempts: CHAT_ESCALATION_CONFIG.maxAttempts,
            has_read_receipt: row.has_read_receipt,
          }),
          new Date().toISOString(),
        ],
      );
    });
  } catch (err) {
    console.warn("[chat-confirmation-escalation] events.log_event append failed (non-fatal)", err);
  }
}

/** One tick: select escalatable confirmations, re-fire, and advance the in-memory attempt ledger. */
export async function runChatConfirmationEscalationTick(now: Date = new Date()): Promise<number> {
  const rows = await loadPendingConfirmations();
  const seen = new Set<string>();

  const candidates: EscalationCandidate[] = rows.map((r) => {
    seen.add(r.message_id);
    const state = attemptLedger.get(r.message_id) ?? { attempts: 0, lastEscalatedAt: null };
    return {
      messageId: r.message_id,
      serverTs: new Date(r.server_ts),
      acked: false, // the SQL already excludes acked rows; kept explicit for the selector contract.
      hasReadReceipt: Boolean(r.has_read_receipt),
      attempts: state.attempts,
      lastEscalatedAt: state.lastEscalatedAt,
    };
  });

  // Prune ledger entries for confirmations that are no longer pending (acked or gone).
  for (const key of [...attemptLedger.keys()]) {
    if (!seen.has(key)) attemptLedger.delete(key);
  }

  const toEscalate = selectEscalations(candidates, now, CHAT_ESCALATION_CONFIG);
  const rowById = new Map(rows.map((r) => [r.message_id, r]));

  let fired = 0;
  for (const c of toEscalate) {
    const row = rowById.get(c.messageId);
    if (!row) continue;
    const attemptNumber = c.attempts + 1;
    await escalateOne(row, attemptNumber);
    attemptLedger.set(c.messageId, { attempts: attemptNumber, lastEscalatedAt: now });
    fired += 1;
  }
  return fired;
}

export function initializeChatConfirmationEscalationCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON === "false") {
    app.log.info("Chat confirmation escalation cron disabled via ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON=false");
    // GO-0017-L3: an early return is an outcome, not an absence — record it so
    // _system.background_jobs stays fresh (refreshed on every boot) instead of frozen forever.
    recordBackgroundJobDisabled(CRON_NAME).catch((err) => app.log.warn({ err }, `[background-job:${CRON_NAME}] failed to record disabled-outcome`));
    return;
  }

  cron.schedule(
    CHAT_ESCALATION_CONFIG.tickCron,
    async () => {
      await wrapBackgroundJobTick(
        "chat.confirmation_escalation",
        async () => {
          const fired = await runChatConfirmationEscalationTick();
          if (fired > 0) app.log.info({ fired }, "chat confirmation escalations re-fired");
        },
        app.log,
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" },
  );

  app.log.info("Chat confirmation escalation cron scheduled (every minute, America/Chicago)");
}
