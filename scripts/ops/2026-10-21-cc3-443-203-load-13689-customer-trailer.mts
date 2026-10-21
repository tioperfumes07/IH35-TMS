// LEAD 443.203 (20:22Z) — 5851's company settlement prints load 13689 on trailer 10204 (not a USMCA fleet trailer: a customer /
// broker trailer); the Creator booked it on the settlement-level fleet trailer 10209 (engine fixed: per-load printed trailer,
// creatorLoadTrailerChoice). Records 10204 on 13689 through THE Edit Load engine (updateDispatchLoad, trailer-choice-only
// PATCH — equipment metadata, allowed on a posted load, audited dispatch.load.trailer_choice_recorded): one
// dispatch.non_owned_trailers row (counterparty = the load's customer), load trailer_source = customer. No JE (TB unchanged).
// Refuses unless 10204 is NOT a fleet trailer of this company and 13689 is still on trailer_source = company.
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.203
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD = "13689";
const TRAILER = "10204";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.203") throw new Error("--apply requires --auth LEAD-ORDER-443.203");
  // verify-owner-authorization: Lead 443.203 (20:22Z) "record 10204 on 13689 through that engine" — relayed by the owner's
  // Lead channel; evidence = 5851 company settlement load table (13689 trailer 10204).
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.203 13689 customer trailer" });
else if (FORK) await assertNotProduction(db, { label: "443.203 13689 customer trailer (fork)" });
const state = async () =>
  (await db.query(`SELECT l.id::text, l.trailer_source, l.non_owned_trailer_id::text, t.trailer_number, t.counterparty_type, c.customer_name
     FROM mdata.loads l LEFT JOIN dispatch.non_owned_trailers t ON t.id = l.non_owned_trailer_id LEFT JOIN mdata.customers c ON c.id = t.counterparty_id
    WHERE l.operating_company_id = $1::uuid AND l.load_number = $2 AND l.voided_at IS NULL`, [USMCA, LOAD])).rows;
const tb = async () =>
  (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0].net;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tbBefore = await tb();
  const before = await state();
  console.log(`before ${JSON.stringify(before)}`);
  if (before.length !== 1 || before[0].trailer_source !== "company") throw new Error("REFUSE: 13689 not found once on trailer_source company — already fixed?");
  const fleet = (await db.query(`SELECT count(*)::int n FROM mdata.equipment WHERE upper(trim(equipment_number)) = $2
      AND (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid) AND deactivated_at IS NULL`, [USMCA, TRAILER])).rows[0].n;
  if (fleet !== 0) throw new Error(`REFUSE: ${TRAILER} is a fleet trailer of this company`);
  await updateDispatchLoad(db as never, {
    loadId: before[0].id,
    operatingCompanyId: USMCA,
    requestingUserUuid: OWNER,
    requestingUserRole: "Owner",
    fields: {},
    trailer_choice: { kind: "customer", trailer_number: TRAILER },
  } as never);
  const after = await state();
  const tbAfter = await tb();
  console.log(`after ${JSON.stringify(after)} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (after[0]?.trailer_source !== "customer" || after[0]?.trailer_number?.trim() !== TRAILER || after[0]?.counterparty_type !== "customer" || tbAfter !== tbBefore || Number(tbAfter) !== 0)
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
