#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers","factoring","fleet","insurance","safety","banking","settlements","maintenance"],"cols":["driver","unit","trailer","connectivity","picker_law"],"leafRe":"^(dispatch\\.(modal\\.(equipment_transfer|quick_assign)|parity\\.book_load_equipment_section)|drivers\\.parity\\.driver_picker_with_create|factoring\\.parity\\.driver_autocomplete|fleet\\.modal\\.edit_vehicle|insurance\\.(modal|parity)\\.claim_create|safety\\.(drawer|parity)\\.accident_report|banking\\.(modal|parity)\\.bank_transaction_split|settlements\\.(modal|parity)\\.create_advance|maintenance\\.(modal|parity)\\.(road_service_ticket|create_bill|create_expense)|safety\\.(modal|parity)\\.fine_create|safety\\.panel\\.test_scheduling)$","task":"ENTITY-PICKER-REGISTRY-RAW-UUID-LABEL-FALLBACKS","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-entity-picker-registry-honest-labels";
const FILE = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
const source = fs.readFileSync(FILE, "utf8");

const contracts = [
  ["driver", 'entityLabel(nonEmpty(d.first_name, d.last_name), d.id, "Driver")'],
  ["trailer", 'entityLabel(nonEmpty(e.equipment_number), e.id, "Trailer")'],
  ["unit", 'entityLabel(nonEmpty(u.unit_number) || nonEmpty(u.display_id), u.id, "Unit")'],
  ["work_order", 'entityLabel(nonEmpty(w.display_id), w.id, "Work order")'],
];

function failures(candidate) {
  const found = [];
  if (!candidate.includes('import { entityLabel } from "../../lib/entity-label"')) found.push("shared honest-label import is missing");
  for (const [kind, expression] of contracts) {
    if (!candidate.includes(expression)) found.push(`${kind} does not use its exact honest-label contract`);
  }
  if (/label:\s*(?:nonEmpty\([^\n]+\)\s*\|\|\s*)?String\([deuw]\.id\)/.test(candidate)) found.push("a governed registry kind still exposes its raw UUID as a label");
  for (const value of ["d.id", "e.id", "u.id", "w.id"]) {
    if (!candidate.includes(`value: ${value}`)) found.push(`${value} no longer remains the canonical option FK`);
  }
  for (const scope of [
    "operating_company_id: operatingCompanyId",
    "operating_company_id: [operatingCompanyId]",
    "listWorkOrders(operatingCompanyId)",
  ]) if (!candidate.includes(scope)) found.push(`company-scoped registry read is missing: ${scope}`);
  for (const pair of [
    ['readTable: "mdata.drivers"', 'writeTable: "mdata.drivers"'],
    ['readTable: "mdata.equipment"', 'writeTable: "mdata.equipment"'],
    ['readTable: "mdata.units"', 'writeTable: "mdata.units"'],
    ['readTable: "maintenance.work_orders"', 'writeTable: "maintenance.work_orders"'],
  ]) if (!pair.every((needle) => candidate.includes(needle))) found.push(`R=W registry contract is missing: ${pair.join(" / ")}`);
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ['import { entityLabel } from "../../lib/entity-label";', "", "shared import"],
    ...contracts.map(([kind, expression]) => [expression, `String(${kind === "driver" ? "d" : kind === "trailer" ? "e" : kind === "unit" ? "u" : "w"}.id)`, `${kind} raw UUID label`]),
    ["value: d.id", "value: d.first_name", "driver FK option value"],
    ["operating_company_id: [operatingCompanyId]", "operating_company_id: []", "load company scope"],
    ['writeTable: "mdata.equipment"', 'writeTable: "mdata.units"', "trailer R=W"],
  ];
  const escaped = [];
  for (const [needle, replacement, name] of mutations) {
    if (!source.includes(needle)) { escaped.push(`mutation anchor missing: ${name}`); continue; }
    if (failures(source.replace(needle, replacement)).length === 0) escaped.push(`planted defect escaped: ${name}`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — shared driver/trailer/unit/work-order pickers keep UUIDs as FKs and expose only honest labels`);
