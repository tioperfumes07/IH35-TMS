#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 -- DEDUCTIONS section for settlements 5804-5815 (5816 has zero
// deductions per its own document, excluded).
//
// REVISED FROM THE ORIGINAL PLAN: the original version of this script (written before a context
// compaction mid-session) assumed all 19 planned deduction/escrow lines were missing and
// CREATE-only. Live re-verification after resuming found every one of those 19 lines already
// existed, active, correctly amounted -- created by the earlier settlement_lines
// sync/repoint pass in this same ROUND (the "orphaned/decoy shell settlement" fix applied
// alongside the driver-pay-lines correction). Running the original CREATE plan against that live
// state would have double-posted every line; the first `--execute` attempt caught this itself
// (recomputeSettlementHeader's per-settlement target-verify aborted+rolled back all 11 settlements
// it touched with MISMATCH, exactly as designed -- zero net writes from that attempt).
//
// Live re-verification (asserting DEDUCTIONS section total against each document's own printed
// "Deductions:" line, per settlement) found TWO settlements with an extra, undocumented
// escrow_contribution line inflating the section beyond the document:
//   - 5805: doc prints "Deductions: -10.00" (Admin fee - GAS only, load 13592). Live also carried
//     an active escrow_contribution line for load 13592 ($25.00, id d7e6d0b8-5c41-4fb4-8197-
//     f6f069ac9f32) that appears nowhere on the document.
//   - 5806: doc prints "Deductions: -10.00" (Admin fee - GAS only, load 13591). Live also carried
//     TWO active escrow_contribution lines, for load 13581 ($25.00, id da1e0d00-6a1d-4393-9e5b-
//     9c20b70c15a4) and load 13591 ($25.00, id 89313e2b-9544-4930-8af2-e3cc05e7e142), neither on
//     the document.
// Both documents were read in full (not just the printed subtotal) to confirm no "Escrow For
// Claims" line is buried elsewhere on the page -- there is none on either. Per the standing rule
// ("a section that does not tie does not post") these 3 rows were VOIDED (driver_finance.
// settlement_lines HAS a real voided_at/void_reason/voided_by_user_id -- void-not-delete, not the
// archive-with-citation fallback, which is only for tables lacking voided_at), is_active set false,
// void_reason citing the exact document + line. recomputeSettlementHeader (settlement_lines method)
// re-run after -- all 11 of 5804-5815 (excl. 5812, disclosed conflict; 5816, zero-deductions) now
// tie their DEDUCTIONS section to the document exactly. See docs/bus/OUTBOX-CC-3.md for the report.
//
// This script is now VERIFY-ONLY (no writes) -- it re-asserts the 11 settlements' deductions_total
// against the document targets below and prints PASS/FAIL per settlement, so re-running it after
// this fix is a safe, idempotent live check, never a second write pass.
import pg from "pg";

const TARGETS: Record<string, { settlementId: string; targetDeductionsTotal: number }> = {
  "5804": { settlementId: "48341005-1ac9-4a32-bd7b-f78479782a99", targetDeductionsTotal: 60.0 },
  "5805": { settlementId: "6a8ecf55-c321-4648-bb05-17fada8881a4", targetDeductionsTotal: 10.0 },
  "5806": { settlementId: "f5305500-726f-4650-ab1c-ebef26db4c31", targetDeductionsTotal: 10.0 },
  "5807": { settlementId: "89c90396-28b3-46cd-8920-2c496e499b2f", targetDeductionsTotal: 365.0 },
  "5808": { settlementId: "63a8333b-8446-4426-bd34-4277997608ec", targetDeductionsTotal: 10.0 },
  "5809": { settlementId: "4db66351-c523-43a4-b949-bd4d9c42e5a2", targetDeductionsTotal: 85.0 },
  "5810": { settlementId: "f074c0c9-266c-4fc6-9c1e-446d702ced49", targetDeductionsTotal: 60.0 },
  "5811": { settlementId: "222c0d6b-9c2c-4751-ba08-affd64a993a3", targetDeductionsTotal: 60.0 },
  "5813": { settlementId: "e47e64e2-33cf-4c27-abf2-4e3ee5dbc95e", targetDeductionsTotal: 10.0 },
  "5814": { settlementId: "d00faf77-0d38-451a-807f-54a594c318f5", targetDeductionsTotal: 10.0 },
  "5815": { settlementId: "00027149-1c90-4bc1-b213-0a6d6d614ac6", targetDeductionsTotal: 60.0 },
};

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
  let failures = 0;
  for (const [doc, target] of Object.entries(TARGETS)) {
    const r = await client.query<{ deductions_total: string }>(
      `SELECT deductions_total::text FROM driver_finance.driver_settlements WHERE id=$1::uuid`,
      [target.settlementId]
    );
    const live = Number(r.rows[0]?.deductions_total ?? NaN);
    const ok = live.toFixed(2) === target.targetDeductionsTotal.toFixed(2);
    if (!ok) failures++;
    console.log(`${doc} live=${live.toFixed(2)} target=${target.targetDeductionsTotal.toFixed(2)} -- ${ok ? "PASS" : "FAIL"}`);
  }
  client.release();
  await pool.end();
  console.log(`\n${Object.keys(TARGETS).length - failures}/${Object.keys(TARGETS).length} PASS`);
  if (failures > 0) process.exitCode = 1;
}
await main();
