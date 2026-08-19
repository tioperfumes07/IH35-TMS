#!/usr/bin/env node
/**
 * LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES
 *
 * showMaintenanceColumns must control the Unit cell: maintenance → Link;
 * base /fleet → EntityLink (unit|trailer) so reverse_link is Live-clickable.
 * Identical Link arms made the flag dead — arms must stay distinct.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/components/FleetTable.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function collectFailures(src) {
  const failures = [];

  if (!/showMaintenanceColumns\s*\?/.test(src)) {
    failures.push("FleetTable must keep a showMaintenanceColumns Unit-cell ternary");
  }
  if (!/LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES/.test(src)) {
    failures.push("Base Unit arm must cite LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES");
  }

  const linkUnit = (
    src.match(
      /<Link[^>]*fleetProfilePath[\s\S]*?entityLabel\(row\.unit_number,\s*row\.id,\s*"Unit"\)[\s\S]*?<\/Link>/g
    ) || []
  ).length;
  if (linkUnit !== 1) {
    failures.push(
      `Expected exactly 1 Link-wrapped Unit entityLabel (maintenance mode); found ${linkUnit}`
    );
  }

  if (!/from ["']\.\/shared\/EntityLink["']/.test(src) && !/from ["']\.\.\/.*EntityLink["']/.test(src)) {
    failures.push("FleetTable must import EntityLink for base /fleet Unit cell");
  }

  if (
    !/Base \/fleet:[\s\S]{0,400}<EntityLink[\s\S]{0,200}kind=\{row\.kind === "trailer" \? "trailer" : "unit"\}/.test(
      src
    )
  ) {
    failures.push(
      "Base /fleet Unit cell must be EntityLink kind unit|trailer (not plain text, not Link)"
    );
  }

  if (
    /Base \/fleet:[\s\S]{0,200}<td className="px-2 py-1 font-semibold text-slate-700">\s*\{entityLabel\(row\.unit_number/.test(
      src
    )
  ) {
    failures.push("Base /fleet Unit cell must not regress to plain-text entityLabel");
  }

  const identicalArms =
    (src.match(
      /<Link[^>]*fleetProfilePath[\s\S]*?entityLabel\(row\.unit_number,\s*row\.id,\s*"Unit"\)[\s\S]*?<\/Link>[\s\S]{0,120}<Link[^>]*fleetProfilePath[\s\S]*?entityLabel\(row\.unit_number,\s*row\.id,\s*"Unit"\)[\s\S]*?<\/Link>/
    ) || []).length > 0;
  if (identicalArms) {
    failures.push("Unit-cell ternary must not render two Link Unit arms (identical/dead flag)");
  }

  return failures;
}

function selftest() {
  const clean = read(TARGET);
  const cleanFails = collectFailures(clean);
  if (cleanFails.length) {
    console.error(
      "verify-fleettable-unit-cell-maintenance-mode --selftest FAILED — clean:\n" +
        cleanFails.map((f) => `  - ${f}`).join("\n")
    );
    process.exit(1);
  }

  const plantedIdentical = clean.replace(
    /\/\* Base \/fleet:[\s\S]*?<\/td>/,
    `<td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Link to={fleetProfilePath(row)} className="font-semibold text-slate-700 hover:underline">
                          {entityLabel(row.unit_number, row.id, "Unit")}
                        </Link>
                      </td>`
  );
  if (!collectFailures(plantedIdentical).length) {
    console.error(
      "verify-fleettable-unit-cell-maintenance-mode --selftest FAILED — planted identical Link arms escaped"
    );
    process.exit(1);
  }

  const plantedPlain = clean.replace(
    /\/\* Base \/fleet:[\s\S]*?<\/td>/,
    `/* Base /fleet: LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES */
                      <td className="px-2 py-1 font-semibold text-slate-700">
                        {entityLabel(row.unit_number, row.id, "Unit")}
                      </td>`
  );
  if (!collectFailures(plantedPlain).length) {
    console.error(
      "verify-fleettable-unit-cell-maintenance-mode --selftest FAILED — planted plain-text base escaped"
    );
    process.exit(1);
  }

  const plantedDropMarker = clean.replace(/LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES/g, "REMOVED");
  if (!collectFailures(plantedDropMarker).length) {
    console.error(
      "verify-fleettable-unit-cell-maintenance-mode --selftest FAILED — planted missing marker escaped"
    );
    process.exit(1);
  }

  console.log("verify-fleettable-unit-cell-maintenance-mode --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = collectFailures(read(TARGET));
  if (failures.length) {
    console.error("verify-fleettable-unit-cell-maintenance-mode FAILED —");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-fleettable-unit-cell-maintenance-mode OK");
}

main();
