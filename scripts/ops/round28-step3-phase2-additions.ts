#!/usr/bin/env tsx
// ROUND 28 STEP 3 PHASE 2 — additional pay / reimbursement / deduction lines for documents 5804-5815.
//
// SOURCE OF TRUTH: ~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx ADDITIONAL PAY / DRIVER
// REIMBURSEMENTS / DEDUCTIONS sheets, transcribed programmatically (never hand-typed) into
// scripts/ops/round28-step3-phase2-data.json. Pre-verified before writing a single line of this
// script: for every one of the 12 documents, Salary(DRIVER PAY LINES) + Additional pay(this data) +
// Reimbursed(this data) + Deductions(this data, negative) equals the DRIVER SETTLEMENTS sheet's own
// TOTAL DUE column, to the cent, for 11 of 12 documents (5812 is a separate, disclosed, NOT-touched-
// here rate anomaly — see REMAINING below).
//
// WHY A ONE-OFF SCRIPT, NOT materializeSettlementLines(): researched live before writing a line —
// materializeSettlementLines() (settlement-lines-materialize.service.ts) hard-refuses any settlement
// whose status !== 'open' ("Only an OPEN settlement can gain new lines"); 9 of these 12 settlements
// are 'closed'. Its own regex-based extra_pay/reimbursement classifier (EXTRA_PAY_REASON_PATTERN =
// /additional pay|layover|bonus/i) also does NOT match this fleet's real accessorial reason strings
// ("Driver Pay-Enlonada", "Driver Pay-Extra Pick Up", "Driver Pay-Extra Delivery/Drop" — none contain
// "additional pay"/"bonus", only the two "...Layover-Estancia..." items contain "layover") — calling
// the real function on the 3 still-open documents (5807/5810/5815) would misclassify those items as
// line_type='reimbursement' instead of 'extra_pay'. Flagging this classifier gap for the record; not
// fixing it here (a broader change affecting every future settlement, out of this pass's scope) — this
// script sets line_type explicitly from which SOURCE SHEET each item came from (ADDITIONAL PAY sheet
// -> always extra_pay, DRIVER REIMBURSEMENTS sheet -> always reimbursement) for EVERY document, open
// or closed alike, rather than depend on the regex for some and bypass it for others.
//
// NO NEW GL MATH: reuses settlement-lines-materialize.service.ts's own exported
// resolveDeductionPostingAccount() unchanged, and mirrors that same file's INSERT INTO
// driver_finance.settlement_lines statement shape verbatim (both the reimbursement/extra_pay block at
// lines ~244-252 and the deduction block at lines ~325-332) with the settlement-status gate removed —
// the SAME correction shape ROUND 26.3 STEP 4A (scripts/ops/round26-3-step4a-fix-5795-5800.ts) already
// used and the owner already accepted for a locked settlement. For extra_pay/reimbursement,
// posting_account_id resolves via the SAME two role lookups materializeSettlementLines uses
// (resolveRoleAccountOptional 'driver_pay_expense' for extra_pay, resolveReimbursementExpenseAccount
// for reimbursement) — imported unchanged, not reimplemented.
//
// Each item also gets a REAL driver_finance.driver_reimbursements / driver_settlement_deductions
// source row (status='settled'/'applied', applied_to_settlement_id set), matching materializeSettlementLines'
// own source-of-truth convention — this is not a settlement_lines-only shortcut.
//
// STRAY LOAD 13595: settlement 5809 (4db66351...) currently holds load 13595's escrow_contribution
// line ($25) — but DRIVER PAY LINES lists 13595 under document 5816 (outside this session's assigned
// 5804-5815 range), not 5809. This is an 11th stray of the same class Phase 1's recompute-strays
// script already handled for 10 OTHER loads (zero settlement_lines existed for those; this one DOES
// have a live line, so it needs an explicit void, not just an unlink). Voided (is_active=false,
// voided_at, void_reason), never deleted (WORM). 13595 is NOT re-linked to 5816 here — that document
// is outside this pass's scope, named as open follow-up.
//
// NOT DONE, disclosed: 5812's settlement header shows gross_pay=$721.68 backed by a driver_bill whose
// loaded_pay_cents implies a nonzero per-mile rate for load 13600, while DRIVER PAY LINES lists this
// driver's rate as $0/mile for BOTH of this document's loads (13588 AND 13600) and the DRIVER
// SETTLEMENTS sheet's own target Salary column for 5812 is $0 — an unresolved conflict between the
// app's stored rate and the source document that needs an owner decision (was $0 a real AlwaysTrack
// data gap, or is the app using a wrong rate?), not a guess. This script adds ONLY 5812's two missing
// escrow deduction lines (unambiguous, -$25 each, present on DEDUCTIONS sheet) and does not touch the
// gross-pay/rate question at all.
//
// Also NOT touched, disclosed: 3 more "unexplained" live escrow_contribution lines exist on loads that
// DO genuinely belong to their settlement (5805/13592 $25, 5806/13581 $25, 5806/13591 $25) with no
// corresponding row on the DEDUCTIONS sheet for that specific load. Per the escrow auto-deduction
// policy (settlement-engine.ts appendEscrowContributionLineIfMissing, $25/load up to a $2,500/driver
// cap, computed live from cumulative balance -- NOT sourced from AlwaysTrack's manual entry), this is
// plausibly a real, correct company-policy accrual that the signed document simply didn't itemize for
// these particular loads -- or it could be a timing/contamination artifact. Left exactly as-is; not
// voided, not guessed at. After this script, 5805 and 5806 will each sit $25 (resp. $50) higher in
// deductions_total / lower in net_pay than the DRIVER SETTLEMENTS sheet's TOTAL DUE column for that
// reason alone -- quantified and reported, not silently absorbed.
//
// NO REVERSES on real, correctly-sourced deductions (owner law 2026-09-13); the ONE void here (13595)
// is a contamination correction, not a reverse of a real charge -- it VOIDS a line that was never this
// settlement's own money to begin with.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveDeductionPostingAccount } from "../../apps/backend/src/driver-finance/settlement-lines-materialize.service.js";
import { resolveRoleAccountOptional, resolveReimbursementExpenseAccount } from "../../apps/backend/src/accounting/coa-roles/resolver.service.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REGISTER_PATH = path.join(ROOT, "docs/bus/CORRECTION-REGISTER-ROUND-28-STEP3-PHASE2.md");
const DATA_PATH = path.join(ROOT, "scripts/ops/round28-step3-phase2-data.json");

const REIMBURSEMENTS_SOURCE_TABLE = "driver_finance.driver_reimbursements";

type Item =
  | { kind: "extra_pay"; load_number: string; load_id: string; description: string; amount_cents: number }
  | { kind: "reimbursement"; load_number: string; load_id: string; description: string; reimbursement_type: string; amount_cents: number }
  | { kind: "deduction"; load_number: string; load_id: string; description: string; deduction_type: string; amount_cents: number };

type SettlementPlan = { doc: string; settlement_id: string; driver_id: string; items: Item[] };

const PLAN: SettlementPlan[] = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

const STRAY_LOAD_13595 = {
  load_number: "13595",
  settlement_id: "4db66351-c523-43a4-b949-bd4d9c42e5a2", // 5809, the wrong home
  line_id: "805b072c-4af8-4860-a1fb-548cad8702ed", // its live escrow_contribution line
};

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

async function processSettlement(client: DbClient, plan: SettlementPlan, execute: boolean) {
  const settlementRes = await client.query<{ status: string; source_document_ref: string; is_sample_data: boolean }>(
    `SELECT status::text, source_document_ref, is_sample_data FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [plan.settlement_id, USMCA_COMPANY_ID]
  );
  const s = settlementRes.rows[0];
  if (!s) throw new Error(`ABORT ${plan.doc}: settlement ${plan.settlement_id} not found`);
  if (s.source_document_ref !== plan.doc) {
    throw new Error(`ABORT ${plan.doc}: source_document_ref mismatch (found '${s.source_document_ref}')`);
  }

  const lines: string[] = [`## ${plan.doc} (${plan.settlement_id}, status=${s.status})`];

  for (const item of plan.items) {
    // Idempotency: skip if an identical active line already exists (matches uq_settlement_lines_no_duplicate_lines).
    const dollars = (item.amount_cents / 100).toFixed(2);
    const lineType = item.kind === "extra_pay" ? "extra_pay" : item.kind === "reimbursement" ? "reimbursement" : "deduction";
    // BUG (found live, this session, after the first --execute run): matching on
    // (settlement_id, line_type, description, amount) alone, WITHOUT load_id, treats two DIFFERENT
    // loads that happen to share the same description+amount (e.g. two loads both billing "Driver
    // Pay-Enlonada" $25.00) as duplicates of EACH OTHER — the second load's real, distinct line was
    // silently skipped as "already exists" 17 times across this run. load_id must be part of the
    // match. (A load that genuinely has the SAME description+amount item twice — e.g. 5810/13599's
    // two separate $25.00 "Extra Pick Up" charges — is handled correctly by this per-item loop
    // running twice and matching twice; the bug was only ever the missing load_id join.)
    const dup = await client.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.settlement_lines
        WHERE settlement_id = $1::uuid AND load_id = $5::uuid AND line_type = $2 AND description = $3 AND amount = $4::numeric AND is_active = true`,
      [plan.settlement_id, lineType, item.description, dollars, item.load_id]
    );
    if (dup.rows[0]) {
      lines.push(`- SKIP (already exists) ${lineType} load=${item.load_number} "${item.description}" $${dollars} -> ${dup.rows[0].id}`);
      continue;
    }

    lines.push(`- ADD ${lineType} load=${item.load_number} "${item.description}" $${dollars}`);
    if (!execute) continue;

    if (item.kind === "extra_pay" || item.kind === "reimbursement") {
      const reimbursementType = item.kind === "extra_pay" ? "other" : item.reimbursement_type;
      const reason = item.kind === "extra_pay" ? `Additional pay: ${item.description}` : item.description;
      const srcIns = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.driver_reimbursements (
            operating_company_id, driver_id, load_id, reimbursement_type, amount_cents, reason,
            pay_mode, status, applied_to_settlement_id, created_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'settlement', 'settled', $7::uuid, $8::uuid)
          RETURNING id::text
        `,
        [USMCA_COMPANY_ID, plan.driver_id, item.load_id, reimbursementType, item.amount_cents, reason, plan.settlement_id, OWNER_ACTOR_USER_ID]
      );
      const sourceId = srcIns.rows[0]!.id;

      const postingAccountId =
        item.kind === "extra_pay"
          ? await resolveRoleAccountOptional(client as never, USMCA_COMPANY_ID, "driver_pay_expense")
          : await resolveReimbursementExpenseAccount(client as never, USMCA_COMPANY_ID, item.reimbursement_type);
      const approvalStatus = postingAccountId ? "approved" : "pending";

      const lineRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
            posting_account_id, approval_status, is_sample_data
          )
          VALUES ($1::uuid, $2, $3, $4::numeric, $5::uuid, $6, $7::uuid, $8::uuid, $9, $10)
          RETURNING id::text
        `,
        [plan.settlement_id, lineType, item.description, dollars, item.load_id, REIMBURSEMENTS_SOURCE_TABLE, sourceId, postingAccountId, approvalStatus, s.is_sample_data]
      );
      await client.query(`UPDATE driver_finance.driver_reimbursements SET settlement_line_id = $2::uuid WHERE id = $1::uuid`, [sourceId, lineRes.rows[0]!.id]);
      lines.push(`  driver_reimbursements ${sourceId} -> settlement_lines ${lineRes.rows[0]!.id} posting_account_id=${postingAccountId ?? "NULL"} approval_status=${approvalStatus}`);
    } else {
      const srcIns = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.driver_settlement_deductions (
            operating_company_id, driver_id, deduction_type, amount_cents, reason,
            applied_to_settlement_id, created_by_user_id, load_id, status, remaining_balance_cents
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid, 'applied', 0)
          RETURNING id::text
        `,
        [USMCA_COMPANY_ID, plan.driver_id, item.deduction_type, item.amount_cents, item.description, plan.settlement_id, OWNER_ACTOR_USER_ID, item.load_id]
      );
      const sourceId = srcIns.rows[0]!.id;

      const { roleKey, postingAccountId, unresolvedReason } = await resolveDeductionPostingAccount(
        client as never,
        USMCA_COMPANY_ID,
        plan.driver_id,
        item.deduction_type
      );
      const approvalStatus = postingAccountId ? "approved" : "pending";

      const lineRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
            posting_account_id, approval_status, is_sample_data
          )
          VALUES ($1::uuid, 'deduction', $2, $3::numeric, $4::uuid, $5, $6::uuid, $7::uuid, $8, $9)
          RETURNING id::text
        `,
        [plan.settlement_id, item.description, dollars, item.load_id, SETTLEMENT_DEDUCTION_SOURCE_TABLE, sourceId, postingAccountId, approvalStatus, s.is_sample_data]
      );
      lines.push(
        `  driver_settlement_deductions ${sourceId} -> settlement_lines ${lineRes.rows[0]!.id} role=${roleKey} posting_account_id=${postingAccountId ?? "NULL"} approval_status=${approvalStatus}${unresolvedReason ? ` (${unresolvedReason})` : ""}`
      );
    }
  }

  if (execute) {
    const before = await client.query<{ gross_pay: string; deductions_total: string; net_pay: string }>(
      `SELECT gross_pay::text, deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlement_id]
    );
    const { method } = await recomputeSettlementHeader(client as never, plan.settlement_id, USMCA_COMPANY_ID);
    const after = await client.query<{ gross_pay: string; deductions_total: string; net_pay: string }>(
      `SELECT gross_pay::text, deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlement_id]
    );
    const a = after.rows[0]!;
    lines.push(
      `- recomputeSettlementHeader method=${method}: gross_pay=${a.gross_pay} deductions_total ${before.rows[0]!.deductions_total} -> ${a.deductions_total}, net_pay ${before.rows[0]!.net_pay} -> ${a.net_pay}`
    );
  }

  return lines;
}

async function processStray13595(client: DbClient, execute: boolean) {
  const lines: string[] = [`## stray load 13595 (belongs to document 5816, not 5809)`];
  const cur = await client.query<{ is_active: boolean; amount: string; settlement_id: string }>(
    `SELECT is_active, amount::text, settlement_id::text FROM driver_finance.settlement_lines WHERE id = $1::uuid`,
    [STRAY_LOAD_13595.line_id]
  );
  const row = cur.rows[0];
  if (!row) { lines.push(`- SKIP: line ${STRAY_LOAD_13595.line_id} not found (already handled?)`); return lines; }
  if (!row.is_active) { lines.push(`- SKIP: line ${STRAY_LOAD_13595.line_id} already voided`); return lines; }
  if (row.settlement_id !== STRAY_LOAD_13595.settlement_id) {
    lines.push(`- SKIP: line ${STRAY_LOAD_13595.line_id} settlement_id=${row.settlement_id}, expected ${STRAY_LOAD_13595.settlement_id} (already moved?)`);
    return lines;
  }
  lines.push(`- VOID settlement_lines ${STRAY_LOAD_13595.line_id} (escrow_contribution $${row.amount}) — load 13595 does not belong to document 5809`);
  lines.push(`- NULL mdata.loads.presettlement_link_id for load 13595`);
  if (execute) {
    await client.query(
      `UPDATE driver_finance.settlement_lines SET is_active = false, voided_at = now(), voided_by_user_id = $2::uuid,
         void_reason = 'ROUND 28 STEP 3 PHASE 2: load 13595 verified against DRIVER PAY LINES to belong to document 5816, not 5809 — contamination from an earlier presettlement auto-link (Step 1 booking); voided not deleted, not re-linked (5816 out of scope)'
       WHERE id = $1::uuid`,
      [STRAY_LOAD_13595.line_id, OWNER_ACTOR_USER_ID]
    );
    await client.query(
      `UPDATE mdata.loads SET presettlement_link_id = NULL WHERE operating_company_id = $1::uuid AND load_number = $2 AND presettlement_link_id = $3::uuid`,
      [USMCA_COMPANY_ID, STRAY_LOAD_13595.load_number, STRAY_LOAD_13595.settlement_id]
    );
    const { method } = await recomputeSettlementHeader(client as never, STRAY_LOAD_13595.settlement_id, USMCA_COMPANY_ID);
    const after = await client.query<{ deductions_total: string; net_pay: string }>(
      `SELECT deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [STRAY_LOAD_13595.settlement_id]
    );
    lines.push(`- recomputeSettlementHeader(5809) method=${method}: deductions_total=${after.rows[0]!.deductions_total} net_pay=${after.rows[0]!.net_pay}`);
  }
  return lines;
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND263_ALLOW_HOST) {
    throw new Error("ABORT: --execute requires ROUND263_ALLOW_HOST to name the exact host in DATABASE_URL.");
  }
  if (executeFlag && !url.includes(process.env.ROUND263_ALLOW_HOST!)) {
    throw new Error("ABORT: DATABASE_URL does not match ROUND263_ALLOW_HOST -- refusing to execute.");
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const allLines: string[] = [
    `# ROUND 28 STEP 3 PHASE 2 -- correction register`,
    ``,
    `AlwaysTrack ADDITIONAL PAY / DRIVER REIMBURSEMENTS / DEDUCTIONS sheets are source of truth.`,
    `Run by CC-1 (Claude), ${new Date().toISOString()}. Actor user id (owner): ${OWNER_ACTOR_USER_ID}.`,
    `Mode: ${executeFlag ? "EXECUTE" : "DRY RUN"}.`,
    ``,
  ];

  try {
    for (const plan of PLAN) {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      try {
        const lines = await processSettlement(client, plan, executeFlag);
        if (executeFlag) await client.query("COMMIT");
        else await client.query("ROLLBACK");
        allLines.push(...lines, "");
        console.log(lines.join("\n"));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    try {
      const lines = await processStray13595(client, executeFlag);
      if (executeFlag) await client.query("COMMIT");
      else await client.query("ROLLBACK");
      allLines.push(...lines, "");
      console.log(lines.join("\n"));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (executeFlag) {
    fs.writeFileSync(REGISTER_PATH, allLines.join("\n") + "\n", "utf8");
    console.log(`\nCorrection register written: ${REGISTER_PATH}`);
  } else {
    console.log("\nDRY RUN ONLY -- pass --execute with ROUND263_ALLOW_HOST set to actually run. No writes made.");
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
