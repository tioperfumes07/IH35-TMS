#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["trailer","picker_law","reverse_link","connectivity"],"leafRe":"^(accidents\\.(list|create)|damage_reports\\.(list|create)|trailer_interchanges\\.list|idvr\\.list|dot_inspections\\.(list|create)|cargo_claims\\.list)$","task":"LINK-F5163-SAFETY-TRAILER-INCIDENTS"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): accidents.create captures a real
 * trailer_id via AccidentReportDrawer.tsx's EntityPicker. accidents.list + idvr.list +
 * dot_inspections.list/create + cargo_claims.list must filter + show Trailer so reverse deep-links
 * ?trailer_id= seed a visible filter (LINK-F5171 / LST-F5163C / LST-F5163D).
 * damage_reports / trailer_interchanges share SafetyIncidentsClusterSurface.
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
  idvrList: "apps/frontend/src/pages/safety/IdvrPage.tsx",
  cluster: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
  interchanges: "apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx",
  dotInspections: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
  dotInspectionsApi: "apps/backend/src/routes/safety/dot-inspections.ts",
  cargoClaims: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
};
const LABEL = "verify-safety-trailer-incident-wiring";

/** Reverse ?trailer_id= seed — legacy setTrailerFilter* or staged applied.trailerId. */
function seedsTrailerFromUrl(src) {
  return (
    /setTrailerFilter(?:State)?\(trailerIdFromUrl\)/.test(src) ||
    /trailerId:\s*trailerIdFromUrl/.test(src) ||
    /\{\s*trailerId:\s*trailerIdFromUrl\s*\}/.test(src)
  );
}

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
  if (!/trailerIdFromUrl/.test(src.accidentsList) || !seedsTrailerFromUrl(src.accidentsList)) {
    failures.push(`${FILES.accidentsList}: ?trailer_id= reverse deep-link must seed trailerFilter`);
  }
  if (!/dataTestId="idvr-filter-trailer"/.test(src.idvrList)) {
    failures.push(`${FILES.idvrList}: DVIR list must render EntityPicker trailer filter (idvr-filter-trailer)`);
  }
  if (!/kind="trailer"/.test(src.idvrList) || !/key:\s*"trailer_id"/.test(src.idvrList)) {
    failures.push(`${FILES.idvrList}: DVIR list must show Trailer column EntityLink kind=trailer`);
  }
  if (!seedsTrailerFromUrl(src.idvrList)) {
    failures.push(`${FILES.idvrList}: ?trailer_id= reverse deep-link must seed trailerFilter`);
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
  // LST-F5163C — DOT inspections create + list reverse
  if (!/data-testid="dot-inspection-trailer-picker"/.test(src.dotInspections)) {
    failures.push(`${FILES.dotInspections}: create must render EntityPicker trailer (dot-inspection-trailer-picker)`);
  }
  if (!/trailer_id:\s*form\.trailer_id \|\| undefined/.test(src.dotInspections)) {
    failures.push(`${FILES.dotInspections}: create submit must send trailer_id`);
  }
  if (!/dataTestId="dot-inspections-trailer-filter"/.test(src.dotInspections)) {
    failures.push(`${FILES.dotInspections}: list must render EntityPicker trailer filter`);
  }
  if (!/key:\s*"trailer_id"/.test(src.dotInspections) || !/kind="trailer"/.test(src.dotInspections)) {
    failures.push(`${FILES.dotInspections}: list must show Trailer EntityLink column`);
  }
  if (!seedsTrailerFromUrl(src.dotInspections)) {
    failures.push(`${FILES.dotInspections}: ?trailer_id= reverse deep-link must seed trailerFilter`);
  }
  if (!/trailer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\),\n\s*inspector_name:/.test(src.dotInspectionsApi)) {
    failures.push(`${FILES.dotInspectionsApi}: create body schema must accept trailer_id`);
  }
  if (!/unit_id, trailer_id, inspection_date/.test(src.dotInspectionsApi)) {
    failures.push(`${FILES.dotInspectionsApi}: INSERT must write trailer_id as a bound parameter`);
  }
  if ((src.dotInspectionsApi.match(/body\.data\.trailer_id \?\? null/g) || []).length < 2) {
    failures.push(`${FILES.dotInspectionsApi}: integrity check + INSERT must both bind body.data.trailer_id`);
  }
  if (!/LEFT JOIN mdata\.equipment tr/.test(src.dotInspectionsApi)) {
    failures.push(`${FILES.dotInspectionsApi}: list must join mdata.equipment for trailer_number`);
  }
  // LST-F5163D — cargo claims list reverse
  if (!/dataTestId=\{`\$\{pageTestId\}-trailer-filter`\}/.test(src.cargoClaims) && !/dataTestId="[^"]*-trailer-filter"/.test(src.cargoClaims)) {
    failures.push(`${FILES.cargoClaims}: list must render EntityPicker trailer filter (*-trailer-filter)`);
  }
  if (!/key:\s*"trailer_id"/.test(src.cargoClaims) || !/kind="trailer"/.test(src.cargoClaims)) {
    failures.push(`${FILES.cargoClaims}: list must show Trailer EntityLink column`);
  }
  if (!seedsTrailerFromUrl(src.cargoClaims)) {
    failures.push(`${FILES.cargoClaims}: ?trailer_id= reverse deep-link must seed trailerFilter`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    accident: fs.readFileSync(path.join(root, FILES.accident), "utf8"),
    accidentsList: fs.readFileSync(path.join(root, FILES.accidentsList), "utf8"),
    idvrList: fs.readFileSync(path.join(root, FILES.idvrList), "utf8"),
    cluster: fs.readFileSync(path.join(root, FILES.cluster), "utf8"),
    interchanges: fs.readFileSync(path.join(root, FILES.interchanges), "utf8"),
    dotInspections: fs.readFileSync(path.join(root, FILES.dotInspections), "utf8"),
    dotInspectionsApi: fs.readFileSync(path.join(root, FILES.dotInspectionsApi), "utf8"),
    cargoClaims: fs.readFileSync(path.join(root, FILES.cargoClaims), "utf8"),
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
    ["list-seed", "accidentsList", /trailerId:\s*trailerIdFromUrl/g, "trailerId: unitIdFromUrl"],
    ["idvr-filter", "idvrList", /dataTestId="idvr-filter-trailer"/, 'dataTestId="idvr-filter-unit"'],
    ["idvr-column", "idvrList", /key:\s*"trailer_id"/, 'key: "unit_id"'],
    ["idvr-seed", "idvrList", /trailerId:\s*trailerIdFromUrl/g, "trailerId: unitIdFromUrl"],
    ["cluster-kind", "cluster", /kind="trailer"/g, 'kind="unit"'],
    ["cluster-required-check", "cluster", /requiredExtraFields\.includes\("trailer_id"\)/g, "false"],
    ["interchanges-required", "interchanges", /requiredExtraFields:\s*\["trailer_id"\]/, "requiredExtraFields: []"],
    ["dot-create-picker", "dotInspections", /data-testid="dot-inspection-trailer-picker"/, 'data-testid="dot-inspection-unit-picker"'],
    ["dot-create-submit", "dotInspections", /trailer_id:\s*form\.trailer_id \|\| undefined/, "unit_id: form.unit_id || undefined"],
    ["dot-list-filter", "dotInspections", /dataTestId="dot-inspections-trailer-filter"/, 'dataTestId="dot-inspections-filter-unit"'],
    ["dot-list-seed", "dotInspections", /trailerId:\s*trailerIdFromUrl/g, "trailerId: unitIdFromUrl"],
    ["dot-api-schema", "dotInspectionsApi", /trailer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\),\n\s*inspector_name:/, "inspector_name:"],
    ["dot-api-insert", "dotInspectionsApi", /unit_id, trailer_id, inspection_date/, "unit_id, inspection_date"],
    ["dot-api-bind", "dotInspectionsApi", /body\.data\.trailer_id \?\? null/g, "body.data.unit_id ?? null"],
    ["dot-api-join", "dotInspectionsApi", /LEFT JOIN mdata\.equipment tr/, "LEFT JOIN mdata.units tr"],
    ["cargo-filter", "cargoClaims", /dataTestId=\{`\$\{pageTestId\}-trailer-filter`\}/, 'dataTestId={`${pageTestId}-filter-unit`}'],
    ["cargo-column", "cargoClaims", /key:\s*"trailer_id"/, 'key: "load_id"'],
    ["cargo-seed", "cargoClaims", /trailerId:\s*trailerIdFromUrl/g, "trailerId: unitIdFromUrl"],
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
console.log(`${LABEL} PASS — safety accident/DVIR/DOT/cargo-claim list+create / damage-report / trailer-interchange are trailer-scoped`);
