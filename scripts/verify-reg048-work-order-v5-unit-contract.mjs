#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-reg048-work-order-v5-unit-contract";
const migration = fs.readFileSync("db/migrations/202614030000_reg048_work_order_v5_unit_contract.sql", "utf8");
const legacyRoute = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");
const sharedCreator = fs.readFileSync("apps/backend/src/maintenance/two-section-service.ts", "utf8");
const partsRoute = fs.readFileSync("apps/backend/src/maintenance/parts-invoice-links.routes.ts", "utf8");

function audit(parts) {
  const failures = [];
  if (!/COALESCE\([\s\S]*external_vendor_invoice_number[\s\S]*external_vendor_wo_number[\s\S]*parts_invoice_links/.test(parts.migration)) {
    failures.push("V5 must use the first work-order vendor reference or parts invoice");
  }
  if (!/pil\.voided_at IS NULL[\s\S]*ORDER BY pil\.created_at ASC, pil\.id ASC[\s\S]*LIMIT 1/.test(parts.migration)) {
    failures.push("parts-invoice V5 source must be first, stable, and non-voided");
  }
  if (!/IF v_wo\.v5_suffix IS NOT NULL AND v_wo\.v5_suffix <> 'PEND0'[\s\S]*RETURN v_wo\.display_id/.test(parts.migration)) {
    failures.push("refresh_wo_display_id must lock after the first non-PEND0 V5");
  }
  if (!/IF p_unit_id IS NULL[\s\S]*E_UNIT_HAS_NO_NUMBER/.test(parts.migration)) {
    failures.push("next_wo_display_id must reject a null unit with E_UNIT_HAS_NO_NUMBER");
  }
  if (!/work_orders_active_unit_required_check[\s\S]*CHECK \(unit_id IS NOT NULL OR voided_at IS NOT NULL\) NOT VALID/.test(parts.migration)) {
    failures.push("database boundary must reject every new active null-unit work order");
  }
  if (!/refresh_wo_display_id\(\$1\)/.test(parts.legacyRoute)) failures.push("legacy create/update route must refresh V5");
  if (!/REG-048:[\s\S]*refresh_wo_display_id\(\$1\)/.test(parts.sharedCreator)) failures.push("shared two-section creator must refresh V5");
  if (!/INSERT INTO maintenance\.parts_invoice_links[\s\S]*refresh_wo_display_id\(\$1\)/.test(parts.partsRoute)) {
    failures.push("parts-invoice entry must refresh V5 in the same transaction");
  }
  return failures;
}

const sources = { migration, legacyRoute, sharedCreator, partsRoute };
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["migration", "v_wo.external_vendor_invoice_number,", "NULL,"],
    ["migration", "AND pil.voided_at IS NULL", ""],
    ["migration", "AND v_wo.v5_suffix <> 'PEND0'", "AND false"],
    ["migration", "IF p_unit_id IS NULL THEN", "IF false THEN"],
    ["migration", "CHECK (unit_id IS NOT NULL OR voided_at IS NOT NULL) NOT VALID", "CHECK (true) NOT VALID"],
    ["sharedCreator", "SELECT maintenance.refresh_wo_display_id($1) AS display_id", "SELECT $1 AS display_id"],
    ["partsRoute", "SELECT maintenance.refresh_wo_display_id($1) AS display_id", "SELECT $1 AS display_id"],
  ];
  for (const [key, from, to] of mutations) {
    const changed = { ...sources, [key]: sources[key].replace(from, to) };
    if (changed[key] === sources[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — planted mutation escaped: ${key}:${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — V5 source/lock, active-unit boundary, and all three refresh paths are wired`);

