#!/usr/bin/env tsx
// ROUND 26.3 STEP 4A — owner ruled 2026-09-21 18:50 UTC: AlwaysTrack is the source of truth for
// settlements 5795 and 5800. Both are DEDUCTION SHORTFALLS (gross is correct on both); the app
// undercounted deductions_total/net_pay because some real deduction rows existed but were never
// materialized into a settlement_lines row, or (5795 only) were pointed at the wrong settlement.
//
// WHY THIS SCRIPT EXISTS (researched live, this session, before writing a line): the two paths the
// instruction named were checked first and neither can touch a LOCKED settlement:
//   - scripts/ops/b5-full-recut-orchestration.ts moves a LOAD (and its lines/deductions/bills)
//     between settlements. Both loads here (13567, 13584) already sit on the correct settlement --
//     nothing to move -- so that primitive is a structural no-op for this correction.
//   - the sanctioned deduction-apply writer, materializeSettlementLines()
//     (settlement-lines-materialize.service.ts), hard-refuses any settlement whose status !== 'open'
//     (see that file, "Only an OPEN settlement can gain new lines"). Both 5795 and 5800 are 'locked'.
// NO NEW GL MATH: this script imports and reuses that same file's exported resolveDeductionPostingAccount()
// (the identical account-resolution branch materializeSettlementLines itself calls) and
// deductions.service.ts's exported SETTLEMENT_DEDUCTION_SOURCE_TABLE constant. The only INSERT/UPDATE
// SQL below is copied verbatim in shape from materializeSettlementLines' own deduction block (lines
// ~309-339 of that file), with the settlement-status gate removed (that gate is what this correction
// is authorized to cross -- ORCH stop-and-report analysis found no other writer that could) and the
// owner-required load_id/status='applied' fields added, which that block does not set.
// Header math (deductions_total/net_pay) is written EXCLUSIVELY by the existing, already-shipped,
// status-agnostic recomputeSettlementHeader() (settlement-load-reassignment.service.ts) -- the SAME
// function the sanctioned B5 load-reassignment primitive already calls against locked/closed
// settlements in production. This script never issues a raw UPDATE against driver_finance.driver_settlements.
//
// NO REVERSES (owner law 2026-09-13). Nothing voided, nothing re-cut. Missing lines are ADDED.
//
// SAFETY: --execute requires ROUND263_ALLOW_HOST naming the exact host in DATABASE_URL, mirroring
// b5-full-recut-orchestration.ts's own double-confirmation gate. Default is DRY RUN (no writes).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveDeductionPostingAccount } from "../../apps/backend/src/driver-finance/settlement-lines-materialize.service.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // tioperfumes07@gmail.com, role Owner -- matches the actor already on file for these tours' sibling historical-backfill rows (302b7561).
const REGISTER_PATH = path.join(ROOT, "docs/bus/CORRECTION-REGISTER-ROUND-26.3-STEP4A-5795-5800.md");

type LoadRef = { number: string; id: string };
const LOAD_13567: LoadRef = { number: "13567", id: "44517802-c805-4ba5-8cb6-9f7e9521203a" };
const LOAD_13584: LoadRef = { number: "13584", id: "9c823864-b09d-4d74-8b7d-a406d5fc72fc" };

type ReuseItem = {
  kind: "reuse";
  deductionId: string;
  description: string; // AlwaysTrack text, verbatim
  amountCents: number;
  deductionType: string; // unchanged from the existing row
  load: LoadRef;
};
type CreateItem = {
  kind: "create";
  description: string; // AlwaysTrack text, verbatim
  amountCents: number;
  deductionType: string;
  load: LoadRef;
};
type Item = ReuseItem | CreateItem;

type SettlementPlan = {
  doc: string;
  settlementId: string;
  driverId: string;
  targetDeductionsTotal: number; // dollars
  targetNetPay: number; // dollars
  items: Item[];
};

const PLANS: SettlementPlan[] = [
  {
    doc: "5795",
    settlementId: "41c422bb-27b1-4ffe-942e-7acc9f133af2",
    driverId: "4ff53886-41cc-434f-ae23-a36a0e3ec8e2",
    targetDeductionsTotal: 261.99,
    targetNetPay: 789.04,
    items: [
      // Already applied_to_settlement_id = this settlement (correct); never materialized into a line.
      // Owner: "APPLY the existing pending row a67bd457 -- do not create a second $10.00 admin fee."
      {
        kind: "reuse",
        deductionId: "a67bd457-4d03-432b-8bd5-3f983261c547",
        description: "Admin fee - GAS",
        amountCents: 1000,
        deductionType: "other",
        load: LOAD_13567,
      },
      // Real row, correct amount/load, but applied_to_settlement_id currently points at
      // 3c81e7d5-3a59-4d85-9a16-585d0de05893 -- a CANCELLED shell settlement (source_document_ref
      // '5779', a DIFFERENT tour, same driver) that a historical-backfill pass used as a dumping
      // ground before the real per-document shells existed. Repoint to the real 5795 shell.
      {
        kind: "reuse",
        deductionId: "302b7561-7807-4c20-8672-36814588a71e",
        description: "CASH ADVANCE WIRE TRANSFER",
        amountCents: 20199,
        deductionType: "advance",
        load: LOAD_13567,
      },
    ],
  },
  {
    doc: "5800",
    settlementId: "1104c9f4-2c1a-46f1-b96b-ed3a71b1901b",
    driverId: "40022039-b657-4713-97de-439fba899946",
    targetDeductionsTotal: 385.0,
    targetNetPay: 1307.4,
    items: [
      // None of these four exist as driver_settlement_deductions rows for this driver (verified live
      // -- the driver carries exactly one unrelated $85 stray, "Admin fee (tour 5800)", untouched by
      // this script, flagged separately). The header's current $285.00 was written directly by the
      // historical-attribution import with no settlement_lines backing at all (0 active
      // line_type='deduction' rows existed before this script ran) -- so all four are CREATEs, and
      // together they reconstruct the full, real $385.00 from real lines rather than incrementing an
      // unexplained number.
      { kind: "create", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: LOAD_13584 },
      { kind: "create", description: "CASH ADVANCE WIRE TRANSFER", amountCents: 20000, deductionType: "advance", load: LOAD_13584 },
      {
        kind: "create",
        description: "Admin fee - PAGO DE TELEFONO PERSONAL",
        amountCents: 7500,
        deductionType: "other",
        load: LOAD_13584,
      },
      { kind: "create", description: "Cash Advance-Efectivo", amountCents: 10000, deductionType: "advance", load: LOAD_13584 },
    ],
  },
];

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

async function processSettlement(client: DbClient, plan: SettlementPlan, execute: boolean) {
  const settlementRes = await client.query<{ status: string; source_document_ref: string; is_sample_data: boolean }>(
    `SELECT status::text, source_document_ref, is_sample_data FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [plan.settlementId, USMCA_COMPANY_ID]
  );
  const s = settlementRes.rows[0];
  if (!s) throw new Error(`ABORT ${plan.doc}: settlement ${plan.settlementId} not found`);
  if (s.source_document_ref !== plan.doc) {
    throw new Error(`ABORT ${plan.doc}: source_document_ref mismatch (found '${s.source_document_ref}')`);
  }
  if (s.status !== "locked") {
    throw new Error(`ABORT ${plan.doc}: expected status='locked', found '${s.status}' -- re-check before proceeding`);
  }

  const lines: string[] = [`## ${plan.doc} (${plan.settlementId})`];

  for (const item of plan.items) {
    let deductionId: string;
    if (item.kind === "reuse") {
      const cur = await client.query<{ applied_to_settlement_id: string | null; status: string; voided_at: string | null; amount_cents: string }>(
        `SELECT applied_to_settlement_id::text, status, voided_at::text, amount_cents::text
           FROM driver_finance.driver_settlement_deductions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [item.deductionId, USMCA_COMPANY_ID]
      );
      const row = cur.rows[0];
      if (!row) throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} not found`);
      if (row.voided_at) throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} is voided`);
      if (Number(row.amount_cents) !== item.amountCents) {
        throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} amount_cents=${row.amount_cents}, expected ${item.amountCents}`);
      }
      deductionId = item.deductionId;
      lines.push(
        `- REUSE ${item.deductionId} "${item.description}" $${(item.amountCents / 100).toFixed(2)} -- was applied_to_settlement_id=${row.applied_to_settlement_id ?? "NULL"} status=${row.status} -> repoint to ${plan.settlementId}, status='applied', load_id=${item.load.number}`
      );
      if (execute) {
        await client.query(
          `UPDATE driver_finance.driver_settlement_deductions
              SET applied_to_settlement_id = $2::uuid, status = 'applied', remaining_balance_cents = 0,
                  load_id = COALESCE(load_id, $3::uuid), updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
          [deductionId, plan.settlementId, item.load.id, USMCA_COMPANY_ID]
        );
      }
    } else {
      lines.push(
        `- CREATE "${item.description}" $${(item.amountCents / 100).toFixed(2)} load ${item.load.number} deduction_type=${item.deductionType}`
      );
      if (execute) {
        const ins = await client.query<{ id: string }>(
          `
            INSERT INTO driver_finance.driver_settlement_deductions (
              operating_company_id, driver_id, deduction_type, amount_cents, reason,
              applied_to_settlement_id, created_by_user_id, load_id, status, remaining_balance_cents
            )
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid, 'applied', 0)
            RETURNING id::text
          `,
          [USMCA_COMPANY_ID, plan.driverId, item.deductionType, item.amountCents, item.description, plan.settlementId, OWNER_ACTOR_USER_ID, item.load.id]
        );
        deductionId = ins.rows[0]!.id;
        lines[lines.length - 1] += ` -> ${deductionId}`;
      } else {
        deductionId = "(dry-run, not yet created)";
      }
    }

    if (execute) {
      // Idempotency: the live partial unique index uq_settlement_lines_no_duplicate_lines
      // (settlement_id, line_type, description, amount) WHERE is_active guards this at the DB layer
      // too; this pre-check makes a re-run after a partial failure a clean no-op instead of a thrown
      // constraint error.
      const dup = await client.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.settlement_lines
          WHERE settlement_id = $1::uuid AND line_type = 'deduction' AND description = $2 AND amount = $3::numeric AND is_active = true`,
        [plan.settlementId, item.description, (item.amountCents / 100).toFixed(2)]
      );
      if (dup.rows[0]) {
        lines.push(`  (settlement_lines row already exists: ${dup.rows[0].id} -- skipped, idempotent re-run)`);
        continue;
      }

      const { roleKey, postingAccountId, unresolvedReason } = await resolveDeductionPostingAccount(
        client as never,
        USMCA_COMPANY_ID,
        plan.driverId,
        item.deductionType
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
        [
          plan.settlementId,
          item.description,
          (item.amountCents / 100).toFixed(2),
          item.load.id,
          SETTLEMENT_DEDUCTION_SOURCE_TABLE,
          deductionId,
          postingAccountId,
          approvalStatus,
          s.is_sample_data,
        ]
      );
      lines.push(
        `  settlement_lines ${lineRes.rows[0]!.id} role=${roleKey} posting_account_id=${postingAccountId ?? "NULL"} approval_status=${approvalStatus}${unresolvedReason ? ` (${unresolvedReason})` : ""}`
      );
    }
  }

  if (execute) {
    const before = await client.query<{ deductions_total: string; net_pay: string }>(
      `SELECT deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlementId]
    );
    const { method } = await recomputeSettlementHeader(client as never, plan.settlementId, USMCA_COMPANY_ID);
    const after = await client.query<{ deductions_total: string; net_pay: string; gross_pay: string }>(
      `SELECT deductions_total::text, net_pay::text, gross_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlementId]
    );
    const a = after.rows[0]!;
    lines.push(
      `- recomputeSettlementHeader method=${method}: deductions_total ${before.rows[0]!.deductions_total} -> ${a.deductions_total}, net_pay ${before.rows[0]!.net_pay} -> ${a.net_pay} (gross_pay ${a.gross_pay})`
    );
    const dedOk = Number(a.deductions_total).toFixed(2) === plan.targetDeductionsTotal.toFixed(2);
    const netOk = Number(a.net_pay).toFixed(2) === plan.targetNetPay.toFixed(2);
    lines.push(`- TARGET deductions_total=${plan.targetDeductionsTotal.toFixed(2)} net_pay=${plan.targetNetPay.toFixed(2)} -- ${dedOk && netOk ? "MATCH" : "MISMATCH"}`);
    if (!dedOk || !netOk) throw new Error(`ABORT ${plan.doc}: recomputed header did not land on target -- see register`);
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
    `# ROUND 26.3 STEP 4A -- correction register`,
    ``,
    `Owner ruled 2026-09-21 13:50 CT (18:50 UTC): AlwaysTrack is the source of truth. Both settlements`,
    `are deduction shortfalls; gross was already correct on both. Run by CC-1 (Claude), ${new Date().toISOString()}.`,
    `Actor user id (owner): ${OWNER_ACTOR_USER_ID}. Mode: ${executeFlag ? "EXECUTE" : "DRY RUN"}.`,
    ``,
  ];

  try {
    for (const plan of PLANS) {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      try {
        const lines = await processSettlement(client, plan, executeFlag);
        if (executeFlag) {
          await client.query("COMMIT");
        } else {
          await client.query("ROLLBACK");
        }
        allLines.push(...lines, "");
        console.log(lines.join("\n"));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
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
