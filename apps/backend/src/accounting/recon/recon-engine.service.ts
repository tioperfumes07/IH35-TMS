// RECON-01 — QBO↔TMS reconciliation engine (read-only; NEVER auto-fixes). Two passes per the locked spec
// (docs/specs/TMS-QBO-RECONCILIATION.md §2–§5) and Jorge's 2026-07-02 rules:
//   • AM bank-count pass (06:00 CT): per bank account/window, compare TMS vs QBO txn COUNT and summed cents
//     → COUNT_MISMATCH / SUM_MISMATCH.
//   • PM categorization-diff pass (19:00 CT): for each matched txn, compare the TMS COA mapping vs the QBO
//     account it landed in → CATEGORIZATION_DIVERGENCE. FLAG EVERY divergence — no dollar threshold.
// Match key = date + amount_cents + normalized reference; every unmatched TMS row = its own REFERENCE_INTEGRITY
// exception. The engine writes ONLY accounting.recon_runs / recon_exceptions and emits events.log_event on every
// state change. Maker≠checker is enforced on resolve. The QBO side is an injected source so the engine is
// testable now and the live-QBO wiring (Reports client) is finalized when Martin's close is stable + the flag ON.
import type { PoolClient } from "pg";

export type ReconRunType =
  | "am_bank_count"
  | "pm_categorization_diff"
  | "on_demand_bank_count"
  | "on_demand_categorization_diff"
  // AF-2 — DETECT-ONLY master-data anchor-drift passes (see ../../qbo-sync/master-data-anchor-drift.ts).
  // These record ANCHOR_DRIFT exceptions read from mdata.vendors/mdata.customers/catalogs.accounts vs
  // their QBO mirror; they never write to the source table (write-back stays OFF per the locked decision).
  | "master_data_drift_vendors"
  | "master_data_drift_customers"
  | "master_data_drift_accounts";

export type ExceptionClass =
  | "COUNT_MISMATCH"
  | "SUM_MISMATCH"
  | "CATEGORIZATION_DIVERGENCE"
  | "ANCHOR_DRIFT"
  | "MODIFIED_AFTER_VERIFIED"
  | "REFERENCE_INTEGRITY"
  | "CLOSED_PERIOD_TOUCH"
  | "TOLERANCE_ACCEPTED";

export type Severity = "low" | "medium" | "high" | "elevated";

// One reconcilable entry on either side, already normalized to integer cents.
export type ReconEntry = {
  txn_date: string; // YYYY-MM-DD
  amount_cents: number; // integer; sign per is_credit convention (caller normalizes both sides the same way)
  reference: string | null;
  account_ref: string; // TMS: coa_account id/code; QBO: the account the entry landed in
  source_ref: { kind: "bank_txn" | "bill" | "settlement" | "journal_entry" | "load"; id: string; display?: string };
};

export type PendingException = {
  exception_class: ExceptionClass;
  source_ref: ReconEntry["source_ref"] | Record<string, unknown>;
  qbo_ref: Record<string, unknown> | null;
  field: string;
  tms_value: string | null;
  qbo_value: string | null;
  severity: Severity;
};

const normRef = (r: string | null): string => (r ?? "").trim().toLowerCase().replace(/\s+/g, "");
const matchKey = (e: ReconEntry): string => `${e.txn_date}|${e.amount_cents}|${normRef(e.reference)}`;

/** AM bank-count: count + summed-cents mismatch per window. Pure — no DB. */
export function computeBankCountExceptions(tms: ReconEntry[], qbo: ReconEntry[]): PendingException[] {
  const out: PendingException[] = [];
  if (tms.length !== qbo.length) {
    out.push({
      exception_class: "COUNT_MISMATCH", source_ref: { kind: "bank_txn", id: "window", display: "window count" },
      qbo_ref: null, field: "count", tms_value: String(tms.length), qbo_value: String(qbo.length), severity: "medium",
    });
  }
  const tmsSum = tms.reduce((a, e) => a + e.amount_cents, 0);
  const qboSum = qbo.reduce((a, e) => a + e.amount_cents, 0);
  if (tmsSum !== qboSum) {
    out.push({
      exception_class: "SUM_MISMATCH", source_ref: { kind: "bank_txn", id: "window", display: "window sum" },
      qbo_ref: null, field: "sum_cents", tms_value: String(tmsSum), qbo_value: String(qboSum), severity: "medium",
    });
  }
  return out;
}

/** PM categorization-diff: per matched txn, TMS COA mapping ≠ QBO account → divergence. Unmatched TMS rows →
 *  REFERENCE_INTEGRITY. FLAG EVERY divergence (no dollar threshold — correctness test). Pure — no DB. */
export function computeCategorizationExceptions(tms: ReconEntry[], qbo: ReconEntry[]): PendingException[] {
  const out: PendingException[] = [];
  const qboByKey = new Map<string, ReconEntry>();
  for (const q of qbo) qboByKey.set(matchKey(q), q);

  for (const t of tms) {
    const q = qboByKey.get(matchKey(t));
    if (!q) {
      out.push({
        exception_class: "REFERENCE_INTEGRITY", source_ref: t.source_ref, qbo_ref: null, field: "reference",
        tms_value: t.reference ?? "", qbo_value: null, severity: "medium",
      });
      continue;
    }
    if (t.account_ref !== q.account_ref) {
      out.push({
        exception_class: "CATEGORIZATION_DIVERGENCE", source_ref: t.source_ref,
        qbo_ref: { account_ref: q.account_ref, reference: q.reference }, field: "account_mapping",
        tms_value: t.account_ref, qbo_value: q.account_ref, severity: "medium",
      });
    }
  }
  return out;
}

// The QBO side, injected. The real implementation (QBO Reports client) is wired when Martin's close is stable
// and TMS_QBO_RECON_ENABLED is ON; tests inject a fixture source. NEVER reads the sync queue (compares TMS to itself).
export type QboReconSource = {
  bankEntries(opco: string, windowStart: string, windowEnd: string): Promise<ReconEntry[]>;
};

// Exported (not just used internally) so AF-2's master-data-anchor-drift.ts can reuse the SAME audited
// recon_runs/recon_exceptions write path instead of standing up a parallel table.
export async function insertRun(client: PoolClient, opco: string, runType: ReconRunType, ws: string, we: string, preparer: string | null): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO accounting.recon_runs (operating_company_id, run_type, window_start, window_end, preparer, status)
     VALUES ($1::uuid,$2,$3::timestamptz,$4::timestamptz,$5,'running') RETURNING id`,
    [opco, runType, ws, we, preparer],
  );
  await logReconEvent(client, opco, "recon.run_started", preparer, res.rows[0].id, { run_type: runType });
  return res.rows[0].id;
}

export async function insertExceptions(client: PoolClient, opco: string, runId: string, ex: PendingException[]): Promise<void> {
  for (const e of ex) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO accounting.recon_exceptions
         (run_id, operating_company_id, exception_class, source_ref, qbo_ref, field, tms_value, qbo_value, severity, status)
       VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,'open') RETURNING id`,
      [runId, opco, e.exception_class, JSON.stringify(e.source_ref), e.qbo_ref ? JSON.stringify(e.qbo_ref) : null,
       e.field, e.tms_value, e.qbo_value, e.severity],
    );
    await logReconEvent(client, opco, "recon.exception_opened", null, res.rows[0].id, { exception_class: e.exception_class, field: e.field });
  }
}

export async function finalizeRun(client: PoolClient, opco: string, runId: string, totals: Record<string, unknown>): Promise<void> {
  await client.query(
    `UPDATE accounting.recon_runs SET status='complete', finished_at=now(), totals=$2::jsonb, updated_at=now()
     WHERE id=$1::uuid`,
    [runId, JSON.stringify(totals)],
  );
  await logReconEvent(client, opco, "recon.run_completed", null, runId, totals);
}

// events.log_event whitelists subject_type — 'recon' is not allowed, so recon events ride under 'alert'
// (a recon exception/run is an operational alert). actor 'system' for scheduled runs.
// event_log.actor_id is UUID NOT NULL — when no human actor is present (system/cron runs) we use the
// shared system-actor sentinel, which is the same sentinel used by journal-entry-qbo-push and
// factoring-posting crons (SYSTEM_ACTOR_USER_ID env, defaulting to 00000000-0000-4000-8000-000000000001).
const RECON_SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";
async function logReconEvent(client: PoolClient, opco: string, eventType: string, actorId: string | null, subjectId: string, payload: Record<string, unknown>): Promise<void> {
  const effectiveActorId = actorId ?? RECON_SYSTEM_ACTOR_ID;
  await client.query(
    `SELECT events.log_event($1::uuid,$2,$3,$4::uuid,'alert',$5::uuid,$6::jsonb)`,
    [opco, eventType, actorId ? "user" : "system", effectiveActorId, subjectId, JSON.stringify(payload)],
  );
}

/** AM bank-count pass. Build-and-hold; runs only when the flag is ON (checked by the caller/route/cron). */
export async function runBankCountPass(
  client: PoolClient, opco: string, windowStart: string, windowEnd: string, source: QboReconSource, preparer: string | null,
): Promise<{ run_id: string; exceptions: number }> {
  const runId = await insertRun(client, opco, preparer ? "on_demand_bank_count" : "am_bank_count", windowStart, windowEnd, preparer);
  const tms = await readTmsBankEntries(client, opco, windowStart, windowEnd);
  const qbo = await source.bankEntries(opco, windowStart, windowEnd);
  const ex = computeBankCountExceptions(tms, qbo);
  await insertExceptions(client, opco, runId, ex);
  await finalizeRun(client, opco, runId, { tms_count: tms.length, qbo_count: qbo.length, exceptions: ex.length });
  return { run_id: runId, exceptions: ex.length };
}

/** PM categorization-diff pass. */
export async function runCategorizationDiffPass(
  client: PoolClient, opco: string, windowStart: string, windowEnd: string, source: QboReconSource, preparer: string | null,
): Promise<{ run_id: string; exceptions: number }> {
  const runId = await insertRun(client, opco, preparer ? "on_demand_categorization_diff" : "pm_categorization_diff", windowStart, windowEnd, preparer);
  const tms = await readTmsBankEntries(client, opco, windowStart, windowEnd);
  const qbo = await source.bankEntries(opco, windowStart, windowEnd);
  const ex = computeCategorizationExceptions(tms, qbo);
  await insertExceptions(client, opco, runId, ex);
  await finalizeRun(client, opco, runId, { tms_count: tms.length, qbo_count: qbo.length, exceptions: ex.length });
  return { run_id: runId, exceptions: ex.length };
}

/** TMS side — bank transactions with their COA mapping in the window. */
async function readTmsBankEntries(client: PoolClient, opco: string, ws: string, we: string): Promise<ReconEntry[]> {
  // ACCT-F5605 (2026-08-20) — resolves LV-BANK-TWO-SIGN-CONVENTIONS, live-verified both sides before
  // fixing per the 2026-08-16 comment's own instruction ("do not fix without live-verifying both sides").
  //
  // QBO SIDE (recon-cron.service.ts's buildReconEntriesFromQboRegister, the real wired source — NOT a
  // stub; TMS_QBO_RECON_ENABLED default OFF, no override row for any entity as of this fix, so this
  // comparison has never yet run against real QBO data and there is zero current live behavior to
  // regress): Deposit +, Purchase -magnitude (Credit=true flips to +), Transfer from -/to +, BillPayment
  // -, Payment (direct-to-bank) +, JournalEntry debit-to-bank + / credit-to-bank - . Genuinely, deliberately
  // "money-in positive, money-out negative" -- confirmed by reading the function, not inferred.
  //
  // TMS SIDE, OLD (broken): `CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END` trusted the
  // STORED sign for credits. Live-measured: is_credit=true rows are stored negative in 2,687 of 2,795
  // cases (positive only for the 108-row Relay Fuel Wallet cohort), so the old expression returned
  // NEGATIVE for 96% of credits -- the exact opposite of the QBO side's "credit positive." Because
  // matchKey() embeds this signed amount_cents directly, and computeBankCountExceptions sums it, this
  // was not cosmetic: it would have produced a false SUM_MISMATCH/false REFERENCE_INTEGRITY on every
  // credit-bearing window the moment the flag was ever turned on for a connected entity.
  //
  // FIX: trust is_credit as the SOLE direction authority (the law already stated in
  // posting-engine.service.ts and bank-feed-gl-posting.service.ts's own "DIRECTION IS DRIVEN ONLY BY
  // is_credit, NEVER by the sign of amount_cents") and reconstruct via ABS(), not the raw stored sign.
  // This is convention-agnostic by construction: a credit stored negative (the 2,687) or positive (the
  // 108 Relay rows) both normalize to the SAME correct positive output, so the Relay exception needs no
  // separate per-row/per-feed convention tracking -- ABS(amount_cents) is identical either way.
  const res = await client.query<{ id: string; posted_date: string; amount_cents: string; reference: string | null; coa_account_id: string | null }>(
    `SELECT id::text, posted_date::text,
            (CASE WHEN is_credit THEN ABS(amount_cents) ELSE -ABS(amount_cents) END)::text AS amount_cents,
            COALESCE(description, merchant_name) AS reference,
            coa_account_id::text
       FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid AND posted_date >= $2::date AND posted_date <= $3::date`,
    [opco, ws, we],
  );
  return res.rows.map((r) => ({
    txn_date: r.posted_date,
    amount_cents: Number(r.amount_cents ?? 0),
    reference: r.reference,
    account_ref: r.coa_account_id ?? "unmapped",
    source_ref: { kind: "bank_txn", id: r.id },
  }));
}

/** Resolve an exception — maker≠checker: the resolver must differ from the run's preparer, the scheduled-job
 *  (system) identity can NEVER resolve, and a resolution note is required. Read-only module: resolving only
 *  updates the exception's status; it NEVER touches the ledger. */
export class ReconResolveError extends Error {
  constructor(public readonly code: "maker_is_checker" | "system_cannot_resolve" | "note_required" | "not_found", message: string) {
    super(message);
    this.name = "ReconResolveError";
  }
}

export function assertResolvable(runPreparer: string | null, resolvedBy: string | null, note: string | null): void {
  if (!resolvedBy) throw new ReconResolveError("system_cannot_resolve", "a named user must resolve (system identity cannot)");
  if (runPreparer && resolvedBy === runPreparer) throw new ReconResolveError("maker_is_checker", "resolver must differ from the run preparer (maker≠checker)");
  if (!note || !note.trim()) throw new ReconResolveError("note_required", "a resolution note is required");
}

export async function resolveException(client: PoolClient, opco: string, exceptionId: string, resolvedBy: string | null, note: string | null): Promise<void> {
  const runRes = await client.query<{ preparer: string | null }>(
    `SELECT r.preparer::text FROM accounting.recon_exceptions e JOIN accounting.recon_runs r ON r.id = e.run_id
      WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid`,
    [exceptionId, opco],
  );
  if (!runRes.rows[0]) throw new ReconResolveError("not_found", "exception not found");
  assertResolvable(runRes.rows[0].preparer, resolvedBy, note);
  await client.query(
    `UPDATE accounting.recon_exceptions SET status='resolved', resolved_by=$3::uuid, resolution_note=$4, resolved_at=now(), updated_at=now()
      WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
    [exceptionId, opco, resolvedBy, note],
  );
  await logReconEvent(client, opco, "recon.exception_resolved", resolvedBy, exceptionId, { note });
}
