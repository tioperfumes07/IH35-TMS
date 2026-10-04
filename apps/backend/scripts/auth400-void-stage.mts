#!/usr/bin/env node
/**
 * AUTH-400 CLEAN SLATE — STAGE 1: VOID EVERY LIVE DOCUMENT THROUGH THE ONE CANONICAL DISPATCHER (CC-1, 2026-10-04).
 *
 * Owner law (AUTH-400): "reverse -> void -> purge. No raw DELETE on a document that still has postings." The purge
 * engine (scripts/ops/2026-10-02-cc1-r326-complete-delete.ts) refuses any document with LIVE posting lines (ROUND 390 a);
 * this stage removes that condition the only legitimate way: every live document is voided WHOLE
 * through executeVoidCancel (apps/backend/src/governance/void-cancel-executors.ts) — the WHOLE-void door the app's own
 * void approvals use: it reverses the GL AND stamps the document header voided in one transaction. (The first production
 * run used voidDocument, the GL-only dispatcher: every document's ledger was reversed but its header never stamped —
 * verify-void-is-whole flagged 1,215 silent voids until the purge removed them.)
 * No GL math here, no UPDATE on a posting, no hand-written JE.
 *
 * ORDER — an unwind runs NEWEST FIRST (last in, first out), because later entries depend on earlier ones (rehearsal
 * 2026-10-04: reversing an escrow deposit before its release was refused — the escrow would go negative):
 *   0. every applied reclassify batch, through the reclassify engine's own undo (undoReclassifyBatch), newest first —
 *      a reclass entry is never voided as a journal entry (its out-leg is a reversal, terminal);
 *   1. documents, dependents first: customer payments -> driver settlements -> bills -> invoices -> expenses, each type
 *      newest first; the executor reverses every LIVE line naming the document and stamps its header;
 *   2. every journal entry still carrying a live line (load revrec, escrow, manual, advance, reconciliation, the legacy
 *      pay-run close entries), newest first, repeated while it makes progress.
 * Each void is its OWN transaction. A refusal is recorded as a FINDING (type, id, error) and the run continues; nothing is
 * worked around. The stage ends by measuring live lines; the purge runs only when that is 0.
 *
 * SAFETY:
 *   --branch=<neon branch id> REQUIRED: refuses unless current_setting('neon.branch_id') equals it (no accidental target).
 *   DRY by default: lists what it would void, per type, and writes nothing. --apply writes.
 *   --apply on the production branch additionally needs OWNER_AUTH_ID=AUTH-400.
 *   The JE / factoring engines open their own pool from DATABASE_URL — set it in this process's environment only.
 *
 * RUN:  DATABASE_URL=<branch> npx tsx scripts/auth400-void-stage.mts --branch=br-xxx            # dry
 *       DATABASE_URL=<branch> npx tsx scripts/auth400-void-stage.mts --branch=br-xxx --apply    # rehearsal branch
 */
import fs from "node:fs";
import pg from "pg";
import { executeVoidCancel } from "../src/governance/void-cancel-executors.js";
import { undoReclassifyBatch } from "../src/accounting/reclassify/reclassify.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PROD_BRANCH = "br-fancy-credit-akjnd07a";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // identity.users role Owner (verified 2026-10-04)
const APPLY = process.argv.includes("--apply");
const BRANCH = (process.argv.find((a) => a.startsWith("--branch=")) ?? "").slice("--branch=".length);
const REPORT = (process.argv.find((a) => a.startsWith("--report=")) ?? "").slice("--report=".length);
const AUTH = (process.env.OWNER_AUTH_ID ?? "").trim();
const REASON = "AUTH-400 clean slate (owner law 2026-10-04): void before purge";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL (the target branch) is required");
if (!BRANCH) throw new Error("--branch=<neon branch id> is required");

/** Documents whose source carries a live line, per executeVoidCancel entity type, in dependency order. */
const DOC_STEPS: Array<{ type: string; stt: string[]; table: string }> = [
  { type: "payment", stt: ["customer_payment", "payment"], table: "accounting.payments" },
  { type: "driver_settlement", stt: ["driver_settlement"], table: "driver_finance.driver_settlements" },
  { type: "bill", stt: ["bill"], table: "accounting.bills" },
  { type: "invoice", stt: ["invoice"], table: "accounting.invoices" },
  { type: "expense", stt: ["expense"], table: "accounting.expenses" },
  { type: "fuel_transaction", stt: ["fuel_event"], table: "fuel.fuel_transactions" },
];
const whole = (type: string, id: string) =>
  executeVoidCancel(type, { client: client as never, operatingCompanyId: USMCA, entityId: id, action: "void", userId: OWNER, reason: REASON }).then((r) => {
    if ((r as { kind?: string }).kind === "unsupported_entity") throw new Error(`executeVoidCancel: '${type}' is not supported`);
    return r;
  });
const LIVE = `p.operating_company_id = $1::uuid AND p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL`;

const client = new pg.Client({ connectionString: url });
await client.connect();
const findings: Array<{ type: string; id: string; error: string }> = [];
const done: Record<string, number> = {};

async function liveCount() {
  const r = await client.query<{ lines: number; jes: number }>(
    `SELECT count(*)::int AS lines, count(DISTINCT p.journal_entry_uuid)::int AS jes FROM accounting.journal_entry_postings p WHERE ${LIVE}`, [USMCA]);
  return r.rows[0]!;
}

async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true), set_config('app.operating_company_id', $1, true)", [USMCA]);
    const out = await fn();
    if (APPLY) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

try {
  const branch = (await client.query<{ b: string | null }>(`SELECT current_setting('neon.branch_id', true) AS b`)).rows[0]?.b ?? null;
  if (branch !== BRANCH) throw new Error(`refused: connected to neon branch ${branch ?? "(unknown)"}, --branch says ${BRANCH}`);
  if (APPLY && branch === PROD_BRANCH && AUTH !== "AUTH-400") throw new Error("refused: --apply on production needs OWNER_AUTH_ID=AUTH-400");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
  const before = await liveCount();
  console.log(`MODE ${APPLY ? "APPLY" : "DRY"} on ${branch} | live before: ${before.lines} lines in ${before.jes} entries`);

  done.reclassify_undo = 0;
  const batches = (await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.reclassify_batches WHERE operating_company_id = $1::uuid AND status = 'applied' ORDER BY created_at DESC`, [USMCA])).rows.map((r) => r.id);
  console.log(`  ${"reclassify_undo".padEnd(18)} ${batches.length} applied batch(es)`);
  if (APPLY) {
    for (const id of batches) {
      try {
        await undoReclassifyBatch({ operating_company_id: USMCA, batch_id: id, reason: REASON }, { userId: OWNER, role: "Owner" });
        done.reclassify_undo += 1;
      } catch (e) {
        findings.push({ type: "reclassify_undo", id, error: String((e as Error).message ?? e).slice(0, 400) });
      }
    }
  }

  for (const step of DOC_STEPS) {
    const ids = (await client.query<{ id: string }>(
      `SELECT p.source_transaction_id AS id FROM accounting.journal_entry_postings p
         JOIN ${step.table} d ON d.id::text = p.source_transaction_id
        WHERE ${LIVE} AND p.source_transaction_type = ANY($2::text[])
        GROUP BY p.source_transaction_id, d.created_at ORDER BY d.created_at DESC`, [USMCA, step.stt])).rows.map((r) => r.id);
    console.log(`  ${step.type.padEnd(18)} ${ids.length} live document(s)`);
    done[step.type] = 0;
    if (!APPLY) continue;
    for (const id of ids) {
      try {
        await inTx(() => whole(step.type, id));
        done[step.type] += 1;
      } catch (e) {
        findings.push({ type: step.type, id, error: String((e as Error).message ?? e).slice(0, 400) });
      }
    }
  }

  // Every entry still carrying a live line — load revrec, escrow, manual, advance, reconciliation, any document type the
  // dispatcher has no case for — through the journal-entry void (F397-safe: it refuses a reversal of a reversal).
  const liveJes = async () => (await client.query<{ id: string }>(
    `SELECT p.journal_entry_uuid::text AS id FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE ${LIVE} AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
      GROUP BY p.journal_entry_uuid, je.created_at ORDER BY je.created_at DESC`, [USMCA])).rows.map((r) => r.id);
  let jes = await liveJes();
  console.log(`  ${"journal_entry".padEnd(18)} ${jes.length} live entr(ies) after the document steps${APPLY ? "" : " (dry: before them)"}`);
  done.journal_entry = 0;
  if (APPLY) {
    // Newest first, repeated while a pass makes progress: an entry refused only because a later one still stands
    // (escrow deposit before its release) goes through on the next pass. What still refuses after a pass with no
    // progress is a FINDING.
    for (let pass = 1; pass <= 5 && jes.length; pass++) {
      const failed: typeof findings = [];
      for (const id of jes) {
        try {
          await inTx(() => whole("journal_entry", id));
          done.journal_entry += 1;
        } catch (e) {
          failed.push({ type: "journal_entry", id, error: String((e as Error).message ?? e).slice(0, 400) });
        }
      }
      const next = await liveJes();
      if (next.length >= jes.length || !failed.length) { findings.push(...failed); break; }
      jes = next;
    }
  }

  const after = await liveCount();
  const byError = new Map<string, number>();
  for (const f of findings) byError.set(`${f.type}: ${f.error.split("\n")[0]}`, (byError.get(`${f.type}: ${f.error.split("\n")[0]}`) ?? 0) + 1);
  console.log(`VOIDED ${JSON.stringify(done)}`);
  console.log(`FINDINGS ${findings.length} (grouped):`);
  for (const [k, n] of [...byError].sort((a, b) => b[1] - a[1])) console.log(`  ${n} x ${k}`);
  console.log(`live after: ${after.lines} lines in ${after.jes} entries ${after.lines === 0 ? "— READY FOR THE PURGE" : "— NOT READY (purge refuses)"}`);
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ branch, apply: APPLY, before, after, done, findings }, null, 2));
  if (APPLY && after.lines !== 0) process.exitCode = 1;
} finally {
  await client.end();
}
