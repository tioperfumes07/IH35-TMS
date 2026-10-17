// LEAD 443.192 (verify-driver-bill-has-miles-and-rate) — loads 13656 / 13680 were booked 2026-10-16 on a MERGED driver record
// (mdata.drivers.merged_into_driver_id set); the pay writer priced the merged record (no rate card) and minted $0, rate-NULL
// bills linked to cancelled settlements. Engine fix #26925 refuses merged records and releases dead settlement links.
// This re-stamps the two loads FROM EVIDENCE ON THE ROW (the driver record's own merged_into_driver_id) through the Edit Load
// engine only — updateDispatchLoad, Owner role, reason ≥ 10 (recorded in its audit) — which re-prices the open bill from the
// survivor's own rate card and releases the dead settlement link (audited). No JE: a bill mint posts nothing (TB unchanged).
// Refuses unless each load's driver IS a merged record and the bill is still the $0 / rate-NULL defect.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// 443.192 (Lead 12:35Z "merged-driver loads: YES"): the load list may be passed as --loads 13661,13666,… (default the first two).
const LOADS = (() => { const i = process.argv.indexOf("--loads"); return i > 0 ? String(process.argv[i + 1]).split(",") : ["13656", "13680"]; })();
const REQUIRE_ZERO_BILL = !process.argv.includes("--loads");
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.192") throw new Error("--apply requires --auth LEAD-ORDER-443.192");
  // verify-owner-authorization: Lead ROUND 443.192 (08:55Z / 10:10Z split) "the 2 driver bills … evidence re-stamp through the
  // engine, audited" — the survivor comes from the merged record's own merged_into_driver_id (the merge engine's record).
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 merged-driver reassign" });
else if (FORK) await assertNotProduction(db, { label: "443.192 merged-driver reassign (fork)" });
const scope = async () => {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
};
const bill = async (loadId: string) =>
  (await db.query(`SELECT b.id::text, b.driver_id::text, b.gross_amount_cents::int gross, b.rate_per_mile_cents rate, b.status, b.miles_basis_type basis,
          b.settled_in_settlement_id::text settled_in
     FROM driver_finance.driver_bills b WHERE b.load_id=$1::uuid AND b.voided_at IS NULL ORDER BY b.created_at`, [loadId])).rows;
const tb = async () =>
  (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0].net;

let ok = false;
try {
  await scope();
  const tbBefore = await tb();
  const rows = (await db.query(`SELECT l.id::text load_id, l.load_number, l.assigned_primary_driver_id::text driver_id,
          d.merged_into_driver_id::text survivor
     FROM mdata.loads l JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
    WHERE l.operating_company_id=$1::uuid AND l.load_number = ANY($2::text[]) AND l.voided_at IS NULL ORDER BY l.load_number`, [USMCA, LOADS])).rows;
  if (rows.length !== LOADS.length) throw new Error(`REFUSE: found ${rows.length} of ${LOADS.length} loads`);
  for (const r of rows) {
    const before = await bill(r.load_id);
    console.log(`${r.load_number}: driver ${r.driver_id} merged_into ${r.survivor} · bills ${JSON.stringify(before)}`);
    if (!r.survivor) throw new Error(`REFUSE ${r.load_number}: driver is not a merged record — no evidence to re-stamp`);
    if (REQUIRE_ZERO_BILL && !before.some((b: any) => b.gross === 0 && b.rate == null)) throw new Error(`REFUSE ${r.load_number}: no $0 / rate-NULL bill — already fixed?`);
    const res = await updateDispatchLoad(db as never, {
      loadId: r.load_id,
      operatingCompanyId: USMCA,
      requestingUserUuid: OWNER,
      requestingUserRole: "Owner",
      override_reason: `Lead 443.192: driver record ${r.driver_id} is merged into ${r.survivor} (driver-merge record) — the load's driver is the survivor`,
      fields: { assigned_primary_driver_id: r.survivor },
    } as never);
    const after = await bill(r.load_id);
    console.log(`  → ${JSON.stringify(res).slice(0, 160)}\n  bills after ${JSON.stringify(after)}`);
    const live = after.filter((b: any) => b.status !== "voided");
    // Every live bill must now name the survivor; a per-mile price must come from SHORT miles (443.192 engine) — the
    // bill's own miles basis is checked by verify-driver-bill-has-miles-and-rate after the run.
    if (live.some((b: any) => b.driver_id !== r.survivor)) throw new Error(`NOT VERIFIED ${r.load_number}: a bill does not name the survivor`);
    if (REQUIRE_ZERO_BILL && live.some((b: any) => !(b.gross > 0) || b.rate == null))
      throw new Error(`NOT VERIFIED ${r.load_number}: bill not re-priced on the survivor`);
  }
  const tbAfter = await tb();
  console.log(`trial balance before ${tbBefore} after ${tbAfter}`);
  if (Number(tbAfter) !== 0) throw new Error("NOT VERIFIED: trial balance not 0");
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.192.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}
