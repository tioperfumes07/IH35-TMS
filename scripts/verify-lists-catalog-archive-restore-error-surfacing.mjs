#!/usr/bin/env node
// LISTS-CATALOG-ARCHIVE-SILENT-SWALLOW — guard
//
// Same defect class already recognized+fixed twice in this codebase as "LISTS-F6334"
// (TerminationReasonsListPage.tsx, DispatchCatalogListPage.tsx: a deactivate/archive mutation
// with no onError, invoked via `void handler(...)`, so a rejected archive/restore was completely
// silent — no toast, no banner, table doesn't refresh, button just appears to no-op). Found the
// same shape unfixed in three more places, all funneling through the shared CatalogTable
// component (used by ~84 generic-catalog registry entries) or a bespoke page reusing it:
//  - GenericCatalogPage.tsx's archiveRows (both the per-row "Archive" button and the bulk
//    "Archive selected" batch action call this one function as CatalogTable's onArchive prop)
//  - DispatchFlagColorsCatalog.tsx's handleArchive + handleRestore
//  - DriversReferenceCatalogPage.tsx's toggleArchive (shared by 5 driver-reference catalogs:
//    license-classes, endorsements, restrictions, medical-card-status, employment-status)
// Each now wraps its await chain in try/catch and pushes userFacingApiError(error, ...) on
// failure, matching the TerminationReasonsListPage.tsx / DispatchCatalogListPage.tsx precedent.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGETS = [
  {
    file: "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
    anchor: "async function archiveRows(selected: CatalogRow[]) {",
    window: 900,
    mustMatch: [/}\s*catch\s*\(error\)\s*\{\s*pushToast\(userFacingApiError\(error,\s*"Could not archive one or more rows"\),\s*"error"\);/],
  },
  {
    file: "apps/frontend/src/pages/lists/dispatch/DispatchFlagColorsCatalog.tsx",
    anchor: "const handleArchive = useCallback(",
    window: 900,
    mustMatch: [/}\s*catch\s*\(error\)\s*\{\s*pushToast\(userFacingApiError\(error,\s*"Could not archive one or more rows"\),\s*"error"\);/],
  },
  {
    file: "apps/frontend/src/pages/lists/dispatch/DispatchFlagColorsCatalog.tsx",
    anchor: "const handleRestore = useCallback(",
    window: 900,
    mustMatch: [/}\s*catch\s*\(error\)\s*\{\s*pushToast\(userFacingApiError\(error,\s*"Could not restore one or more rows"\),\s*"error"\);/],
  },
  {
    file: "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx",
    anchor: "async function toggleArchive(row: DriversReferenceCatalogRow) {",
    window: 900,
    mustMatch: [/}\s*catch\s*\(error\)\s*\{\s*pushToast\(\s*userFacingApiError\(error,/],
  },
];

export function check(fileTexts) {
  const failures = [];
  for (const target of TARGETS) {
    const text = fileTexts[target.file];
    const idx = text.indexOf(target.anchor);
    const block = idx >= 0 ? text.slice(idx, idx + target.window) : "";
    for (const re of target.mustMatch) {
      if (!re.test(block)) {
        failures.push(`${target.file}: "${target.anchor}" no longer surfaces the real error via userFacingApiError`);
      }
    }
  }
  return failures;
}

function readAll() {
  const fileTexts = {};
  for (const target of TARGETS) {
    if (!fileTexts[target.file]) fileTexts[target.file] = fs.readFileSync(path.join(root, target.file), "utf8");
  }
  return fileTexts;
}

function run() {
  const fileTexts = readAll();
  const failures = check(fileTexts);
  if (failures.length > 0) {
    console.error("FAIL: lists-catalog-archive-restore-error-surfacing");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: generic-catalog + dispatch-flag-colors + drivers-reference archive/restore surface real errors");
}

function selftest() {
  const fileTexts = readAll();

  const offenderGeneric = { ...fileTexts };
  offenderGeneric["apps/frontend/src/pages/lists/GenericCatalogPage.tsx"] = fileTexts[
    "apps/frontend/src/pages/lists/GenericCatalogPage.tsx"
  ].replace(
    '} catch (error) {\n      pushToast(userFacingApiError(error, "Could not archive one or more rows"), "error");\n    }',
    ""
  );
  if (
    offenderGeneric["apps/frontend/src/pages/lists/GenericCatalogPage.tsx"] ===
    fileTexts["apps/frontend/src/pages/lists/GenericCatalogPage.tsx"]
  ) {
    console.error("FAIL(selftest): offender mutation (GenericCatalogPage) did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderGeneric).length === 0) {
    console.error("FAIL(selftest): planted offender (GenericCatalogPage archiveRows catch removed) was NOT caught");
    process.exit(1);
  }

  const offenderDriversRef = { ...fileTexts };
  offenderDriversRef["apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx"] = fileTexts[
    "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx"
  ].replace(
    /try \{\s*if \(row\.archived_at\) \{[\s\S]*?\} catch \(error\) \{[\s\S]*?\}\n  \}/,
    `if (row.archived_at) { await client.restore(row.id); } else { await client.archive(row.id); }\n    void query.refetch();\n  }`
  );
  if (
    offenderDriversRef["apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx"] ===
    fileTexts["apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx"]
  ) {
    console.error("FAIL(selftest): offender mutation (DriversReferenceCatalogPage) did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderDriversRef).length === 0) {
    console.error("FAIL(selftest): planted offender (DriversReferenceCatalogPage toggleArchive catch removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
