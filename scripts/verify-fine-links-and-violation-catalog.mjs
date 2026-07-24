#!/usr/bin/env node
/**
 * GUARD: fines carry their load/unit links, and company violations carry their catalog FK.
 *
 * WHY THIS EXISTS (2026-07-23 audit — SAF-F19, SAF-F15)
 *
 * F19: `safety.civil_fines` has carried `related_load_id`, `related_unit_id` and `source_doc_id`
 * since migration 0050, and POST /api/v1/safety/fines ALREADY accepted all three. The creator simply
 * never asked for them and the detail drawer never showed them, so every fine ever created landed
 * with those FKs null — an overweight ticket could not be traced to the truck or the trip that
 * earned it. The columns and the route were fine; the UI was the whole defect.
 *
 * F15: `safety.company_violations.violation_type_uuid` is the FK to
 * `catalogs.company_violation_types`, and the create route never set it. That is not cosmetic:
 * `company-violations.service.ts` resolves the default fine amount FROM that FK, so with it null the
 * catalogued amount can never resolve and the flow falls through to E_VIOLATION_AMOUNT_REQUIRED.
 * The creator offered a hardcoded `<option>` list instead of the real catalog.
 *
 * Also pinned: the "+ Add new" on that picker must open an INLINE mini-create, not a link out to the
 * catalog page. Linking out mid-create discards everything already typed — that was the exact
 * SAF-F24 defect, and I reached for the same shortcut here before catching it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINE_CREATE = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const FINE_DRAWER = "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx";
const FINE_ROUTES = "apps/backend/src/safety/fines.routes.ts";
const VIOLATION_MODAL = "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx";
const VIOLATION_ROUTES = "apps/backend/src/safety/company-violations.routes.ts";
const FILES = [FINE_CREATE, FINE_DRAWER, FINE_ROUTES, VIOLATION_MODAL, VIOLATION_ROUTES];
const LABEL = "verify-fine-links-and-violation-catalog";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertFineLinksAndViolationCatalog(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  // --- F19: the creator collects the links and sends them ---
  for (const field of ["related_load_id", "related_unit_id"]) {
    if (!src[FINE_CREATE].includes(field)) {
      problems.push(`${FINE_CREATE}: does not send ${field} — the column and the route both accept it, so every fine would be created with that FK null.`);
    }
  }
  if (!/relatedUnitId/.test(src[FINE_CREATE]) || !/relatedLoadId/.test(src[FINE_CREATE])) {
    problems.push(`${FINE_CREATE}: no unit/load picker state — the fields cannot be collected.`);
  }

  // --- F19: the drawer shows them, as real drill-throughs ---
  if (!/kind="unit"/.test(src[FINE_DRAWER]) || !/related_unit_id/.test(src[FINE_DRAWER])) {
    problems.push(`${FINE_DRAWER}: the related unit is not rendered as an EntityLink kind="unit" — persisted but invisible is still a linkage failure.`);
  }
  if (!/kind="load"/.test(src[FINE_DRAWER]) || !/related_load_id/.test(src[FINE_DRAWER])) {
    problems.push(`${FINE_DRAWER}: the related load is not rendered as an EntityLink kind="load".`);
  }

  // --- F19: the list query supplies NAMES, or the links label a truncated uuid ---
  if (!/related_unit_number/.test(src[FINE_ROUTES]) || !/related_load_number/.test(src[FINE_ROUTES])) {
    problems.push(`${FINE_ROUTES}: the fines list does not join unit_number/load_number — the drawer links would render a truncated uuid as their label (the SAF-F18/F26 defect).`);
  }
  // mdata.units has NO operating_company_id: an unscoped join leaks across entities.
  if (/LEFT JOIN mdata\.units/.test(src[FINE_ROUTES]) && !/owner_company_id|currently_leased_to_company_id/.test(src[FINE_ROUTES])) {
    problems.push(`${FINE_ROUTES}: the mdata.units join is not scoped by owner_company_id / currently_leased_to_company_id — units have no operating_company_id, so this would cross entities.`);
  }

  // --- F15: the catalog FK is accepted AND persisted ---
  if (!/violation_type_uuid/.test(src[VIOLATION_ROUTES])) {
    problems.push(`${VIOLATION_ROUTES}: create does not accept violation_type_uuid — the catalog FK stays null and the catalogued default fine amount can never resolve.`);
  }
  const insertBlock = src[VIOLATION_ROUTES].slice(src[VIOLATION_ROUTES].indexOf("INSERT INTO safety.company_violations"));
  if (insertBlock && !insertBlock.slice(0, 900).includes("violation_type_uuid")) {
    problems.push(`${VIOLATION_ROUTES}: violation_type_uuid is accepted but not in the INSERT column list — accepted-and-discarded is worse than not accepting it.`);
  }

  // --- F15: the picker reads the real catalog, with an INLINE create ---
  if (!/listCompanyViolationTypes/.test(src[VIOLATION_MODAL])) {
    problems.push(`${VIOLATION_MODAL}: does not read the real catalog (listCompanyViolationTypes) — a hardcoded option list is not a catalog picker.`);
  }
  if (!/allowAddNew/.test(src[VIOLATION_MODAL])) {
    problems.push(`${VIOLATION_MODAL}: the catalog picker has no inline "+ Add new" — the universal picker law requires it as a row inside the dropdown.`);
  }
  if (/window\.open\(/.test(src[VIOLATION_MODAL])) {
    problems.push(`${VIOLATION_MODAL}: "+ Add new" opens an external page (window.open) instead of an inline mini-create — navigating away mid-create discards what the operator already typed. This is the SAF-F24 defect.`);
  }
  if (!/createCompanyViolationType/.test(src[VIOLATION_MODAL]) || !/setViolationTypeUuid\(String\(row\.id\)\)/.test(src[VIOLATION_MODAL])) {
    problems.push(`${VIOLATION_MODAL}: the inline create does not return with the new type SELECTED — the picker-law contract is create-then-select, not create-then-hunt.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertFineLinksAndViolationCatalog(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "creator-stops-sending-load-link",
    { ...live, [FINE_CREATE]: live[FINE_CREATE].split("related_load_id").join("unused_field") },
    "does not send related_load_id"
  );
  expectCaught(
    "drawer-drops-the-unit-link",
    { ...live, [FINE_DRAWER]: live[FINE_DRAWER].split('kind="unit"').join('kind="driver"') },
    "not rendered as an EntityLink kind=\"unit\""
  );
  expectCaught(
    "list-loses-the-name-joins",
    { ...live, [FINE_ROUTES]: live[FINE_ROUTES].split("related_unit_number").join("dropped_alias") },
    "does not join unit_number/load_number"
  );
  expectCaught(
    "units-join-loses-entity-scope",
    { ...live, [FINE_ROUTES]: live[FINE_ROUTES].split("owner_company_id").join("id").split("currently_leased_to_company_id").join("id") },
    "not scoped by owner_company_id"
  );
  expectCaught(
    "catalog-fk-accepted-but-not-inserted",
    { ...live, [VIOLATION_ROUTES]: live[VIOLATION_ROUTES].replace("operating_company_id, violation_type, violation_type_uuid,", "operating_company_id, violation_type,") },
    "not in the INSERT column list"
  );
  expectCaught(
    "picker-reverts-to-hardcoded-list",
    { ...live, [VIOLATION_MODAL]: live[VIOLATION_MODAL].split("listCompanyViolationTypes").join("someHardcodedList") },
    "does not read the real catalog"
  );
  expectCaught(
    "add-new-becomes-an-external-link",
    { ...live, [VIOLATION_MODAL]: live[VIOLATION_MODAL].replace("onAdd: () => setTypeCreateOpen(true),", 'onAdd: () => window.open("/lists/safety/company-violation-types"),') },
    "opens an external page"
  );

  const liveProblems = assertFineLinksAndViolationCatalog(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 7 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertFineLinksAndViolationCatalog();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — fines collect + display their load/unit links (entity-scoped names), company violations carry the catalog FK with an inline + Add new`);
