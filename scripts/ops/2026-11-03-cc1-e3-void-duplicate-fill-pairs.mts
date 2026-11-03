// E3 — Diesel duplicate-fill repair: 2 same-day near-duplicate ingest artifacts (Nov 3 2026)
//
// LEAD E3 directive (INBOX 11-03) + owner standing auth (AUTH-473: "you have full permissions
// and authorization … we need to complete the full engines", 2026-11-02 11:25 AM CT).
// AUTH-474 covers this action.
//
// ROOT CAUSE: Two pairs of fuel.fuel_transactions match the LEAD 443.197 duplicate-fill predicate
// (same unit + fuel_type + company-day, gallons within 0.01, amount within 5¢). Each pair was
// created by a manual receipt entry PLUS the same fill arriving on a Dreamline/Relay statement
// import. The import row carries both total_cost and gross_cost; the manual row carries only
// total_cost = the gross price. The import is authoritative; the manual row is the duplicate.
//
// Pair 1 (2026-08-04, unit 033dcdff, diesel, ~50 gal):
//   KEEP: 5e4559ab-12c7-460c-a95b-f98d2b57c73a (import, total=260.50, gross=267.50)
//         → expense b01c3df7-71cd-470e-ac75-42ecee00a923 (posted, $260.50)
//   VOID: c2ef82c1-300c-4410-8595-874959c1937b (manual, total=267.48, gross=NULL)
//         → expense 9b3feabb-d716-4051-bc4a-e314d3080e77 (posted, $267.48)
//
// Pair 2 (2026-09-02, unit 478d9f14, diesel, ~78 gal):
//   KEEP: 5198a23c-106e-4b82-a5ea-00d1b973e9b8 (import, total=407.81, gross=461.02)
//         → expense e0e6375f-72b9-429b-9093-41e4a7762039 (posted, $407.81)
//   VOID: dbf57397-1be3-43b5-a167-f71798c617d2 (manual, total=461.00, gross=NULL)
//         → expense 66903d9b-a356-4528-94c9-cf190a6f5eb0 (posted, $461.00)
//
// After voiding: duplicate_fill_pairs drops from 7 → 5; update baseline to 5.
//
// Run (dry run): DATABASE_URL=<prod> npx tsx scripts/ops/2026-11-03-cc1-e3-void-duplicate-fill-pairs.mts
// Run (apply):   DATABASE_URL=<prod> npx tsx scripts/ops/2026-11-03-cc1-e3-void-duplicate-fill-pairs.mts --apply --auth AUTH-474

import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "ABSORPTION-D5 duplicate fill pair — same unit/day/gallons; manual receipt entry duplicates Dreamline/Relay import row. Keep import (has gross_cost); void manual duplicate. LEAD E3 directive 2026-11-03 / AUTH-474.";

const PAIRS = [
  {
    label: "pair1_20260804_unit033dcdff_50gal",
    keepFuel:    "5e4559ab-12c7-460c-a95b-f98d2b57c73a",
    keepExpense: "b01c3df7-71cd-470e-ac75-42ecee00a923",
    voidFuel:    "c2ef82c1-300c-4410-8595-874959c1937b",
    voidExpense: "9b3feabb-d716-4051-bc4a-e314d3080e77",
    expectDay:   "2026-08-04",
    expectGal:   50.01,
  },
  {
    label: "pair2_20260902_unit478d9f14_78gal",
    keepFuel:    "5198a23c-106e-4b82-a5ea-00d1b973e9b8",
    keepExpense: "e0e6375f-72b9-429b-9093-41e4a7762039",
    voidFuel:    "dbf57397-1be3-43b5-a167-f71798c617d2",
    voidExpense: "66903d9b-a356-4528-94c9-cf190a6f5eb0",
    expectDay:   "2026-09-02",
    expectGal:   78.02,
  },
];

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("cc1_e3_void_duplicate_fill_pairs", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const results: unknown[] = [];

  for (const p of PAIRS) {
    console.log(`\n=== ${p.label} ===`);

    // Pre-flight: verify rows exist as expected
    const pre = await q(
      `SELECT ft.id::text fid, ft.source::text, round(ft.total_cost * 100)::bigint total_cents,
              round(ft.gross_cost * 100)::bigint gross_cents,
              ft.voided_at, ft.gallons::text,
              (coalesce(ft.purchased_at, ft.transaction_at) AT TIME ZONE 'America/Chicago')::date::text fill_day,
              e.id::text eid, e.status::text, e.voided_at e_voided
         FROM fuel.fuel_transactions ft
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
        WHERE ft.operating_company_id = $1::uuid AND ft.id = ANY($2::uuid[]) ORDER BY ft.source DESC`,
      [USMCA, [p.keepFuel, p.voidFuel]],
    );

    const keep = pre.find((r: any) => r.fid === p.keepFuel);
    const dup  = pre.find((r: any) => r.fid === p.voidFuel);

    if (!keep || !dup)
      throw new Error(`${p.label}: REFUSE — rows not found. found=${JSON.stringify(pre.map((r: any) => r.fid))}`);
    if (keep.voided_at || dup.voided_at || keep.e_voided || dup.e_voided)
      throw new Error(`${p.label}: REFUSE — a row is already voided: ${JSON.stringify({ keep: keep.voided_at, dup: dup.voided_at })}`);
    if (keep.eid !== p.keepExpense || dup.eid !== p.voidExpense)
      throw new Error(`${p.label}: REFUSE — expense linkage changed: keep=${keep.eid} dup=${dup.eid}`);
    if (keep.source !== "import")
      throw new Error(`${p.label}: REFUSE — keep row source is not 'import': ${keep.source}`);
    if (dup.source !== "manual")
      throw new Error(`${p.label}: REFUSE — void row source is not 'manual': ${dup.source}`);

    console.log(`  keep: fuel=${keep.fid} source=${keep.source} gal=${keep.gallons} day=${keep.fill_day}`);
    console.log(`  void: fuel=${dup.fid} source=${dup.source} gal=${dup.gallons} day=${dup.fill_day}`);

    const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, userId: OWNER_USER_ID, reason: REASON });

    const expResult = await executeVoidCancel("expense", ctx(p.voidExpense) as never);
    if ((expResult as any).kind !== "ok") throw new Error(`${p.label}: expense void failed: ${JSON.stringify(expResult)}`);
    const fuelResult = await executeVoidCancel("fuel_transaction", ctx(p.voidFuel) as never);
    if ((fuelResult as any).kind !== "ok") throw new Error(`${p.label}: fuel_transaction void failed: ${JSON.stringify(fuelResult)}`);

    // Post-flight
    const post = await q(
      `SELECT ft.id::text fid, (ft.voided_at IS NOT NULL) ft_void, (e.voided_at IS NOT NULL) e_void, e.status::text
         FROM fuel.fuel_transactions ft JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
        WHERE ft.id = ANY($1::uuid[]) ORDER BY 1`,
      [[p.keepFuel, p.voidFuel]],
    );
    const kPost = post.find((r: any) => r.fid === p.keepFuel);
    const dPost = post.find((r: any) => r.fid === p.voidFuel);
    if (!kPost || !dPost || kPost.ft_void || kPost.e_void || !dPost.ft_void || !dPost.e_void)
      throw new Error(`${p.label}: REFUSE after-void: ${JSON.stringify(post)}`);

    console.log(`  PASS: keep live, void stamped`);
    results.push({ pair: p.label, voided_fuel: p.voidFuel, voided_expense: p.voidExpense });
  }

  // Confirm pairs dropped to 4
  const pairsAfter = await q(
    `SELECT count(*)::int n FROM (
       SELECT a.id FROM fuel.fuel_transactions a
       JOIN fuel.fuel_transactions b
         ON b.operating_company_id = a.operating_company_id AND b.unit_id = a.unit_id AND b.fuel_type = a.fuel_type AND a.id < b.id
         AND b.voided_at IS NULL AND b.archived_at IS NULL AND b.gallons > 0
         AND abs(a.gallons - b.gallons) <= 0.01
         AND abs((coalesce(a.purchased_at, a.transaction_at) AT TIME ZONE 'America/Chicago')::date
               - (coalesce(b.purchased_at, b.transaction_at) AT TIME ZONE 'America/Chicago')::date) <= 1
       WHERE a.operating_company_id = $1::uuid AND a.voided_at IS NULL AND a.archived_at IS NULL AND a.gallons > 0
     ) sub`,
    [USMCA],
  );
  const remaining = pairsAfter[0].n;
  if (remaining > 5)
    throw new Error(`REFUSE: candidate pairs after repair = ${remaining}, expected ≤5`);

  console.log(`\nPAIRS REMAINING (candidate SQL count, pre-isDuplicateFill): ${remaining}`);
  console.log("Update scripts/verify-diesel-expense-fuel-dedupe.baseline.json duplicate_fill_pairs to 5.");
  return { pairs_voided: 2, candidate_pairs_after: remaining, results };
});
