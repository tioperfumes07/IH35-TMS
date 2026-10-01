#!/usr/bin/env node
// ROUND 305 B-50: "EVERY FLAG CARRIES ITS EVIDENCE AND ITS PERIOD ... A score with no visible
// arithmetic is an accusation, not a metric."  B-51: complaints are their own named component.
//
// --selftest (no DB): scoreProfile() is a count a reader can verify — findings/suspicions/observed/
//   insufficient — never a weighted blend; its arithmetic names the components it counted.
// live: on USMCA, FAILS if any B-28 fuel flag lacks period_start/period_end, arithmetic or at least
//   one evidence fill; if any profile component lacks arithmetic or basis; if a complaint with no
//   recorded_by user is ever counted; or if a profile's score disagrees with its own components.
import pg from "pg";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-driver-integrity-profile-evidence";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const mod = (p) => import(new URL(`../../apps/backend/src/maintenance/${p}`, import.meta.url));

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { scoreProfile } = await mod("driver-integrity-profile.service.ts");
  const c = (component, status) => ({ component, status, arithmetic: "x", basis: "x", evidence: [] });
  const s = scoreProfile([c("fuel", "suspicion"), c("damage", "none"), c("complaints", "observed"), c("tire_events", "insufficient_data")]);
  assert.deepEqual([s.findings, s.suspicions, s.observed, s.insufficient], [0, 1, 1, 1]);
  assert.match(s.arithmetic, /suspicion \(fuel\)/);
  assert.match(s.arithmetic, /No weighted total/, "the score must state it is not a weighted blend");
  assert.equal(scoreProfile([c("fuel", "finding")]).findings, 1);
  console.log(`${LABEL} --selftest PASS (4/4)`);
}

if (process.argv.includes("--selftest")) {
  await selftest();
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
// CI's verify:pre-commit runs verify-steps against a fresh, empty database: without the USMCA row
// there is nothing production-shaped to measure, so only the offline proof runs, and it says so.
const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
if (probe.rows.length === 0) {
  await client.end();
  await selftest();
  console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
  process.exit(0);
}

const { computeDriverFuelScorecard } = await mod("fuel-driver-scorecard.service.ts");
const { computeDriverIntegrityProfiles, scoreProfile } = await mod("driver-integrity-profile.service.ts");
let scorecard;
let profiles;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const end = new Date().toISOString();
  // Wide window on purpose: the card-fill feed currently ends 2026-09-11, so a trailing 30 days
  // would hold no flags and prove nothing.
  const start = "2026-07-01T00:00:00Z";
  scorecard = await computeDriverFuelScorecard(client, USMCA, start, end);
  profiles = await computeDriverIntegrityProfiles(client, USMCA, start, end);
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const problems = [];
let flagCount = 0;
for (const row of scorecard) {
  for (const f of row.flags) {
    flagCount += 1;
    if (!f.period_start || !f.period_end) problems.push(`${row.driver_id} ${f.kind}: no period`);
    if (!f.arithmetic) problems.push(`${row.driver_id} ${f.kind}: no arithmetic`);
    if (!Array.isArray(f.evidence_fills) || f.evidence_fills.length === 0) problems.push(`${row.driver_id} ${f.kind}: no evidence fills`);
  }
}
let complaintsSeen = 0;
let complaintsExcluded = 0;
for (const p of profiles) {
  for (const c of p.components) {
    if (!c.arithmetic || !c.basis) problems.push(`${p.driver_id} ${c.component}: missing arithmetic/basis`);
    if (c.component === "complaints") {
      for (const e of c.evidence) {
        complaintsSeen += 1;
        if (!e.recorded_by_user_id && e.counted) problems.push(`${p.driver_id} complaint ${e.complaint_id}: counted with no recorded_by`);
        if (!e.counted) complaintsExcluded += 1;
      }
    }
  }
  const again = scoreProfile(p.components);
  if (JSON.stringify(again) !== JSON.stringify(p.score)) problems.push(`${p.driver_id}: score disagrees with its components`);
}
if (problems.length > 0) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
const sum = (k) => profiles.reduce((a, p) => a + p.score[k], 0);
console.log(
  `${LABEL}: LIVE PASS — ${flagCount} fuel flag(s), every one with period, arithmetic and evidence fills; ` +
    `${profiles.length} driver profiles, every component with arithmetic and basis; component totals: ` +
    `${sum("findings")} finding, ${sum("suspicions")} suspicion, ${sum("observed")} observed, ${sum("insufficient")} not measurable; ` +
    `complaints against drivers ${complaintsSeen}, ${complaintsExcluded} excluded for no recorded_by.`
);
