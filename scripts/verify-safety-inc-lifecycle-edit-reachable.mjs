#!/usr/bin/env node
/**
 * SAF-INC-LIFECYCLE — Damage Reports / Trailer Interchanges detail must be editable after create.
 *
 * verify-incident-lifecycle (1342) locks routes + formEditable plumbing, but main still shipped
 * editMode with no operator path into it: setEditMode(true) was never called, Save lived inside
 * editMode with a partial PATCH (location/description/amount only), and location/description
 * inputs stayed bound to `detail` while onChange wrote `selected` — edits looked broken even if
 * editMode were toggled manually.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const LABEL = "verify-safety-inc-lifecycle-edit-reachable";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertSafetyIncLifecycleEditReachable(source) {
  const src = stripComments(source ?? read(SURFACE));
  const problems = [];

  if (!/\$\{config\.pageTestId\}-edit-btn/.test(src)) {
    problems.push(`${SURFACE}: no Edit control — editMode exists but operators cannot enter it.`);
  }
  if (!/setEditMode\(true\)/.test(src)) {
    problems.push(`${SURFACE}: setEditMode(true) is never called — detail stays read-only after create.`);
  }
  if (!/\$\{config\.pageTestId\}-save-edit-btn/.test(src)) {
    problems.push(`${SURFACE}: no Save changes control for existing records.`);
  }
  if (!/updateSafetyIncident/.test(src)) {
    problems.push(`${SURFACE}: does not call updateSafetyIncident — PATCH route stays unreachable from detail.`);
  }
  if (!/driver_id: str\(selected\.driver_id\)/.test(src) || !/unit_id: str\(selected\.unit_id\)/.test(src)) {
    problems.push(`${SURFACE}: save path omits driver_id/unit_id — wrong unit or driver could not be corrected.`);
  }
  if (!/formEditable \? selected\?\.location : detail\?\.location/.test(src)) {
    problems.push(`${SURFACE}: location input is not bound to selected while editing — typed edits do not stick.`);
  }
  if (!/formEditable \? selected\?\.description : detail\?\.description/.test(src)) {
    problems.push(`${SURFACE}: description input is not bound to selected while editing — typed edits do not stick.`);
  }
  if (/disabled=\{!createMode\}/.test(src)) {
    problems.push(`${SURFACE}: still has disabled={!createMode} — a field is permanently read-only after create.`);
  }
  if (!/-lifecycle/.test(src)) {
    problems.push(`${SURFACE}: no lifecycle panel — status/close path missing from detail drawer.`);
  }
  if (!/-status-reason/.test(src)) {
    problems.push(`${SURFACE}: status change collects no reason — server requires one.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = read(SURFACE);
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertSafetyIncLifecycleEditReachable(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("edit-btn-removed", live.replace("${config.pageTestId}-edit-btn", "${config.pageTestId}-nope-btn"), "Edit control");
  expectCaught("edit-mode-never-set", live.replace("setEditMode(true)", "setEditMode(false)"), "setEditMode(true)");
  expectCaught("location-bound-to-detail", live.replace(
    "formEditable ? selected?.location : detail?.location",
    "detail?.location"
  ), "location input is not bound to selected");
  expectCaught("partial-patch-only", live.replaceAll("driver_id: str(selected.driver_id)", "// driver_id removed"), "driver_id/unit_id");

  const liveProblems = assertSafetyIncLifecycleEditReachable(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyIncLifecycleEditReachable();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — incident detail exposes Edit → Save (full PATCH) and reasoned status lifecycle`);
