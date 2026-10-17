// LEAD 443.192 (13:25Z item 2) — OWNER LAW: "The signed AlwaysTrack settlement miles are the PC*MILER pay miles = SHORT miles."
// Measured read-only 2026-10-17: of the 155 USMCA per-mile driver bills settled in a live settlement, every bill already equals
// the signed settlement line's miles x rate; 10 of their loads (booked outside the Creator, then adopted by it) still carry
// miles_shortest NULL although the signed settlement line carries the short miles. This stamps mdata.loads.miles_shortest FROM
// THAT SIGNED LINE ONLY (driver_finance.settlement_lines, line_type 'earnings', unit 'mi', on the live settlement the bill is
// settled in), and only where every check holds — else the load is listed and skipped:
//   miles_shortest IS NULL · exactly one live earnings line · bill.miles_basis = line miles · bill rate = line rate ·
//   bill loaded pay = line miles x rate (the one money rule) · line miles <= miles_practical (loads_miles_shortest_not_over_practical)
// Writer: CC-2's mileage engine only — setMilesChoice short / 'manual' with the signed line cited as the reason (writes the column,
// provenance + both recommendations + its own audit row; it re-applies the one loaded-miles rule). setMilesChoice never touches
// a driver bill, settlement or pay rate. One audit event per load (dispatch.load.miles_shortest_document_restamp).
// Verified in the same transaction: every bill's gross / loaded / deadhead pay unchanged, TB unchanged and 0.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { setMilesChoice } from "../../apps/backend/src/dispatch/mileage/miles-recommendations.service.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";
import { milesTimesRateCents } from "../../apps/backend/src/driver-finance/deadhead-rule.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.192") throw new Error("--apply requires --auth LEAD-ORDER-443.192");
  // verify-owner-authorization: Lead 443.192 13:25Z item 2 — "evidence re-stamp of miles_shortest from the signed document
  // lines (no pay change when bill already equals document), audited".
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 short miles from document" });
else if (FORK) await assertNotProduction(db, { label: "443.192 short miles from document (fork)" });

type Cand = {
  load_id: string; load_number: string; miles_practical: string | null; settlement_id: string; source_document_ref: string | null;
  bill_id: string; miles_basis: string | null; rate: string | null; gross: string; loaded_pay: string | null; deadhead_pay: string | null;
  lines: number; line_id: string | null; line_miles: string | null; line_rate: string | null;
};
const candidates = async (): Promise<Cand[]> =>
  (await db.query<Cand>(
    `SELECT l.id::text load_id, l.load_number, l.miles_practical::text, s.id::text settlement_id, s.source_document_ref,
            b.id::text bill_id, b.miles_basis::text, b.rate_per_mile_cents::text rate, b.gross_amount_cents::text gross,
            b.loaded_pay_cents::text loaded_pay, b.deadhead_pay_cents::text deadhead_pay,
            (SELECT count(*)::int FROM driver_finance.settlement_lines sl
              WHERE sl.settlement_id = s.id AND sl.load_id = l.id AND sl.line_type = 'earnings' AND sl.voided_at IS NULL AND sl.is_active) lines,
            sl.id::text line_id, sl.quantity::text line_miles, sl.rate_cents::text line_rate
       FROM driver_finance.driver_bills b
       JOIN driver_finance.driver_settlements s ON s.id = b.settled_in_settlement_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
       JOIN mdata.loads l ON l.id = b.load_id AND l.operating_company_id = b.operating_company_id
       LEFT JOIN LATERAL (
         SELECT x.id, x.quantity, x.rate_cents FROM driver_finance.settlement_lines x
          WHERE x.settlement_id = s.id AND x.load_id = l.id AND x.line_type = 'earnings' AND x.voided_at IS NULL AND x.is_active
            AND x.unit_of_measure = 'mi'
          ORDER BY x.created_at LIMIT 1) sl ON true
      WHERE b.operating_company_id = $1::uuid AND b.rate_per_mile_cents IS NOT NULL AND b.voided_at IS NULL AND b.status <> 'void'
        AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND l.miles_shortest IS NULL
      ORDER BY l.load_number`,
    [USMCA],
  )).rows;
const bills = async (loadIds: string[]) =>
  (await db.query(
    `SELECT id::text, gross_amount_cents::text g, loaded_pay_cents::text lp, deadhead_pay_cents::text dp, rate_per_mile_cents::text r,
            miles_basis::text mb, status, voided_at::text v
       FROM driver_finance.driver_bills WHERE load_id = ANY($1::uuid[]) ORDER BY id`,
    [loadIds],
  )).rows;
const tb = async () =>
  (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0].net as string;

const skipReason = (c: Cand): string | null => {
  if (c.lines !== 1 || c.line_miles == null) return `${c.lines} live earnings lines (need exactly 1, unit mi)`;
  const miles = Number(c.line_miles);
  if (!(miles > 0)) return "signed line carries no miles";
  if (Number(c.miles_basis) !== miles) return `bill miles basis ${c.miles_basis} != signed miles ${miles}`;
  if (Number(c.rate) !== Number(c.line_rate)) return `bill rate ${c.rate} != signed line rate ${c.line_rate}`;
  const loaded = c.loaded_pay != null ? Number(c.loaded_pay) : Number(c.gross) - Number(c.deadhead_pay ?? 0);
  if (loaded !== milesTimesRateCents(miles, Number(c.rate))) return `bill loaded pay ${loaded} != signed miles x rate ${milesTimesRateCents(miles, Number(c.rate))}`;
  if (c.miles_practical != null && miles > Number(c.miles_practical)) return `signed short ${miles} > practical ${c.miles_practical}`;
  return null;
};

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tbBefore = await tb();
  const all = await candidates();
  const stamp = all.filter((c) => skipReason(c) == null);
  const skipped = all.filter((c) => skipReason(c) != null);
  console.log(`candidates (settled per-mile bill, load miles_shortest NULL): ${all.length} · stamp ${stamp.length} · skip ${skipped.length}`);
  for (const c of skipped) console.log(`  SKIP ${c.load_number}: ${skipReason(c)}`);
  const loadIds = [...new Set(all.map((c) => c.load_id))];
  const billsBefore = JSON.stringify(await bills(loadIds));

  for (const c of stamp) {
    const miles = Number(c.line_miles);
    // ENGINE ONLY (no raw column write): CC-2's mileage engine writes the column + miles_choice provenance + its own audit row
    // and re-applies the one loaded-miles rule. Source 'manual' carries the value, with the signed line cited as the reason
    // ('document' would only re-record the value the column already holds). setMilesChoice never touches a bill / settlement.
    const pre = (await db.query(`SELECT miles_shortest FROM mdata.loads WHERE id=$1::uuid AND operating_company_id=$2::uuid`, [c.load_id, USMCA])).rows[0];
    if (!pre || pre.miles_shortest != null) throw new Error(`REFUSE ${c.load_number}: miles_shortest changed under us`);
    await setMilesChoice(db as never, {
      operatingCompanyId: USMCA, loadId: c.load_id, field: "short", source: "manual", manualValue: miles, actorUserId: OWNER,
      reason: `LEAD 443.192: signed AlwaysTrack settlement ${c.source_document_ref ?? c.settlement_id} line ${c.line_id} — ${miles} mi = the PC*MILER SHORT (pay) miles`,
    });
    await appendCrudAudit(db as never, OWNER, "dispatch.load.miles_shortest_document_restamp", {
      resource_type: "mdata.loads", resource_id: c.load_id, operating_company_id: USMCA, load_number: c.load_number,
      old_value: null, new_value: miles, evidence: {
        settlement_id: c.settlement_id, source_document_ref: c.source_document_ref, settlement_line_id: c.line_id,
        line_miles: miles, line_rate_cents: Number(c.line_rate), driver_bill_id: c.bill_id, bill_miles_basis: Number(c.miles_basis),
      },
      reason: "LEAD 443.192 item 2: the signed AlwaysTrack settlement miles are the PC*MILER pay (SHORT) miles; bill already equals signed miles x rate — no pay change",
    }, "info", "LEAD-443.192");
    const after = (await db.query(`SELECT miles_shortest::text s, miles_practical::text p, loaded_miles::text lm, miles_choice->'short'->>'source' src
       FROM mdata.loads WHERE id=$1::uuid`, [c.load_id])).rows[0];
    console.log(`  STAMP ${c.load_number}: miles_shortest ${after.s} (source ${after.src}) · practical ${after.p} · loaded ${after.lm} · settlement ${c.source_document_ref}`);
    if (Number(after.s) !== miles || after.src !== "manual") throw new Error(`NOT VERIFIED ${c.load_number}: stamp did not land`);
  }

  const billsAfter = JSON.stringify(await bills(loadIds));
  if (billsAfter !== billsBefore) throw new Error("NOT VERIFIED: a driver bill changed (gross / loaded / deadhead / rate / basis / status)");
  const tbAfter = await tb();
  console.log(`bills unchanged: yes · trial balance before ${tbBefore} after ${tbAfter}`);
  if (tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED: trial balance moved or is not 0");
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log(`COMMITTED — ${stamp.length} load(s) stamped`);
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
