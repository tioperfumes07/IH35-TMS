#!/usr/bin/env tsx
// ROUND 28 STEP 3 PHASE 2B — gap-fill for a real bug found live in Phase 2's own first run.
//
// round28-step3-phase2-additions.ts's idempotency dup-check matched on
// (settlement_id, line_type, description, amount) WITHOUT load_id. Two DIFFERENT loads on the same
// settlement that happen to share an identical description+amount (e.g. both billing "Driver
// Pay-Enlonada" $25.00) were treated as duplicates of each other -- the second load's real, distinct
// line was silently skipped as "already exists" 17 times across that run (full detail: each SKIP line
// in docs/bus/CORRECTION-REGISTER-ROUND-28-STEP3-PHASE2.md, cross-checked live against
// driver_finance.settlement_lines afterward -- see round28-step3-phase2b-gapfill-data.json, built by
// diffing the Phase 2 plan against a fresh live read, not by re-reading the log).
//
// round28-step3-phase2-additions.ts's own dup-check is now fixed (load_id added to the match) for any
// future run of that file, but re-running it whole here would NOT close this specific gap: one of
// 5810/13599's two genuinely-identical "$25.00 Extra Pick Up" items already exists, so a fixed-but-
// still-existence-only dup-check would still treat the second identical plan item as "already there."
// This file instead applies the EXACT 17 missing items (diffed by count, not existence) directly, one
// INSERT each -- the same INSERT shapes as Phase 2's own script, unchanged.
//
// NO NEW GL MATH, NO REVERSES: identical mechanism to round28-step3-phase2-additions.ts (driver_
// reimbursements / driver_settlement_deductions source rows + resolveDeductionPostingAccount /
// resolveRoleAccountOptional / resolveReimbursementExpenseAccount, unchanged imports) -- adds real
// missing rows, touches nothing that already exists.
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
const REGISTER_PATH = path.join(ROOT, "docs/bus/CORRECTION-REGISTER-ROUND-28-STEP3-PHASE2B.md");
const DATA_PATH = path.join(ROOT, "scripts/ops/round28-step3-phase2b-gapfill-data.json");
const REIMBURSEMENTS_SOURCE_TABLE = "driver_finance.driver_reimbursements";

type Item =
  | { kind: "extra_pay"; load_number: string; load_id: string; description: string; amount_cents: number }
  | { kind: "reimbursement"; load_number: string; load_id: string; description: string; reimbursement_type: string; amount_cents: number }
  | { kind: "deduction"; load_number: string; load_id: string; description: string; deduction_type: string; amount_cents: number };

type MissingEntry = { doc: string; settlement_id: string; driver_id: string; item: Item };
const MISSING: MissingEntry[] = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

async function addOne(client: DbClient, m: MissingEntry, execute: boolean, lines: string[]) {
  const item = m.item;
  const dollars = (item.amount_cents / 100).toFixed(2);
  const lineType = item.kind === "extra_pay" ? "extra_pay" : item.kind === "reimbursement" ? "reimbursement" : "deduction";

  // Exact-count safety check: count active lines for this (settlement, load, type, desc, amount) and
  // compare against how many entries this MISSING list itself expects for that same tuple -- refuses
  // to over-add past what the diff computed, protecting a re-run from double-inserting.
  const wantCount = MISSING.filter(
    (x) => x.doc === m.doc && x.item.load_number === item.load_number && x.item.description === item.description && (x.item.amount_cents === item.amount_cents)
  ).length;
  const haveRes = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM driver_finance.settlement_lines
      WHERE settlement_id = $1::uuid AND load_id = $2::uuid AND line_type = $3 AND description = $4 AND amount = $5::numeric AND is_active = true`,
    [m.settlement_id, item.load_id, lineType, item.description, dollars]
  );
  const have = Number(haveRes.rows[0]!.n);
  lines.push(`- ${m.doc} load=${item.load_number} "${item.description}" $${dollars} — currently ${have} active, this gapfill list expects ${wantCount} more of this exact tuple`);
  if (!execute) return;

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
      [USMCA_COMPANY_ID, m.driver_id, item.load_id, reimbursementType, item.amount_cents, reason, m.settlement_id, OWNER_ACTOR_USER_ID]
    );
    const sourceId = srcIns.rows[0]!.id;
    const postingAccountId =
      item.kind === "extra_pay"
        ? await resolveRoleAccountOptional(client as never, USMCA_COMPANY_ID, "driver_pay_expense")
        : await resolveReimbursementExpenseAccount(client as never, USMCA_COMPANY_ID, item.reimbursement_type);
    const approvalStatus = postingAccountId ? "approved" : "pending";
    const sampleRes = await client.query<{ is_sample_data: boolean }>(`SELECT is_sample_data FROM driver_finance.driver_settlements WHERE id=$1::uuid`, [m.settlement_id]);
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
          posting_account_id, approval_status, is_sample_data
        )
        VALUES ($1::uuid, $2, $3, $4::numeric, $5::uuid, $6, $7::uuid, $8::uuid, $9, $10)
        RETURNING id::text
      `,
      [m.settlement_id, lineType, item.description, dollars, item.load_id, REIMBURSEMENTS_SOURCE_TABLE, sourceId, postingAccountId, approvalStatus, sampleRes.rows[0]?.is_sample_data ?? false]
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
      [USMCA_COMPANY_ID, m.driver_id, item.deduction_type, item.amount_cents, item.description, m.settlement_id, OWNER_ACTOR_USER_ID, item.load_id]
    );
    const sourceId = srcIns.rows[0]!.id;
    const { roleKey, postingAccountId, unresolvedReason } = await resolveDeductionPostingAccount(client as never, USMCA_COMPANY_ID, m.driver_id, item.deduction_type);
    const approvalStatus = postingAccountId ? "approved" : "pending";
    const sampleRes = await client.query<{ is_sample_data: boolean }>(`SELECT is_sample_data FROM driver_finance.driver_settlements WHERE id=$1::uuid`, [m.settlement_id]);
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
          posting_account_id, approval_status, is_sample_data
        )
        VALUES ($1::uuid, 'deduction', $2, $3::numeric, $4::uuid, $5, $6::uuid, $7::uuid, $8, $9)
        RETURNING id::text
      `,
      [m.settlement_id, item.description, dollars, item.load_id, SETTLEMENT_DEDUCTION_SOURCE_TABLE, sourceId, postingAccountId, approvalStatus, sampleRes.rows[0]?.is_sample_data ?? false]
    );
    lines.push(
      `  driver_settlement_deductions ${sourceId} -> settlement_lines ${lineRes.rows[0]!.id} role=${roleKey} posting_account_id=${postingAccountId ?? "NULL"} approval_status=${approvalStatus}${unresolvedReason ? ` (${unresolvedReason})` : ""}`
    );
  }
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND263_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND263_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND263_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL does not match ROUND263_ALLOW_HOST.");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const allLines: string[] = [
    `# ROUND 28 STEP 3 PHASE 2B -- gap-fill correction register`,
    ``,
    `Closes 17 items Phase 2's own dup-check bug (missing load_id in the match) silently skipped.`,
    `Run by CC-1 (Claude), ${new Date().toISOString()}. Mode: ${executeFlag ? "EXECUTE" : "DRY RUN"}.`,
    ``,
  ];
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    try {
      const lines: string[] = [];
      for (const m of MISSING) {
        await addOne(client, m, executeFlag, lines);
      }
      if (executeFlag) await client.query("COMMIT");
      else await client.query("ROLLBACK");
      allLines.push(...lines, "");
      console.log(lines.join("\n"));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const docs = Array.from(new Set(MISSING.map((m) => m.doc)));
    if (executeFlag) {
      for (const doc of docs) {
        const settlementId = MISSING.find((m) => m.doc === doc)!.settlement_id;
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        const before = await client.query<{ gross_pay: string; deductions_total: string; net_pay: string }>(
          `SELECT gross_pay::text, deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
          [settlementId]
        );
        const { method } = await recomputeSettlementHeader(client as never, settlementId, USMCA_COMPANY_ID);
        const after = await client.query<{ gross_pay: string; deductions_total: string; net_pay: string }>(
          `SELECT gross_pay::text, deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
          [settlementId]
        );
        await client.query("COMMIT");
        const a = after.rows[0]!;
        const line = `recomputeSettlementHeader(${doc}) method=${method}: gross_pay=${a.gross_pay} deductions_total ${before.rows[0]!.deductions_total} -> ${a.deductions_total}, net_pay ${before.rows[0]!.net_pay} -> ${a.net_pay}`;
        console.log(line);
        allLines.push(line);
      }
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
