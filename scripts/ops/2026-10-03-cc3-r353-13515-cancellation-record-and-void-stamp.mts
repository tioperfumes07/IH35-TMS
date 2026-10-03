// ROUND 353 — load 13515 (USMCA). AUTH-201 (Cursor, 2026-10-01T20:31:38Z) retired 13515 as a duplicate billing of 13513:
// it voided the invoice and REVERSED both revrec entries through linked reversals (2c730468 -> 814a8991,
// 396efaa2 -> 567d4350; every original line carries reversed_by_line_id, every reversal line reversal_of_line_id;
// 1100 / 1150 / 4000 each net 0). But its script set mdata.loads.status = 'cancelled' with a bare UPDATE
// (scripts/ops/2026-10-01-cursor-auth201-retire-13515-keep-13513.ts line 248) instead of the cancellation engine, so:
//   - dispatch.load_cancellations has NO row for the load (no reason, no maker), and
//   - the load header was never stamped voided -> verify-void-is-whole "1-silent-void".
// This script finishes what the engine would have written. ONE transaction:
//   0. ASSERT the ledger is already whole (both originals reversed, every account nets 0) — the Lead's step 1
//      ("reverse the 2 postings") is ALREADY DONE; reversing again would double-reverse revenue. Refuse otherwise.
//   1. INSERT the missing dispatch.load_cancellations row — reason OTHER (the catalogue has no duplicate-billing code),
//      notes naming AUTH-201, approved, at the moment AUTH-201 cancelled it, by the owner who recorded every other
//      cancellation.
//   2. stampDocumentVoided(family 'load') — the governed executor (voided_at, void_reason, voided_by_user_id, renumber).
// NOT touched: driver bill 33d5debc (PAID — the trip was driven; only the customer billing was the duplicate; AUTH-201
// kept trip costs), 13513, any JE, any posting, any other load.
// Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { stampDocumentVoided } from "../../apps/backend/src/accounting/void-document-stamp.service.js";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const LOAD = "44eae7f5-70ff-4366-92cf-173d1e9bd11c";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // primary owner; recorded all 16 existing cancellations
const JES = ["2c730468-f884-48a4-8820-7814eb68841c", "396efaa2-b200-4b7f-b74b-bd0a0bbe7401", "814a8991-98d0-422a-954b-26d17a314c38", "567d4350-4ef8-4b52-861a-3391b21d66e1"];
const NOTES = "AUTH-201 (owner/Lead 2026-10-01): 13515 duplicate billing of 13513 — kept 13513, payment moved, invoice 13515 voided, revenue reversed. Record written by ROUND 353; the AUTH-201 script bypassed the cancellation engine.";
const VOID_REASON = "AUTH-201 duplicate billing of 13513 — invoice voided, revenue reversed (ROUND 353 completes the void)";

// Explicit, in this file: --apply refuses unless the AUTH is OPEN on main (the harness checks it again).
if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("r353_13515_cancellation_record_and_void_stamp", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const [load] = await q(`SELECT load_number, status::text, voided_at, canceled_at, operating_company_id::text co FROM mdata.loads WHERE id = $1::uuid FOR UPDATE`, [LOAD]);
  if (!load || load.co !== USMCA) throw new Error("load 13515 not found in USMCA");
  if (load.load_number !== "13515" || load.status !== "cancelled" || load.voided_at) throw new Error(`precondition: ${JSON.stringify(load)}`);

  // 0. the ledger must already be whole
  const jes = await q(`SELECT id::text, reversed_by_je_id::text rb, reverses_je_id::text rv, status FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`, [JES]);
  const originalsReversed = jes.filter((j: any) => !j.rv && j.rb).length;
  const net = await q(`SELECT a.account_number acct, sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint net
                         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
                        WHERE p.journal_entry_uuid = ANY($1::uuid[]) GROUP BY 1 ORDER BY 1`, [JES]);
  const unlinked = Number((await q(`SELECT count(*) n FROM accounting.journal_entry_postings p
                                     WHERE p.journal_entry_uuid = ANY($1::uuid[]) AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL`, [JES]))[0].n);
  if (jes.length !== 4 || originalsReversed !== 2 || unlinked !== 0 || net.some((r: any) => Number(r.net) !== 0))
    throw new Error(`REFUSE: ledger not whole — ${JSON.stringify({ jes, net, unlinked })}`);
  const otherLive = Number((await q(`SELECT count(*) n FROM accounting.transaction_source_links l JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
                                      JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                                     WHERE l.linked_object_id::text = $1 AND NOT (j.id = ANY($2::uuid[]))`, [LOAD, JES]))[0].n);
  if (otherLive !== 0) throw new Error(`REFUSE: ${otherLive} other ledger links on the load`);

  // 1. the missing cancellation record
  if (Number((await q(`SELECT count(*) n FROM dispatch.load_cancellations WHERE load_id = $1::uuid`, [LOAD]))[0].n) !== 0) throw new Error("cancellation row already exists");
  const [reason] = await q(`SELECT id::text FROM catalogs.load_cancellation_reasons WHERE operating_company_id = $1::uuid AND reason_code = 'OTHER' AND is_active ORDER BY sort_order, id LIMIT 1`, [USMCA]);
  if (!reason) throw new Error("USMCA reason OTHER not found");
  const [lc] = await q(
    `INSERT INTO dispatch.load_cancellations (operating_company_id, load_id, reason_code, reason_code_id, cancellation_notes, billable_to_customer,
                                             status, cancelled_by_user_id, cancelled_at, approved_by_user_id, approved_at)
     VALUES ($1::uuid, $2::uuid, 'OTHER', $3::uuid, $4, false, 'approved', $5::uuid, $6, $5::uuid, $6)
     RETURNING id::text`, [USMCA, LOAD, reason.id, NOTES, OWNER, load.canceled_at]);
  await appendCrudAudit(c, OWNER, "dispatch.load_cancellation.recorded", {
    resource_type: "dispatch.load_cancellations", resource_id: lc.id, load_id: LOAD, load_number: "13515", operating_company_id: USMCA,
    reason_code: "OTHER", via: "ROUND 353 / AUTH-201 completion",
  }, "warning", "R353-13515");

  // 2. the void stamp, through the governed executor
  const stamp = await stampDocumentVoided(c, { operatingCompanyId: USMCA, family: "load", documentId: LOAD, voidReason: VOID_REASON, voidedByUserId: OWNER });

  const [after] = await q(`SELECT load_number, status::text, voided_at IS NOT NULL voided, void_reason IS NOT NULL has_reason, voided_by_user_id::text by, cancel_reason_code FROM mdata.loads WHERE id = $1::uuid`, [LOAD]);
  const [bill] = await q(`SELECT status, voided_at FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [LOAD]);
  return { cancellation_id: lc.id, reason_id: reason.id, ledger_net: net, originals_reversed: originalsReversed, stamp, after, driver_bill_untouched: bill };
});
