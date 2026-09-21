#!/usr/bin/env tsx
// ROUND 29.5 owner ruling (2026-09-22) — item 1: the escrow_contribution charges on 5805/13592
// ($25.00) and 5806/13581+13591 ($25.00 each) are real driver obligations that the signed settlement
// document does not itemize — RULED: "It is not fictional and it is not deleted — it is UNSETTLED."
//
// A prior session (ROUND 27.1/28 STEP 3 batch2, PR #22150) already VOIDED these 3 settlement_lines
// rows under an earlier owner ruling ("a section that does not tie does not post") — that void is a
// permanent WORM fact, left exactly as-is, NOT reversed (this ruling does not ask for that; it asks
// for the underlying obligation to be preserved as a LIVE, discoverable, unsettled record, which
// voiding a settlement_lines row does not do — a voided row is dead, not carried forward).
//
// FIX: one driver_finance.driver_settlement_deductions row per charge, status='pending',
// applied_to_settlement_id = NULL (the table's own "not yet applied" state — the exact state
// materializeSettlementLines' own query scans for: WHERE applied_to_settlement_id IS NULL AND
// voided_at IS NULL), deduction_type='escrow_contribution', load_id set to the original load for
// citation/traceability. NOT auto-picked-up by any future settlement today (materializeSettlementLines
// scopes to `load_id = ANY(that settlement's own loads)`, and these loads are already
// closed/delivered/settled elsewhere) — this is deliberate: the ruling asks for the obligation to be
// discoverable and carried forward, not for a new automated mechanism. A future settlement-close pass
// (or a human) applies it explicitly via the same reuse-existing-pending-row pattern ROUND 26.3 STEP
// 4A already used (scripts/ops/round26-3-step4a-fix-5795-5800.ts's "reuse" item kind).
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const ITEMS = [
  {
    doc: "5805",
    driverId: "93be328f-ba1b-4175-adaf-bb619c1c51f2",
    loadId: "d706f493-de13-4d8c-8bf0-4a889e3f87fb",
    loadNumber: "13592",
    voidedLineId: "d7e6d0b8-5c41-4fb4-8197-f6f069ac9f32",
  },
  {
    doc: "5806",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f",
    loadNumber: "13581",
    voidedLineId: "da1e0d00-6a1d-4393-9e5b-9c20b70c15a4",
  },
  {
    doc: "5806",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    loadId: "10234bcb-933e-422c-9924-630a7f2a893f",
    loadNumber: "13591",
    voidedLineId: "89313e2b-9544-4930-8af2-e3cc05e7e142",
  },
];

async function main() {
  const execute = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (execute && !process.env.ROUND263_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND263_ALLOW_HOST.");
  if (execute && !url.includes(process.env.ROUND263_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL does not match ROUND263_ALLOW_HOST.");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', ${execute ? "true" : "false"})`);

  for (const item of ITEMS) {
    // Idempotency: skip if an unsettled escrow_contribution deduction already exists for this exact load.
    const dup = await client.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_settlement_deductions
        WHERE driver_id = $1::uuid AND load_id = $2::uuid AND deduction_type = 'escrow_contribution'
          AND applied_to_settlement_id IS NULL AND voided_at IS NULL`,
      [item.driverId, item.loadId]
    );
    if (dup.rows[0]) {
      console.log(`- SKIP ${item.doc}/${item.loadNumber}: unsettled escrow deduction already exists (${dup.rows[0].id})`);
      continue;
    }
    const reason =
      `ROUND 29.5 owner ruling (2026-09-22): $25.00 escrow_contribution present in the app for load ${item.loadNumber} ` +
      `but absent from document ${item.doc}'s own signed text — UNSETTLED, carried forward to this driver's next settlement, ` +
      `not fictional, not deleted (the original settlement_lines row ${item.voidedLineId} on ${item.doc} stays voided per the ` +
      `prior ROUND 27.1/28 STEP 3 batch2 correction — that void is unchanged; this row is the live, discoverable record of the ` +
      `real, still-owed obligation).`;
    console.log(`- CREATE ${item.doc}/${item.loadNumber}: driver_settlement_deductions, escrow_contribution, $25.00, status=pending, applied_to_settlement_id=NULL`);
    if (execute) {
      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.driver_settlement_deductions (
            operating_company_id, driver_id, deduction_type, amount_cents, reason,
            load_id, created_by_user_id, status, applied_to_settlement_id, remaining_balance_cents
          )
          VALUES ($1::uuid, $2::uuid, 'escrow_contribution', 2500, $3, $4::uuid, $5::uuid, 'pending', NULL, 2500)
          RETURNING id::text
        `,
        [USMCA_COMPANY_ID, item.driverId, reason, item.loadId, OWNER_ACTOR_USER_ID]
      );
      console.log(`  -> ${ins.rows[0]!.id}`);
    }
  }

  if (!execute) console.log("\nDRY RUN ONLY -- pass --execute with ROUND263_ALLOW_HOST set to actually run.");
  client.release();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
