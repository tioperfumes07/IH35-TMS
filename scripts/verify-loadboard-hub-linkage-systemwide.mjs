#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = [
  ["load-costs board", "apps/backend/src/accounting/load-costs-board.routes.ts", ["l.id::text AS load_id", "l.operating_company_id::text AS operating_company_id", "l.customer_id::text AS customer_id", "l.assigned_primary_driver_id::text AS driver_id", "l.assigned_unit_id::text AS unit_id", "eq.id::text AS equipment_id"]],
  ["planner", "apps/backend/src/dispatch/planner.service.ts", ["l.id::text AS id", "l.operating_company_id::text AS operating_company_id", "l.customer_id::text AS customer_id", "l.assigned_primary_driver_id::text AS driver_id", "l.assigned_unit_id::text AS unit_id", "eq.id::text AS equipment_id"]],
  ["dispatch board", "apps/backend/src/dispatch/loads.routes.ts", ["tr.equipment_id AS trailer_id"]],
  ["loads list", "apps/backend/src/mdata/loads.routes.ts", ["l.operating_company_id,", "l.customer_id,", "l.assigned_unit_id,", "l.assigned_primary_driver_id,", "tr.id AS trailer_id"]],
];

function verify(read = (file) => fs.readFileSync(path.join(root, file), "utf8")) {
  const failures = [];
  for (const [name, file, tokens] of surfaces) {
    const source = read(file);
    for (const token of tokens) if (!source.includes(token)) failures.push(`${name}: missing ${token}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [name, targetFile, tokens] of surfaces) {
    for (const token of tokens) {
      const failures = verify((file) => {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        return file === targetFile ? source.split(token).join("__PLANTED_MISSING_LINK__") : source;
      });
      if (!failures.some((failure) => failure.startsWith(`${name}:`))) {
        console.error(`FAIL: mutation survived: ${name} / ${token}`);
        process.exit(1);
      }
      mutations += 1;
    }
  }
  console.log(`PASS: ${mutations}/${mutations} loadboard hub-link mutations detected`);
  process.exit(0);
}

const failures = verify();
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log(`PASS: ${surfaces.length}/${surfaces.length} loadboard readers expose canonical hub ids`);
