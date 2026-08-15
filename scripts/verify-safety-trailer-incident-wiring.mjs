#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["trailer","picker_law","reverse_link","connectivity"],"leafRe":"^(accidents\\.(list|create)|damage_reports\\.(list|create)|trailer_interchanges\\.list)$","task":"LINK-F5163-SAFETY-TRAILER-INCIDENTS"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): accidents.create captures a real
 * trailer_id via AccidentReportDrawer.tsx's EntityPicker. accidents.list must filter + show Trailer
 * (EntityPicker allowCreate=false + EntityLink) so reverse deep-links ?trailer_id= seed a visible
 * filter (LINK-F5171). damage_reports / trailer_interchanges share SafetyIncidentsClusterSurface.
 *
 * Self-test: node scripts/verify-safety-trailer-incident-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  accident: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  accidentsList: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  cluster: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
  interchanges: "apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx",
};
const LABEL = "verify-safety-trailer-incident-wiring";

export function audit(src) {
  const failures = [];
  if (!/trailer_id:\s*trailerId \|\| null/.test(src.accident)) {
    failures.push(`${FILES.accident}: accident create must submit a real trailer_id`);
  }
  if (!/dataTestId="accidents-trailer-filter"/.test(src.accidentsList)) {
    failures.push(`${FILES.accidentsList}: list must render EntityPicker trailer filter (accidents-trailer-filter)`);
  }
  if (!/kind="trailer"/.test(src.accidentsList) || !/key:\s*"trailer_id"/.test(src.accidentsList)) {
    failures.push(`${FILES.accidentsList}: list must show Trailer column EntityLink kind=trailer`);
  }
  if (!/trailerIdFromUrl/.test(src.accidentsList) || !/setTrailerFilter\(trailerIdFromUrl\)/.test(src.accidentsList)) {
    failures.push(`${FILES.accidentsList}: ?trailer_id= reverse deep-link must seed trailerFilter`);
  }
  if (!/kind="trailer"/.test(src.cluster)) {
    failures.push(`${FILES.cluster}: damage-report/trailer-interchange surface must render a real kind="trailer" picker/link`);
  }
  if (!/requiredExtraFields\.includes\("trailer_id"\)/.test(src.cluster)) {
    failures.push(`${FILES.cluster}: must honor a real per-config required trailer_id field`);
  }
  if (!/requiredExtraFields:\s*\["trailer_id"\]/.test(src.interchanges)) {
    failures.push(`${FILES.interchanges}: trailer interchanges must mark trailer_id as required (it's the whole point of the leaf)`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    accident: fs.readFileSync(path.join(root, FILES.accident), "utf8"),
    accidentsList: fs.readFileSync(path.join(root, FILES.accidentsList), "utf8"),
    cluster: fs.readFileSync(path.join(root, FILES.cluster), "utf8"),
    interchanges: fs.readFileSync(path.join(root, FILES.interchanges), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["accident-submit", "accident", /trailer_id:\s*trailerId \|\| null/, "trailer_id: null"],
    ["list-filter", "accidentsList", /dataTestId="accidents-trailer-filter"/, 'dataTestId="accidents-unit-filter"'],
    ["list-column", "accidentsList", /key:\s*"trailer_id"/, 'key: "unit_id"'],
    ["list-seed", "accidentsList", /setTrailerFilter\(trailerIdFromUrl\)/, "setUnitFilter(trailerIdFromUrl)"],
    ["cluster-kind", "cluster", /kind="trailer"/g, 'kind="unit"'],
    ["cluster-required-check", "cluster", /requiredExtraFields\.includes\("trailer_id"\)/g, "false"],
    ["interchanges-required", "interchanges", /requiredExtraFields:\s*\["trailer_id"\]/, "requiredExtraFields: []"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety accident list+create / damage-report / trailer-interchange are trailer-scoped`);
