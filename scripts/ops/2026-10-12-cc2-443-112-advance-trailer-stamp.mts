// LEAD 443.112 #2 — the USMCA driver advances tied to a load that carry no trailer while their load has one (Codex, verified
// by the Lead on prod: 11, CA-2026-0001..0012 less 0003) get the load's unit / trailer through the engine
// (apps/backend/src/cash-advances/advance-unit-trailer-stamp.service.ts). Fill-only, metadata only — amounts, status and
// journal entries untouched (checked before / after, else rolled back); one audit row per advance.
//   default          DRY RUN (one transaction, rolled back)
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth AUTH-NNN   apply on production (assertIsIntendedProduction + verify-owner-authorization)
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-112-advance-trailer-stamp.mts [--fork-commit | --apply --auth AUTH-NNN]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { stampAdvanceUnitTrailerFromLoad } from "../../apps/backend/src/cash-advances/advance-unit-trailer-stamp.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECTED = 11;
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
if (APPLY) await assertIsIntendedProduction(db, { label: "443.112 advance trailer stamp" });
else if (FORK) await assertNotProduction(db, { label: "443.112 advance trailer stamp (fork)" });

const MISSING_SQL = `
  SELECT a.id::text, a.display_id
    FROM driver_finance.driver_advances a JOIN mdata.loads l ON l.id = a.load_id AND l.operating_company_id = a.operating_company_id
   WHERE a.operating_company_id = $1::uuid AND a.trailer_id IS NULL
     AND EXISTS (SELECT 1 FROM dispatch.load_assignment_history h WHERE h.load_id = l.id AND h.new_trailer_id IS NOT NULL)
   ORDER BY a.display_id`;

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const rows = (await db.query<{ id: string; display_id: string }>(MISSING_SQL, [USMCA])).rows;
  if (rows.length !== EXPECTED) throw new Error(`REFUSE: expected ${EXPECTED} advances, found ${rows.length} (${rows.map((r) => r.display_id).join(", ")}) — re-measure first`);
  const money = async () =>
    (await db.query<{ s: string }>(
      `SELECT string_agg(id::text || ':' || amount::text || ':' || coalesce(outstanding_balance::text,'') || ':' || status || ':' || coalesce(void_reversal_entry_id::text,''), '|' ORDER BY id) s
         FROM driver_finance.driver_advances WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)]
    )).rows[0]!.s;
  const before = await money();
  for (const r of rows) {
    const out = await stampAdvanceUnitTrailerFromLoad(db as never, { operatingCompanyId: USMCA, advanceId: r.id, actorUserId: OWNER, authorization: auth || (FORK ? "fork-rehearsal" : "dry-run") });
    console.log(`${out.display_id}  unit ${out.unit_id}  trailer ${out.trailer_id}  set: ${out.changed.join(", ") || "(nothing)"}`);
  }
  if ((await money()) !== before) throw new Error("REFUSE: an amount / balance / status / reversal moved — rolled back");
  const left = (await db.query(MISSING_SQL, [USMCA])).rows.length;
  console.log(`read-back: ${rows.length} stamped, money identical, advances on a trailer-bearing load with no trailer left: ${left}`);
  if (left !== 0) throw new Error("REFUSE: advances still missing a trailer — rolled back");
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
