#!/usr/bin/env node
// ROUND 305 B-47: "Build the fuel component so it REFUSES to flag a driver on a single signal."
// Owner's standard: two independent signals agreeing is a finding, one alone is a suspicion.
//
// --selftest (no DB): proves the refusal in decideFuelIntegrity() and the attribution mirror
//   driverAtTimeFromWindows() against the SQL predicate's own semantics:
//   - one anomalous signal            -> suspicion, never finding
//   - two anomalous sharing an input  -> suspicion (both MPG signals divide by the same gallons)
//   - two anomalous, disjoint inputs  -> finding
//   - nothing available               -> insufficient_data, never "clear"
//   - window boundary: started_at <= ts < ended_at; latest start, then latest created, wins
// live: runs computeDriverFuelIntegrity() on USMCA and FAILS if any "finding" rests on fewer than
//   two anomalous signals with disjoint sources, or any signal ships an empty arithmetic/reason.
import pg from "pg";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-integrity-two-signal";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const svc = () => import(new URL("../../apps/backend/src/maintenance/fuel-integrity.service.ts", import.meta.url));
const attr = () => import(new URL("../../apps/backend/src/maintenance/driver-attribution.ts", import.meta.url));

const sig = (signal, sources, verdict) => ({ signal, sources, verdict, arithmetic: "x", reason: "x", evidence: [] });

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { decideFuelIntegrity } = await svc();
  const { driverAtTimeFromWindows } = await attr();
  const G = "fuel_card_gallons";

  assert.equal(decideFuelIntegrity([sig("mpg_odometer_snapshot", [G, "snap"], "anomalous"), sig("relay_fill_presence", ["relay", "gps"], "normal")]).status, "suspicion", "one signal must never be a finding");
  assert.equal(decideFuelIntegrity([sig("mpg_odometer_snapshot", [G, "snap"], "anomalous"), sig("mpg_stop_odometer", [G, "stop"], "anomalous")]).status, "suspicion", "two signals sharing gallons are not independent");
  assert.equal(decideFuelIntegrity([sig("mpg_stop_odometer", [G, "stop"], "anomalous"), sig("relay_fill_presence", ["relay", "gps"], "anomalous")]).status, "finding", "two disjoint anomalous signals are a finding");
  assert.equal(decideFuelIntegrity([sig("a", ["x"], "unavailable")]).status, "insufficient_data", "no data must not read as clear");
  assert.equal(decideFuelIntegrity([sig("a", ["x"], "normal"), sig("b", ["y"], "unavailable")]).status, "clear");

  const d = (s) => new Date(s);
  const w = [
    { driverId: "A", startedAt: d("2026-09-01T00:00Z"), endedAt: d("2026-09-02T00:00Z"), createdAt: d("2026-09-01T00:00Z") },
    { driverId: "B", startedAt: d("2026-09-02T00:00Z"), endedAt: null, createdAt: d("2026-09-02T00:00Z") },
    { driverId: "C", startedAt: d("2026-09-02T00:00Z"), endedAt: null, createdAt: d("2026-09-02T01:00Z") },
  ];
  assert.equal(driverAtTimeFromWindows(w, d("2026-09-01T12:00Z")), "A");
  assert.equal(driverAtTimeFromWindows(w, d("2026-09-02T00:00Z")), "C", "ended_at is exclusive; same start -> latest created wins");
  assert.equal(driverAtTimeFromWindows(w, d("2026-08-31T00:00Z")), null, "before any window -> nobody, never a guess");
  console.log(`${LABEL} --selftest PASS (8/8)`);
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
const { computeDriverFuelIntegrity } = await svc();
const client = new pg.Client({ connectionString: url });
await client.connect();
// CI's verify:pre-commit runs every verify-step against a fresh, empty, migrated database. A
// production-data guard has nothing to measure there: when the USMCA company row is absent the
// database is not production-shaped, so only the offline proof runs and it says so.
const usmca = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
if (usmca.rows.length === 0) {
  await client.end();
  await selftest();
  console.log(`DATABASE PHASE: USMCA company absent from this database (fresh CI DB) — selftest only, NOT live proof`);
  process.exit(0);
}
let result;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const end = new Date();
  const start = new Date(end.getTime() - 61 * 86_400_000);
  result = await computeDriverFuelIntegrity(client, USMCA, start.toISOString(), end.toISOString());
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const problems = [];
for (const row of result.rows) {
  for (const s of row.signals) {
    if (!s.arithmetic || !s.reason) problems.push(`${row.driver_id} ${s.signal}: empty arithmetic/reason`);
  }
  if (row.status === "finding") {
    const an = row.signals.filter((s) => s.verdict === "anomalous");
    const ok = an.some((a, i) => an.slice(i + 1).some((b) => !a.sources.some((x) => b.sources.includes(x))));
    if (!ok) problems.push(`${row.driver_id}: finding without two independent anomalous signals`);
  }
}
if (problems.length > 0) {
  console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
  process.exit(1);
}
const count = (st) => result.rows.filter((r) => r.status === st).length;
console.log(
  `${LABEL}: LIVE PASS — ${result.rows.length} drivers over 61 days: ${count("finding")} finding, ${count("suspicion")} suspicion, ` +
    `${count("clear")} clear, ${count("insufficient_data")} insufficient_data. Every finding rests on two anomalous signals with disjoint sources; ` +
    `every signal states its arithmetic and reason. Relay coverage: ${JSON.stringify(result.coverage)}.`
);
