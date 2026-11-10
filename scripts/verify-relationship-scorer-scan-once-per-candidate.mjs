#!/usr/bin/env node
// ACCT-F11126 — the customer relationship scorer runs its company-wide arrival scan only for a customer that has a
// scheduled load stop, so a run finishes and records its success.
//
// Measured on prod 2026-11-10: customers.relationship_score_worker last success 2026-10-25 15:12Z; USMCA scores were written
// at 88 per 15 min (~10 s per customer) for 1,217 customers ≈ 3.5 h per run — longer than the gap between deploys. The
// arrival set (STOP_ARRIVAL_EVENTS_SQL) scans every load-stop fence event of the company (fork EXPLAIN: 64,574 events +
// 18,940 fences, 1.85 s) and ran for every customer; 89 of the 1,217 have a scheduled load stop.
//
// RULE 1 — computeServiceQualitySubscore asks for one scheduled load stop of the customer and returns null without it,
//          BEFORE the arrival scan.
// RULE 2 — the scorer worker still runs USMCA only (ACCT-F11123).
import fs from "node:fs";

const SVC = "apps/backend/src/customers/relationship-score/scorer.service.ts";
const WORKER = "apps/backend/src/jobs/customer-relationship-scorer.ts";

export function audit(files) {
  const out = [];
  const s = files[SVC] ?? "";
  const i = s.indexOf("async function computeServiceQualitySubscore");
  const body = i < 0 ? "" : s.slice(i, s.indexOf("\nasync function ", i + 10));
  if (!body) out.push("RULE 1: computeServiceQualitySubscore missing");
  else {
    const cand = body.indexOf("SELECT 1 AS n");
    const ret = body.indexOf("if (!candidate.rows[0]) return null;");
    const scan = body.indexOf("WITH completed AS");
    if (cand < 0 || ret < 0) out.push("RULE 1: the one-scheduled-stop check (and its early null) is gone");
    else if (scan >= 0 && !(cand < scan && ret < scan)) out.push("RULE 1: the arrival scan runs before the scheduled-stop check");
    if (cand >= 0 && !/l\.customer_id = \$2::uuid/.test(body.slice(cand, ret))) out.push("RULE 1: the scheduled-stop check is not scoped to the customer");
  }
  const w = files[WORKER] ?? "";
  if (!/companies\.rows\.filter\(\(c\) => isLiveEngineCompany\(c\.id\)\)/.test(w)) out.push("RULE 2: the scorer worker no longer runs USMCA only");
  return out;
}

const load = () => ({ [SVC]: fs.readFileSync(SVC, "utf8"), [WORKER]: fs.readFileSync(WORKER, "utf8") });

if (process.argv.includes("--selftest")) {
  const good = load();
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    if (!good[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    return { ...good, [file]: good[file].replace(from, to) };
  };
  const cases = [
    ["early null removed", plant(SVC, "if (!candidate.rows[0]) return null;", "")],
    ["check not customer-scoped", plant(SVC, "AND l.customer_id = $2::uuid\n         AND l.soft_deleted_at IS NULL\n         AND COALESCE", "AND l.soft_deleted_at IS NULL\n         AND COALESCE")],
    ["worker back to every company", plant(WORKER, "companies.rows.filter((c) => isLiveEngineCompany(c.id))", "companies.rows")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-relationship-scorer-scan-once-per-candidate: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load());
if (failures.length) {
  console.error("verify-relationship-scorer-scan-once-per-candidate FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-relationship-scorer-scan-once-per-candidate: PASS — arrival scan only for a customer with a scheduled stop; USMCA only");
