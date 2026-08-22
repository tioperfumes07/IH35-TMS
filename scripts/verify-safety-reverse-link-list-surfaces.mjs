#!/usr/bin/env node
/**
 * Safety reverse_link — leaf-specific Built for list/detail surfaces with EntityLink.
 * Create-only modals/pages honesty-dropped in required.json. Lists without EntityLink stay Gap (WIRE).
 *
 * @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["training_records.list","hos.list","hos_violations.list","internal_fines.list","damage_reports.list","trailer_interchanges.list","cargo_claims.list","driver_files.list","safety.drawer.accident_report","safety.parity.accident_report","safety.drawer.fine_detail","safety.parity.fine_detail","safety.drawer.anomaly_detail","safety.parity.anomaly_detail","safety.drawer.company_violation_detail","safety.parity.company_violation_detail","safety.drawer.integrity_alert_detail","safety.parity.integrity_alert_detail"],"task":"SAF-F5893-REVERSE-LIST-SURFACES-EXACT","vertical":"class-sweep"}
 *
 * Self-test: node scripts/verify-safety-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-reverse-link-list-surfaces";
const MATRIX = "docs/specs/scoreboard/modules/safety.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-safety-reverse-link-list-surfaces.mjs";
const HEADER = ' * @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["training_records.list","hos.list","hos_violations.list","internal_fines.list","damage_reports.list","trailer_interchanges.list","cargo_claims.list","driver_files.list","safety.drawer.accident_report","safety.parity.accident_report","safety.drawer.fine_detail","safety.parity.fine_detail","safety.drawer.anomaly_detail","safety.parity.anomaly_detail","safety.drawer.company_violation_detail","safety.parity.company_violation_detail","safety.drawer.integrity_alert_detail","safety.parity.integrity_alert_detail"],"task":"SAF-F5893-REVERSE-LIST-SURFACES-EXACT","vertical":"class-sweep"}';

const CHECKS = [
  { name: "TrainingRecords driver drill", file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx", pattern: /<EntityLink kind="driver" id=\{id\} label=\{entityLabel\(driverName, id, "Driver"\)\}/ },
  { name: "HoursOfService driver drill", file: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx", pattern: /<EntityLink kind="driver" id=\{row\.driverId\} label=\{entityLabel\(row\.driverName, row\.driverId, "Driver"\)\}/ },
  { name: "HOS violations driver/load drills", file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", pattern: /kind="driver" id=\{row\.driver_id as string \| undefined\}[\s\S]{0,300}kind="load" id=\{row\.related_load_id as string \| undefined\}/ },
  { name: "Internal fines driver/liability drills", file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx", pattern: /kind="driver"[\s\S]{0,120}id=\{row\.driver_id as string \| undefined\}[\s\S]{0,700}kind="liability" id=\{String\(row\.driver_liability_id\)\}/ },
  { name: "Accident drawer claim/liability/work-order drills", file: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx", pattern: /kind="claim"[\s\S]*id=\{accident\.claim_id\}[\s\S]*kind="liability"[\s\S]*id=\{accident\.spawned_liability_id\}[\s\S]*kind="work_order"[\s\S]*id=\{wo\.id\}/ },
  { name: "Fine drawer driver/unit/load/liability/JE drills", file: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx", pattern: /kind="driver"[\s\S]*id=\{String\(fine\.subject_driver_id\)\}[\s\S]*kind="unit"[\s\S]*kind="load"[\s\S]*kind="liability"[\s\S]*kind="journal_entry"/ },
  { name: "Anomaly drawer subject drill", file: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx", pattern: /<EntityLink[\s\S]{0,100}kind=\{anomaly\.subject_type\}[\s\S]{0,100}id=\{anomaly\.subject_id\}/ },
  { name: "Incident cluster deep-link and driver/unit/trailer drills", file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", pattern: /searchParams\.get\("incident_id"\)[\s\S]{0,900}setDrawerOpen\(true\)[\s\S]{0,9000}kind="driver"[\s\S]{0,500}kind="unit"[\s\S]{0,900}kind="trailer"/ },
  { name: "DriverFiles training driver drill", file: "apps/frontend/src/pages/safety/components/TrainingTable.tsx", pattern: /<EntityLink[\s\S]{0,100}kind="driver"[\s\S]{0,100}id=\{row\.driver_id \? String\(row\.driver_id\) : undefined\}/ },
  { name: "Company violation driver/unit drills", file: "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx", pattern: /<EntityLink kind="driver" id=\{driverId\}[\s\S]*<EntityLink kind="unit" id=\{unitId\}/ },
  { name: "Integrity alert driver/unit/vendor/load/work-order drills", file: "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx", pattern: /kind="driver"[\s\S]*kind="unit"[\s\S]*kind="vendor"[\s\S]*kind="load"[\s\S]*kind="work_order"/ },
];

const EXACT_LEAVES = [
  ["training_records.list", "/safety/training/records"], ["hos.list", "/safety/hos"],
  ["hos_violations.list", "/safety/hos-violations"], ["internal_fines.list", "/safety/internal-fines"],
  ["damage_reports.list", "/safety/damage-reports"], ["trailer_interchanges.list", "/safety/trailer-interchanges"],
  ["cargo_claims.list", "/safety/cargo-claims"], ["driver_files.list", "/safety/driver-files"],
  ["safety.drawer.accident_report", "surface://components/safety/AccidentReportDrawer.tsx"],
  ["safety.parity.accident_report", "surface://components/safety/AccidentReportDrawer.tsx"],
  ["safety.drawer.fine_detail", "surface://pages/safety/components/FineDetailDrawer.tsx"],
  ["safety.parity.fine_detail", "surface://pages/safety/components/FineDetailDrawer.tsx"],
  ["safety.drawer.anomaly_detail", "surface://pages/safety/tabs/AnomalyDetailDrawer.tsx"],
  ["safety.parity.anomaly_detail", "surface://pages/safety/tabs/AnomalyDetailDrawer.tsx"],
  ["safety.drawer.company_violation_detail", "surface://pages/safety/components/CompanyViolationDetailDrawer.tsx"],
  ["safety.parity.company_violation_detail", "surface://pages/safety/components/CompanyViolationDetailDrawer.tsx"],
  ["safety.drawer.integrity_alert_detail", "surface://pages/safety/components/IntegrityAlertDetailDrawer.tsx"],
  ["safety.parity.integrity_alert_detail", "surface://pages/safety/components/IntegrityAlertDetailDrawer.tsx"],
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

function evidence(source = {
  matrix: fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
  feed: fs.readFileSync(path.join(ROOT, FEED), "utf8"),
  self: fs.readFileSync(path.join(ROOT, SELF), "utf8"),
}) {
  const failures = [];
  let matrix;
  try { matrix = JSON.parse(source.matrix); } catch (error) { failures.push(`Safety matrix must parse: ${error.message}`); }
  for (const [id, route] of EXACT_LEAVES) {
    const leaf = matrix?.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("reverse_link")) failures.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  const annotationBlock = source.self.split('import fs from "node:fs";')[0];
  if (!annotationBlock.includes(HEADER)) failures.push("exact 18-leaf Safety matrix header must remain present");
  try {
    const feed = JSON.parse(source.feed);
    if (feed.entries?.some((entry) => entry.guard === SELF)) failures.push("manual feed must not duplicate exact in-guard ownership");
  } catch (error) { failures.push(`wire sprint feed must parse: ${error.message}`); }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".safety-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  const source = {
    matrix: fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
    feed: fs.readFileSync(path.join(ROOT, FEED), "utf8"),
    self: fs.readFileSync(path.join(ROOT, SELF), "utf8"),
  };
  if (evidence(source).length) throw new Error(`live evidence failed: ${evidence(source).join("; ")}`);
  for (const [id, route] of EXACT_LEAVES) {
    const idToken = `"id": "${id}"`;
    const start = source.matrix.indexOf(idToken);
    const end = source.matrix.indexOf("\n    {", start + idToken.length);
    const block = source.matrix.slice(start, end < 0 ? source.matrix.length : end);
    for (const [token, replacement] of [
      [idToken, `"id": "${id}.broken"`], ['"reverse_link"', '"reverse_link_broken"'],
      [`"route_hint": "${route}"`, '"route_hint": "broken"'],
    ]) {
      if (!block.includes(token)) throw new Error(`matrix fixture missing: ${id} ${token}`);
      const changed = source.matrix.slice(0, start) + block.replace(token, replacement) + source.matrix.slice(end < 0 ? source.matrix.length : end);
      if (!evidence({ ...source, matrix: changed }).length) throw new Error(`matrix mutation survived: ${id} ${token}`);
    }
  }
  const brokenHeader = HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"');
  if (!evidence({ ...source, self: source.self.replace(HEADER, brokenHeader) }).length) throw new Error("header mutation survived");
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ guard: SELF, modules: ["safety"], cols: ["reverse_link"], leafRe: ".*" });
  if (!evidence({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log(`${LABEL} SELFTEST PASS (56 exact evidence mutations)`);
  process.exit(0);
}

const fails = [...run(), ...evidence()];
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety reverse_link list surfaces ratcheted`);
