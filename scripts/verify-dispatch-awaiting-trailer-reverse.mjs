#!/usr/bin/env node
import fs from "node:fs";

const files = {
  route: "apps/backend/src/dispatch/loads.routes.ts",
  api: "apps/frontend/src/api/dispatch.ts",
  table: "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx",
};

const read = (file) => fs.readFileSync(file, "utf8");

function audit(src) {
  const failures = [];
  if (!/LEFT JOIN LATERAL \([\s\S]{0,500}FROM mdata\.equipment e[\s\S]{0,300}e\.current_unit_id = u\.id/.test(src.route)) {
    failures.push("units-without-load must resolve the trailer assigned to the awaiting unit");
  }
  if (!/e\.deactivated_at IS NULL[\s\S]{0,160}\(e\.owner_company_id = \$1::uuid OR e\.currently_leased_to_company_id = \$1::uuid\)/.test(src.route)) {
    failures.push("awaiting-unit trailer resolution must be active and explicitly company scoped");
  }
  if (!/tr\.id::text AS trailer_id/.test(src.route) || !/tr\.equipment_number AS trailer_number/.test(src.route)) {
    failures.push("units-without-load payload must expose canonical trailer FK and label");
  }
  if (!/trailer_id: row\.trailer_id/.test(src.route)) failures.push("route mapper must retain trailer_id");
  if (!/trailer_id: string \| null;[\s\S]{0,60}trailer_number: string \| null;/.test(src.api)) {
    failures.push("UnitsWithoutLoad contract must type trailer FK and label together");
  }
  if (!/kind="trailer"[\s\S]{0,100}id=\{row\.trailer_id\}[\s\S]{0,100}name=\{row\.trailer_number\}[\s\S]{0,60}noun="Trailer"/.test(src.table)) {
    failures.push("awaiting-truck table must render a canonical trailer drill-through");
  }
  return failures;
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["assignment", "route", "e.current_unit_id = u.id", "TRUE"],
    ["scope", "route", "e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid", "TRUE"],
    ["payload", "route", "tr.id::text AS trailer_id", "NULL::text AS trailer_id"],
    ["mapper", "route", "trailer_id: row.trailer_id", "trailer_id: null"],
    ["contract", "api", "trailer_id: string | null;", "trailer_id?: never;"],
    ["drill", "table", 'kind="trailer"', 'kind="unit"'],
  ];
  for (const [name, key, from, to] of mutations) {
    const mutated = { ...source, [key]: source[key].replace(from, to) };
    if (mutated[key] === source[key] || audit(mutated).length === 0) {
      console.error(`verify-dispatch-awaiting-trailer-reverse SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify-dispatch-awaiting-trailer-reverse SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-dispatch-awaiting-trailer-reverse FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dispatch-awaiting-trailer-reverse PASS — awaiting unit resolves scoped trailer FK + label + drill-through");
