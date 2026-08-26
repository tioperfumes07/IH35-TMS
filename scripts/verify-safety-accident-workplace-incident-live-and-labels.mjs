#!/usr/bin/env node
/**
 * LST-SAF-F-NO-CREATE-SURFACE
 *
 * `catalog.safety.accident_types` and `catalog.safety.workplace_incident_types` were registered
 * on the backend via the generic-catalog factory (apps/backend/src/catalogs/generic-catalog.routes.ts,
 * real code/display_name/description/is_active/sort_order CRUD, urlSegment "accident-types" /
 * "workplace-incident-types") with zero mounted frontend route -- AllCatalogsMap.tsx (the Lists hub's
 * single source of truth) lists both with `live: true`, which renders a clickable link via
 * buildCatalogPath(domain, catalogKey) -> `/lists/safety/${catalogKey}` -- a real dead click,
 * since no <Route> existed for either path. Fixed by mounting both routes + building a generic
 * flat-catalog list/create page for each (mirroring the driver module's generic factory pattern).
 *
 * Also fixes a `sub` display-label drift on lists.required.json for 7 safety catalogs (both .list
 * and .create leaves): each one's `sub` field held a DIFFERENT catalog's own name (verified against
 * the real live page title in each *ListPage.tsx's BackArrowHeader `title=` prop) -- purely an
 * internal scoreboard-tracking-file inaccuracy, not a live product bug (each real page already
 * renders its own correct title).
 *
 * Self-test: node scripts/verify-safety-accident-workplace-incident-live-and-labels.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-safety-accident-workplace-incident-live-and-labels";
const REQUIRED_JSON = "docs/specs/scoreboard/modules/lists.required.json";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const ALL_CATALOGS_MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const ACCIDENT_PAGE = "apps/frontend/src/pages/lists/safety/AccidentTypesListPage.tsx";
const WORKPLACE_PAGE = "apps/frontend/src/pages/lists/safety/WorkplaceIncidentTypesListPage.tsx";

function read(rel) {
  return fs.readFileSync(rel, "utf8");
}

const CORRECT_SUB = {
  workplace_incident_types: "Workplace Incident Types",
  internal_fine_reasons: "Internal Fine Reasons",
  civil_fine_types: "Civil Fine Types",
  company_violation_types: "Company Violation Types",
  complaint_types: "Complaint Types",
  dot_violation_types: "DOT Violation Types",
  cargo_claim_reasons: "Cargo Claim Reasons",
};

function analyze({ manifest, allCatalogsMap, accidentPage, workplacePage, requiredJson }) {
  const failures = [];

  // 1) Both routes must be mounted.
  if (!/path="\/lists\/safety\/accident-types"/.test(manifest)) {
    failures.push("route /lists/safety/accident-types is not mounted in manifest.tsx");
  }
  if (!/path="\/lists\/safety\/workplace-incident-types"/.test(manifest)) {
    failures.push("route /lists/safety/workplace-incident-types is not mounted in manifest.tsx");
  }

  // 2) Both page components must exist and mount the generic catalog list page (not a stub).
  if (!/SafetyGenericCatalogListPage/.test(accidentPage) || !/AccidentTypesListPage/.test(accidentPage)) {
    failures.push("AccidentTypesListPage.tsx does not mount SafetyGenericCatalogListPage");
  }
  if (!/SafetyGenericCatalogListPage/.test(workplacePage) || !/WorkplaceIncidentTypesListPage/.test(workplacePage)) {
    failures.push("WorkplaceIncidentTypesListPage.tsx does not mount SafetyGenericCatalogListPage");
  }

  // 3) AllCatalogsMap must still claim both live:true (regressing to live:false would silently hide
  //    working functionality instead of fixing the dead click -- the wrong direction).
  if (!/name: "Accident Types", description: "[^"]*", live: true, catalogKey: "accident-types"/.test(allCatalogsMap)) {
    failures.push("AllCatalogsMap.tsx Accident Types entry must stay live:true now that a real route exists");
  }
  if (!/name: "Workplace Incident Types", description: "[^"]*", live: true, catalogKey: "workplace-incident-types"/.test(allCatalogsMap)) {
    failures.push("AllCatalogsMap.tsx Workplace Incident Types entry must stay live:true now that a real route exists");
  }

  // 4) required.json sub labels must match each leaf's own catalog identity.
  let parsed;
  try {
    parsed = JSON.parse(requiredJson);
  } catch (e) {
    failures.push(`lists.required.json is not valid JSON: ${e.message}`);
    return failures;
  }
  const leaves = new Map((parsed.leaves ?? []).map((l) => [l.id, l]));
  for (const [name, label] of Object.entries(CORRECT_SUB)) {
    for (const [suf, expected] of [
      ["list", label],
      ["create", `+ Create — ${label}`],
    ]) {
      const id = `catalog.safety.${name}.${suf}`;
      const leaf = leaves.get(id);
      if (!leaf) {
        failures.push(`${id} missing from lists.required.json`);
        continue;
      }
      if (leaf.sub !== expected) {
        failures.push(`${id} sub is "${leaf.sub}", expected "${expected}"`);
      }
    }
  }

  return failures;
}

function loadInputs() {
  return {
    manifest: read(MANIFEST),
    allCatalogsMap: read(ALL_CATALOGS_MAP),
    accidentPage: read(ACCIDENT_PAGE),
    workplacePage: read(WORKPLACE_PAGE),
    requiredJson: read(REQUIRED_JSON),
  };
}

if (process.argv.includes("--selftest")) {
  const inputs = loadInputs();
  const baseline = analyze(inputs);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "drop the accident-types route",
      inputs: { ...inputs, manifest: inputs.manifest.replace('path="/lists/safety/accident-types"', 'path="/lists/safety/accident-types-x"') },
    },
    {
      name: "drop the workplace-incident-types route",
      inputs: { ...inputs, manifest: inputs.manifest.replace('path="/lists/safety/workplace-incident-types"', 'path="/lists/safety/workplace-incident-types-x"') },
    },
    {
      name: "regress AllCatalogsMap accident-types to live:false",
      inputs: { ...inputs, allCatalogsMap: inputs.allCatalogsMap.replace('catalogKey: "accident-types"', 'catalogKey: "accident-types-x"') },
    },
    {
      name: "revert one sub label to the pre-fix wrong value",
      inputs: {
        ...inputs,
        requiredJson: inputs.requiredJson.replace(
          '"sub": "Workplace Incident Types"',
          '"sub": "Accident Types"'
        ),
      },
    },
  ];

  let caught = 0;
  for (const m of mutations) {
    const failures = analyze(m.inputs);
    if (failures.length > 0) caught += 1;
    else console.error(`SELFTEST FAIL — mutation "${m.name}" was NOT caught`);
  }
  if (caught !== mutations.length) {
    console.error(`[${LABEL}] selftest: ${caught}/${mutations.length} mutations caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: ${caught}/${mutations.length} mutations caught`);
  process.exit(0);
}

const failures = analyze(loadInputs());
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: accident-types + workplace-incident-types routes are live, and all 7 safety catalogs' sub labels match their own identity`);
