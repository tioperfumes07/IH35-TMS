/**
 * ENGINE: chat confirmation escalation
 * SCHEDULE: every minute (escalation-config)
 * WRITES: events.event_log (one escalation event per attempt), driver web push
 * IDEMPOTENCY: ADVISORY LOCK per message; attempts counted in events.event_log (the DB is the ledger); the event is written before the push
 * OVERLAP: the twin re-reads the attempt the first wrote and sends nothing
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
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
} from "../chat/escalation-config.js";

const CRON_NAME = "chat.confirmation_escalation";

let initialized = false;

// ROUND 330.7: the attempt ledger is the DATABASE — the chat.confirmation_escalated rows in events.event_log, read and
// written under a per-message transaction advisory lock. The in-memory Map it replaces lived once per process, so on a
// two-instance service every attempt fired twice (2 x maxAttempts pushes) and wrote two spine events.
/** Kept for test compatibility; there is no in-memory state any more. */
export function __resetEscalationLedgerForTests(): void {}

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

/**
 * Claim attempt N for one confirmation, in ONE transaction under a per-message advisory lock: re-read the attempts already
 * recorded in events.event_log, re-run the selector on them, and write attempt N's spine event as the claim. Returns
 * the attempt number when this caller won the claim, null when the confirmation is not due (or a twin claimed it).
 */
async function claimEscalation(row: PendingRow, now: Date): Promise<number | null> {
  if (!row.driver_id) return null;
  assertTenantContext(row.operating_company_id, CRON_NAME);
  const subjectType: "load" | "driver" = row.load_id ? "load" : "driver";
  const subjectId = row.load_id ?? row.driver_id;
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [row.operating_company_id]);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`chat.confirmation_escalation:${row.message_id}`]);
    const prior = await client.query<{ attempts: string; last_at: string | null }>(
      `SELECT count(*)::text AS attempts, max(occurred_at)::text AS last_at
         FROM events.event_log
        WHERE operating_company_id = $1::uuid AND event_type = 'chat.confirmation_escalated' AND payload->>'message_id' = $2`,
      [row.operating_company_id, row.message_id],
    );
    const attempts = Number(prior.rows[0]?.attempts ?? 0);
    const lastAt = prior.rows[0]?.last_at ? new Date(prior.rows[0].last_at) : null;
    const due = selectEscalations(
      [{ messageId: row.message_id, serverTs: new Date(row.server_ts), acked: false, hasReadReceipt: Boolean(row.has_read_receipt), attempts, lastEscalatedAt: lastAt }],
      now,
      CHAT_ESCALATION_CONFIG,
    );
    if (due.length === 0) return null;
    const attemptNumber = attempts + 1;
    await client.query(
      // Typed + explicit source: the untyped 8-argument call resolved with source = NULL and failed NOT NULL — the old
      // code swallowed that, so no escalation spine event was ever written (prod: 0 rows, ever).
      `SELECT events.log_event($1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::uuid, $7::jsonb, $8::timestamptz, 'chat_confirmation_escalation') AS log_event`,
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
        now.toISOString(),
      ],
    );
    return attemptNumber;
  });
}

/** Re-fire the driver web push for one claimed escalation attempt (after the claim committed). */
async function pushEscalation(row: PendingRow, attemptNumber: number): Promise<void> {
  if (!row.driver_id) return;
  const label = row.load_ref_cache ? String(row.load_ref_cache) : String(row.load_id ?? "").slice(0, 8);
  await dispatchDriverWebPush({
    operatingCompanyId: row.operating_company_id,
    driverId: row.driver_id,
    title: "Confirmation still needed",
    body: label
      ? `Load ${label}: a dispatch confirmation is still waiting on you.`
      : "A dispatch confirmation is still waiting on you.",
    tag: `chat-confirm-${row.thread_id}`,
    data: {
      kind: "chat_confirmation",
      thread_id: row.thread_id,
      message_id: row.message_id,
      load_id: String(row.load_id ?? ""),
      escalation_attempt: String(attemptNumber),
    },
  });
}

/** One tick: every pending confirmation is claimed (or not) in the database, then the winners are pushed. */
export async function runChatConfirmationEscalationTick(now: Date = new Date()): Promise<number> {
  const rows = await loadPendingConfirmations();
  let fired = 0;
  for (const row of rows) {
    const attemptNumber = await claimEscalation(row, now);
    if (attemptNumber == null) continue;
    await pushEscalation(row, attemptNumber);
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
