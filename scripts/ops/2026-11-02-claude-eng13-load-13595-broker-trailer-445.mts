// ENG-13 (register row 251) — load 13595 trailer 445 is a BROKER trailer (owner 2026-11-02: "THEN IT IS A BROKER TRAILER.").
// Evidence: Company + Driver Settlement 5816 print "Trk: T148 / Trlr: 445" for load 13595 (PAYPA TRANSPORT, Laredo -> Baytown).
// 445 is not in mdata.equipment for any entity — it is the broker's trailer, so no fleet row is created.
// Records 445 through THE Edit Load engine (updateDispatchLoad, trailer-choice-only PATCH — equipment metadata, allowed on a
// posted/invoiced load, audited dispatch.load.trailer_choice_recorded) — same path as precedent 443.203 (load 13689 / 10204):
// one dispatch.non_owned_trailers row (counterparty = the load's customer), trailer_source = 'customer'. No JE (TB unchanged).
// load_trailer_equipment_id is NOT changed: the documents do not state 445's body type; the booked Dry Van stays (live
// convention: all 12 existing customer-trailer loads keep the trailer's physical type).
// Refuses unless 13595 is found exactly once with trailer_source NULL and 445 is NOT a fleet trailer of this company.
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply (requires OPEN AUTH-473 on main)
import pg from "pg";
import { execFileSync } from "node:child_process";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD = "13595";
const TRAILER = "445";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  // verify-no-unauthorized-production-write: an --apply refuses unless AUTH-473 is OPEN and unexpired on main.
  try {
    execFileSync("node", ["scripts/verify-owner-authorization.mjs", process.env.OWNER_AUTH_ID ?? "AUTH-473"], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "ENG-13 13595 broker trailer 445" });
else if (FORK) await assertNotProduction(db, { label: "ENG-13 13595 broker trailer 445 (fork)" });
const state = async () =>
  (await db.query(`SELECT l.id::text, l.status::text, l.trailer_source, l.non_owned_trailer_id::text, t.trailer_number, t.counterparty_type,
                          c.customer_name, lte.code AS equipment_code
     FROM mdata.loads l
     LEFT JOIN dispatch.non_owned_trailers t ON t.id = l.non_owned_trailer_id
     LEFT JOIN mdata.customers c ON c.id = t.counterparty_id
     LEFT JOIN catalogs.load_trailer_equipment lte ON lte.id = l.load_trailer_equipment_id
    WHERE l.operating_company_id = $1::uuid AND l.load_number = $2 AND l.voided_at IS NULL`, [USMCA, LOAD])).rows;
const tb = async () =>
  (await db.query(`SELECT a.account_number, SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::text bal
     FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = $1::uuid GROUP BY 1 ORDER BY 1`, [USMCA])).rows;
const nullCount = async () =>
  (await db.query(`SELECT count(*)::int n FROM mdata.loads WHERE operating_company_id = $1::uuid AND voided_at IS NULL
      AND status::text <> 'cancelled' AND trailer_source IS NULL`, [USMCA])).rows[0].n as number;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  await db.query("SET LOCAL lock_timeout = '20s'");
  const tbBefore = JSON.stringify(await tb());
  const before = await state();
  const nullBefore = await nullCount();
  console.log(`before ${JSON.stringify(before)} · USMCA loads with trailer_source NULL: ${nullBefore}`);
  if (before.length !== 1 || before[0].trailer_source !== null) throw new Error("REFUSE: 13595 not found once with trailer_source NULL — already recorded?");
  const fleet = (await db.query(`SELECT count(*)::int n FROM mdata.equipment WHERE upper(trim(equipment_number)) = $2
      AND (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid) AND deactivated_at IS NULL`, [USMCA, TRAILER])).rows[0].n;
  if (fleet !== 0) throw new Error(`REFUSE: ${TRAILER} is a fleet trailer of this company — not a broker trailer`);
  await updateDispatchLoad(db as never, {
    loadId: before[0].id,
    operatingCompanyId: USMCA,
    requestingUserUuid: OWNER,
    requestingUserRole: "Owner",
    fields: {},
    trailer_choice: { kind: "customer", trailer_number: TRAILER },
  } as never);
  await db.query(`SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`, [
    "dispatch.load_trailer_source_backfilled", "info",
    JSON.stringify({ load_id: before[0].id, load_number: LOAD, trailer_number: TRAILER, trailer_source: "customer",
      basis: "Company + Driver Settlement 5816 'Trk: T148 / Trlr: 445'; owner ruling 2026-11-02 broker trailer", auth: "AUTH-473", engine: "ENG-13" }),
    "ENG-13",
  ]);
  const after = await state();
  const tbAfter = JSON.stringify(await tb());
  const nullAfter = await nullCount();
  console.log(`after ${JSON.stringify(after)} · trailer_source NULL ${nullBefore} -> ${nullAfter} · books identical ${tbAfter === tbBefore}`);
  if (after[0]?.trailer_source !== "customer" || String(after[0]?.trailer_number ?? "").trim() !== TRAILER
      || after[0]?.counterparty_type !== "customer" || after[0]?.equipment_code !== before[0].equipment_code
      || tbAfter !== tbBefore || nullAfter !== nullBefore - 1)
    throw new Error("NOT VERIFIED");
  if (APPLY || FORK) { await db.query("COMMIT"); console.log("COMMITTED"); }
  else { await db.query("ROLLBACK"); console.log("DRY RUN — ROLLED BACK."); }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 1500);
}
