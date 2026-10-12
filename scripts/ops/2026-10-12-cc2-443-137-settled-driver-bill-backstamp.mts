// LEAD 443.137 #1 (owner GO 2026-10-12 via Lead: "GO on the 145 settled driver bills without truck / trailer ... Fill them
// through the engine from each bill's load ... metadata only, no money moves, no repost. Fork rehearsal first; then prod").
// Runs driver-finance/driver-bill-unit-trailer.ts backStampSettledDriverBillUnitAndTrailer for USMCA. Rule 53: ONE transaction
// for the whole batch, one set-based UPDATE (the engine); one audit row per bill.
// Refuses (rolls back) if any money / status / settlement field moves, or if a settled bill is left missing its unit or its
// trailer choice (company trailer, customer trailer, or the load's "no trailer").
//   default          DRY RUN (one transaction, rolled back)
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth <record>   apply on production (assertIsIntendedProduction + verify-owner-authorization)
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-137-settled-driver-bill-backstamp.mts [--fork-commit | --apply --auth AUTH-NNN]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { backStampSettledDriverBillUnitAndTrailer } from "../../apps/backend/src/driver-finance/driver-bill-unit-trailer.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.137 settled driver bill back-stamp" });
else if (FORK) await assertNotProduction(db, { label: "443.137 settled driver bill back-stamp (fork)" });

const MONEY_SQL = `SELECT md5(string_agg(id::text || ':' || coalesce(gross_amount_cents::text,'') || ':' || status || ':' || coalesce(settled_in_settlement_id::text,'') || ':' || coalesce(void_reversal_entry_id::text,''), '|' ORDER BY id)) m
                     FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid`;
const LEFT_SQL = `
  SELECT count(*) FILTER (WHERE b.unit_id IS NULL) AS missing_unit,
         count(*) FILTER (WHERE b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL AND l.trailer_source IS DISTINCT FROM 'none') AS missing_trailer_choice,
         count(*) AS settled
    FROM driver_finance.driver_bills b JOIN mdata.loads l ON l.id = b.load_id
   WHERE b.operating_company_id = $1::uuid AND b.voided_at IS NULL AND b.settled_in_settlement_id IS NOT NULL`;

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = (await db.query(LEFT_SQL, [USMCA])).rows[0];
  const moneyBefore = (await db.query<{ m: string }>(MONEY_SQL, [USMCA])).rows[0]!.m;
  const stamped = await backStampSettledDriverBillUnitAndTrailer(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, authorization: auth || (FORK ? "fork-rehearsal" : "dry-run") });
  const after = (await db.query(LEFT_SQL, [USMCA])).rows[0];
  const moneyAfter = (await db.query<{ m: string }>(MONEY_SQL, [USMCA])).rows[0]!.m;
  console.log(`before: settled ${before.settled}, missing unit ${before.missing_unit}, missing trailer choice ${before.missing_trailer_choice}`);
  console.log(`stamped: ${stamped.length} bills (company trailer ${stamped.filter((s) => s.trailer_id).length}, customer trailer ${stamped.filter((s) => s.non_owned_trailer_id).length})`);
  console.log(`after:  settled ${after.settled}, missing unit ${after.missing_unit}, missing trailer choice ${after.missing_trailer_choice}`);
  if (moneyAfter !== moneyBefore) throw new Error("REFUSE: an amount / status / settlement / reversal moved — rolled back");
  if (Number(after.missing_unit) !== 0 || Number(after.missing_trailer_choice) !== 0) throw new Error("REFUSE: settled bills still missing a unit or trailer choice — rolled back");
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
