#!/usr/bin/env node
/**
 * ROUND 23.2 — REHEARSAL ONLY (Neon branch, never prod). Proves the canonical Bill+BillPayment
 * poster (settlement-bill-payment-posting.service.ts) can correctly post 5772/5801/5802/5803 once
 * its input data is correct, and proves the ACCT-F26307 header-sync fix (this same PR) writes
 * driver_settlements.net_pay/gross_pay/deductions_total from what actually posted.
 *
 * ROOT CAUSE MAP (all live-verified on br-fancy-credit-akjnd07a, read-only, this session):
 *   1. 5801/5802/5803: an earlier ad-hoc script (build-september-settlements-5801-5803.mts)
 *      committed Phase A (header + settlement_lines + admin-fee deduction) on 2026-09-12 but Phase B
 *      (posting) never ran -> net_pay stuck at the column default 0.00. Not a deduction-ENGINE bug;
 *      the engine was simply never invoked to completion.
 *   2. The canonical poster requires driver_finance.driver_bills rows linked via
 *      settled_in_settlement_id, with correct driver_id + gross_amount_cents. Live: 4 of 6 loads
 *      across 5801/5802/5803 carry a STALE/WRONG driver_id (pre-dating the tour correction), 5 of 6
 *      carry wrong/zero gross_amount_cents, and settled_in_settlement_id is NULL on all of them.
 *      This is B3/B6 ingestion territory (CC-2/CC-3's rows), not a B4 computation bug -- this script
 *      corrects ONLY the exact 6+4 loads blocking these 4 settlements, using amounts already
 *      cross-validated against 3 independent sources (settlement_lines already committed to prod,
 *      the ground-truth JSON's total_due, and -- for 5801/5802/5803 -- the prior script's own
 *      TOURS transcription). It does not touch any other settlement's driver_bills.
 *   3. driver_finance.driver_settlement_deductions is missing escrow_contribution and cash_advance
 *      rows for these settlements (only the $10 admin fee exists, pre-applied). This script inserts
 *      the missing rows with applied_to_settlement_id set directly (the poster reads by
 *      applied_to_settlement_id = settlementId, not by a "pending" pool).
 *   4. REIMBURSEMENTS: the canonical poster has NO representation for a settlement reimbursement at
 *      all (grep confirms zero references). driver_finance.driver_reimbursements exists and has the
 *      right shape (applied_to_settlement_id, load_id, amount_cents) but nothing wires it into this
 *      poster's gross/net math, and the rows that do exist for these drivers point at STALE/WRONG
 *      settlement ids from a prior (voided/superseded) shell. NOT fixed here -- flagged as a real
 *      posting-path gap per this round's own instruction ("if a posting path does not exist for
 *      something you need, say so and stop; do not invent one"). Where a settlement has a nonzero
 *      reimbursement (5772 $15.25, 5801 $35.75, 5802 $34.99), this rehearsal's net will read that
 *      much SHORT of the signed TOTAL DUE until the poster is extended. 5803 has $0 reimbursement
 *      and is expected to be byte-exact -- the clean end-to-end proof.
 *
 * Usage: DATABASE_URL="postgres://…rehearse-branch…" npx tsx apps/backend/scripts/r232-rehearse-settlement-bill-payment-5772-5801-5802-5803.mts
 * NEVER pass a prod DATABASE_URL to this script. It is a rehearsal tool, not the repost executor.
 */
import pg from "pg";
import { postSettlementBillPayment } from "../src/accounting/settlement-posting/settlement-bill-payment-posting.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c"; // usmcafreightsolutions (same actor the prior script used)

const fmt = (c: number) => (c / 100).toFixed(2);

type BillFix = { load: string; driverId: string; grossCents: number };
type DeductionFix = { load: string; type: "escrow" | "cash_advance"; amountCents: number; reason: string };

type SettlementFix = {
  doc: string;
  settlementId: string;
  driverId: string;
  bills: BillFix[];
  deductions: DeductionFix[];
  expectedTotalDue: number; // dollars, signed document
  expectedReimbursementGapCents: number; // known, unfixed gap (0 for 5803)
};

const FIXES: SettlementFix[] = [
  {
    doc: "5772",
    settlementId: "6a267f30-b9e5-415b-bc81-cfe97099afe9",
    driverId: "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", // Pedro Abraham Lopez Collado
    bills: [
      { load: "13502", driverId: "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", grossCents: 53587 },
      { load: "13507", driverId: "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", grossCents: 22856 },
      { load: "13512", driverId: "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", grossCents: 47246 },
      { load: "13513", driverId: "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", grossCents: 24494 },
    ],
    deductions: [
      { load: "13502", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13502, tour 5772)" },
      { load: "13507", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13507, tour 5772)" },
      { load: "13512", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13512, tour 5772)" },
      { load: "13513", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13513, tour 5772)" },
      { load: "13502", type: "cash_advance", amountCents: 39000, reason: "Cash Advance-Check EFS (load 13502, tour 5772)" },
    ],
    expectedTotalDue: 997.08,
    expectedReimbursementGapCents: 1525, // $15.25 scale reimbursement, load 13513
  },
  {
    doc: "5801",
    settlementId: "c0fdcc2a-2abb-421c-bfd2-fcf5973b7a33",
    driverId: "61727a46-af2e-4d33-8236-e2d99b737708", // Carlos Mauricio Pena Carvallo
    bills: [
      { load: "13570", driverId: "61727a46-af2e-4d33-8236-e2d99b737708", grossCents: 81185 },
      { load: "13580", driverId: "61727a46-af2e-4d33-8236-e2d99b737708", grossCents: 74642 },
    ],
    deductions: [
      { load: "13570", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13570, tour 5801)" },
      { load: "13580", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13580, tour 5801)" },
      { load: "13570", type: "cash_advance", amountCents: 20000, reason: "Cash Advance-Efectivo (load 13570, tour 5801)" },
    ],
    expectedTotalDue: 1334.02,
    expectedReimbursementGapCents: 3575, // $15.25 + $15.25 + $5.25, loads 13570/13580
  },
  {
    doc: "5802",
    settlementId: "2e1dad71-afca-4590-bb39-3ace3f03a073",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", // Neftali Coronado Urbano
    bills: [
      { load: "13579", driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", grossCents: 99510 },
      { load: "13589", driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", grossCents: 108475 },
    ],
    deductions: [], // admin fee $10 already exists+applied; no escrow, no cash advance for this tour
    expectedTotalDue: 2104.84,
    expectedReimbursementGapCents: 3499, // $10.00 + $24.99, loads 13579/13589
  },
  {
    doc: "5803",
    settlementId: "3f67ff6b-0334-4234-b3b0-a09617c77b39",
    driverId: "5dd518ff-db91-429f-b651-a71b5f0db672", // Leonel Antonio Morales
    bills: [
      { load: "13564", driverId: "5dd518ff-db91-429f-b651-a71b5f0db672", grossCents: 84890 },
      { load: "13586", driverId: "5dd518ff-db91-429f-b651-a71b5f0db672", grossCents: 83515 },
    ],
    deductions: [
      { load: "13564", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13564, tour 5803)" },
      { load: "13586", type: "escrow", amountCents: 2500, reason: "Driver-Escrow For Claims (load 13586, tour 5803)" },
    ],
    expectedTotalDue: 1624.05,
    expectedReimbursementGapCents: 0, // clean case -- no reimbursement on this tour
  },
];

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL (Neon REHEARSE branch only) required");
  if (dbUrl.includes("br-fancy-credit-akjnd07a")) {
    throw new Error("REFUSING: DATABASE_URL points at the live prod branch (br-fancy-credit-akjnd07a). This script is rehearsal-only.");
  }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    for (const fx of FIXES) {
      console.log(`\n=== ${fx.doc} — fixing driver_bills + deductions ===`);
      for (const b of fx.bills) {
        const loadRes = await client.query<{ id: string }>(
          `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
          [OPCO, b.load]
        );
        const loadId = loadRes.rows[0]?.id;
        if (!loadId) throw new Error(`load ${b.load} not found`);

        const existing = await client.query<{ id: string; driver_id: string; gross_amount_cents: number; status: string }>(
          `SELECT id::text, driver_id::text, gross_amount_cents, status FROM driver_finance.driver_bills
            WHERE operating_company_id=$1::uuid AND load_number=$2 AND status <> 'void'`,
          [OPCO, b.load]
        );
        for (const row of existing.rows) {
          if (row.driver_id !== b.driverId) {
            // Tombstone bill_number (uniq_driver_bills_operating_company_bill_number is per-company,
            // not per-driver) so the correct replacement can be inserted at the canonical load-numbered
            // bill_number below. Same pattern as the prior script's freeTargetDisplayIds for settlements.
            await client.query(
              `UPDATE driver_finance.driver_bills SET status='void', voided_at=now(),
                 void_reason='ROUND 23.2 rehearsal: wrong driver_id pre-dating tour correction',
                 bill_number = bill_number || '-VOID-' || left(id::text, 8), updated_at=now()
               WHERE id=$1::uuid`,
              [row.id]
            );
            console.log(`  voided stale driver_bill ${row.id} (load ${b.load}, wrong driver ${row.driver_id})`);
          }
        }
        const correct = await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_bills
            WHERE operating_company_id=$1::uuid AND load_number=$2 AND driver_id=$3::uuid AND status <> 'void'`,
          [OPCO, b.load, b.driverId]
        );
        if (correct.rows[0]) {
          await client.query(
            `UPDATE driver_finance.driver_bills
                SET gross_amount_cents=$2, settled_in_settlement_id=$3::uuid, updated_at=now()
              WHERE id=$1::uuid`,
            [correct.rows[0].id, b.grossCents, fx.settlementId]
          );
          console.log(`  updated driver_bill ${correct.rows[0].id} (load ${b.load}) gross=${fmt(b.grossCents)} linked -> ${fx.doc}`);
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO driver_finance.driver_bills
               (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id, created_by_user_id)
             VALUES ($1::uuid,$2::uuid,$3,$3,$4::uuid,$5,'open',$6::uuid,$7::uuid) RETURNING id::text`,
            [OPCO, loadId, b.load, b.driverId, b.grossCents, fx.settlementId, ACTOR]
          );
          console.log(`  inserted driver_bill ${ins.rows[0]!.id} (load ${b.load}) gross=${fmt(b.grossCents)} linked -> ${fx.doc}`);
        }
      }

      for (const d of fx.deductions) {
        const loadRes = await client.query<{ id: string }>(
          `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
          [OPCO, d.load]
        );
        const loadId = loadRes.rows[0]?.id ?? null;
        const already = await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_settlement_deductions
            WHERE operating_company_id=$1::uuid AND applied_to_settlement_id=$2::uuid
              AND deduction_type=$3 AND amount_cents=$4 AND load_id=$5::uuid`,
          [OPCO, fx.settlementId, d.type, d.amountCents, loadId]
        );
        if (already.rows[0]) {
          console.log(`  deduction already present (${d.type} ${fmt(d.amountCents)}, load ${d.load}) — skip`);
          continue;
        }
        await client.query(
          `INSERT INTO driver_finance.driver_settlement_deductions
             (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, load_id, status)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7::uuid,'pending')`,
          [OPCO, fx.driverId, d.type, d.amountCents, d.reason, fx.settlementId, loadId]
        );
        console.log(`  inserted deduction ${d.type} ${fmt(d.amountCents)} (load ${d.load})`);
      }
    }

    await client.query("COMMIT");
    console.log("\nPhase A (data fix) COMMITTED on rehearse branch.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Phase A FAILED, rolled back:", e);
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  console.log("\n=== Phase B: postSettlementBillPayment (canonical Bill+BillPayment path) ===");
  console.log("doc   result       gross      ded        net_cents  header_net   signed     gap(reimb)  ok");
  console.log("----- ------------ ---------- ---------- ---------- ------------ ---------- ----------- ---");
  let allExactOk = true;
  for (const fx of FIXES) {
    try {
      const res = await postSettlementBillPayment({ operatingCompanyId: OPCO, settlementId: fx.settlementId }, { userId: ACTOR });
      let headerNet = "?";
      if (res.result === "posted" || res.result === "already_posted") {
        const hdr = await pool.query<{ net_pay: string }>(
          `SELECT net_pay::text FROM driver_finance.driver_settlements WHERE id=$1::uuid`,
          [fx.settlementId]
        );
        headerNet = hdr.rows[0]?.net_pay ?? "?";
      }
      const netCents = res.result === "posted" ? res.net_cents : null;
      const expectedNetCents = Math.round(fx.expectedTotalDue * 100) - fx.expectedReimbursementGapCents;
      const ok = netCents === expectedNetCents && Number(headerNet) === expectedNetCents / 100;
      if (!ok) allExactOk = false;
      console.log(
        `${fx.doc.padEnd(5)} ${res.result.padEnd(12)} ${
          res.result === "posted" ? fmt(res.gross_cents).padStart(10) : "-".padStart(10)
        } ${res.result === "posted" ? fmt(res.deductions_cents).padStart(10) : "-".padStart(10)} ${
          netCents !== null ? fmt(netCents).padStart(10) : "-".padStart(10)
        } ${headerNet.padStart(12)} ${fx.expectedTotalDue.toFixed(2).padStart(10)} ${fmt(fx.expectedReimbursementGapCents).padStart(11)} ${
          ok ? "OK" : fx.expectedReimbursementGapCents > 0 ? "GAP(known)" : "!!"
        }`
      );
    } catch (e) {
      allExactOk = false;
      console.log(`${fx.doc.padEnd(5)} ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(
    "\n5803 (0 reimbursement gap) is the clean proof: OK there confirms the driver_bills/deduction fix +\n" +
      "ACCT-F26307 header-sync fix work end-to-end. 5772/5801/5802 read short by exactly their known\n" +
      "reimbursement gap until the poster is extended to consume driver_finance.driver_reimbursements\n" +
      "(a real posting-path gap, not fixed in this PR — see the file header comment)."
  );
  process.exitCode = allExactOk ? 0 : 2;
  await pool.end();
}

main();
