// LEAD 443.134 #4 — the owner picked the company trailer for the 4 USMCA loads no document named one (OWNER 16:19 CT "ok yes";
// 13562 by the Lead under the owner's "use logic" rule). Each is set through the ONE Edit Load trailer path
// (dispatch/load-trailer-choice.ts resolveTrailerChoice + applyTrailerChoice: same-company active trailer, assignment
// history + trailer_source 'company'), then the Owner driver-bill trailer stamp (accounting/bill-trailer-stamp.service.ts,
// only-where-NULL) puts it on each load's A/P driver bill and its lines. Metadata only — no amount, account, status or JE.
// Rule 53: ONE transaction for the whole batch (all or nothing); per-load only because the trailer engine is per load.
// Refuses unless exactly these 4 loads have no trailer yet and the stamp adds exactly 4 A/P bill trailers.
//   default          DRY RUN (one transaction, rolled back)
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth AUTH-NNN   apply on production (assertIsIntendedProduction + verify-owner-authorization)
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-134-trailer-picks.mts [--fork-commit | --apply --auth AUTH-NNN]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { applyTrailerChoice, resolveTrailerChoice } from "../../apps/backend/src/dispatch/load-trailer-choice.ts";
import { stampDriverBillTrailersFromLoads } from "../../apps/backend/src/accounting/bill-trailer-stamp.service.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PICKS: Array<{ load: string; trailer: string; by: string }> = [
  { load: "13498", trailer: "538306", by: "owner 16:19 CT" },
  { load: "13520", trailer: "10222", by: "owner 16:19 CT" },
  { load: "13525", trailer: "10380", by: "owner 16:19 CT" },
  { load: "13562", trailer: "10870", by: "Lead 443.134 #4 under the owner's 'use logic' rule (truck T152 ran 10870 on its 5 prior loads)" },
];
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
if (APPLY) await assertIsIntendedProduction(db, { label: "443.134 trailer picks" });
else if (FORK) await assertNotProduction(db, { label: "443.134 trailer picks (fork)" });

const NO_TRAILER_AP_SQL = `
  SELECT count(*)::int AS n FROM accounting.bills b
   WHERE b.operating_company_id = $1::uuid AND b.bill_category = 'driver' AND b.voided_at IS NULL AND b.revoked_at IS NULL
     AND b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL`;

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = (await db.query<{ n: number }>(NO_TRAILER_AP_SQL, [USMCA])).rows[0]!.n;
  for (const p of PICKS) {
    const load = (await db.query<{ id: string; source: string | null; asg: string | null }>(
      `SELECT l.id::text, l.trailer_source::text AS source,
              (SELECT h.new_trailer_id::text FROM dispatch.load_assignment_history h WHERE h.load_id = l.id AND h.new_trailer_id IS NOT NULL LIMIT 1) AS asg
         FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.load_number = $2`, [USMCA, p.load])).rows;
    if (load.length !== 1) throw new Error(`REFUSE: load ${p.load} not found exactly once`);
    if (load[0]!.source || load[0]!.asg) throw new Error(`REFUSE: load ${p.load} already has a trailer choice — re-measure`);
    const eq = (await db.query<{ id: string }>(
      `SELECT id::text FROM mdata.equipment WHERE equipment_number = $1 AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid AND deactivated_at IS NULL`,
      [p.trailer, USMCA])).rows;
    if (eq.length !== 1) throw new Error(`REFUSE: trailer ${p.trailer} is not exactly one active USMCA trailer`);
    const resolved = await resolveTrailerChoice(db as never, USMCA, { kind: "company", equipment_id: eq[0]!.id });
    if (!resolved.ok) throw new Error(`REFUSE: load ${p.load}: ${resolved.refusal.error}`);
    const rec = await applyTrailerChoice(db as never, { operatingCompanyId: USMCA, loadId: load[0]!.id, actorUserId: OWNER, choice: resolved.choice, assignmentMethod: "manual_reassign" });
    await appendCrudAudit(db as never, OWNER, "dispatch.load.trailer_choice_recorded", {
      resource_type: "mdata.loads", resource_id: load[0]!.id, operating_company_id: USMCA, load_number: p.load,
      trailer_source: rec.trailer_source, equipment_id: rec.equipment_id, trailer_number: p.trailer, picked_by: p.by,
      authorization: auth || (FORK ? "fork-rehearsal" : "dry-run"),
    }, "info", "443.134-4");
    console.log(`${p.load}  trailer ${p.trailer}  recorded ${rec.trailer_source}`);
  }
  const stamp = await stampDriverBillTrailersFromLoads(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, actorRole: "Owner", dryRun: false });
  console.log(`stamp: bills_changed ${stamp.bills_changed}, header_stamps ${stamp.header_stamps}, line_stamps ${stamp.line_stamps}, refused ${stamp.refused_bills}`);
  const after = (await db.query<{ n: number }>(NO_TRAILER_AP_SQL, [USMCA])).rows[0]!.n;
  console.log(`read-back: A/P driver bills without a trailer ${before} -> ${after}`);
  if (stamp.header_stamps !== 4 || after !== 0) throw new Error(`REFUSE: expected 4 header stamps and 0 left (got ${stamp.header_stamps}, ${after}) — rolled back`);
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
