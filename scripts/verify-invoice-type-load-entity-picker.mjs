#!/usr/bin/env node
/**
 * InvoiceTypeModalBase:
 *   - optional load uses EntityPicker (kind=load), not Combobox over listLoads
 *   - ACCT-F5051: driver/vendor typed creates stamp bill_to_entity_id from EntityPicker,
 *     never mirror customer_id into bill_to when type is driver|vendor
 *
 * Cursor even claim: 2404 (existing step).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-type-load-entity-picker";
const TARGET = "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx";
const DETAIL = "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src, detailSrc = "") {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/data-testid=["']invoice-type-load-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=invoice-type-load-picker`);
  }
  if (!/kind=["']load["']/.test(code) || !/setLoadId/.test(code)) {
    problems.push(`${TARGET}: load must use EntityPicker kind=load`);
  }
  if (/listLoads\(/.test(code)) {
    problems.push(`${TARGET}: must not local-fetch load roster — EntityPicker owns search`);
  }
  if (/from ["'].*\/Combobox["']/.test(src) || /<Combobox[\s\S]{0,200}loadId/.test(code)) {
    problems.push(`${TARGET}: Combobox must not remain on load picker`);
  }

  // ACCT-F5051 — bill-to must not always equal customer_id.
  if (/bill_to_entity_id:\s*parsed\.customer_id/.test(code) && !/billToEntityType\s*===\s*["']customer["']/.test(code)) {
    problems.push(`${TARGET}: bill_to_entity_id must not always be parsed.customer_id`);
  }
  if (!/data-testid=["']invoice-type-bill-to-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=invoice-type-bill-to-picker for driver/vendor bill-to`);
  }
  if (!/kind=\{billToEntityType\}/.test(code) && !/kind=\{billToEntityType === "driver"/.test(code)) {
    // Accept kind={billToEntityType} when type is driver|vendor branch.
    if (!/kind=\{billToEntityType\}/.test(src)) {
      problems.push(`${TARGET}: bill-to EntityPicker must use kind={billToEntityType}`);
    }
  }
  if (!/bill_to_entity_type === "driver" \|\| bill_to_entity_type === "vendor"/.test(code) &&
      !/value\.bill_to_entity_type === "driver" \|\| value\.bill_to_entity_type === "vendor"/.test(code)) {
    problems.push(`${TARGET}: schema must require bill_to for driver/vendor types`);
  }
  if (detailSrc && !/data-testid=["']invoice-bill-to-link["']/.test(detailSrc)) {
    problems.push(`${DETAIL}: must render bill-to EntityLink (invoice-bill-to-link)`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../../components/Combobox";
    listLoads({})
    <Combobox options={loadOptions} value={loadId} onChange={setLoadId} />
    bill_to_entity_id: parsed.customer_id,
  `;
  const good = `
    <div data-testid="invoice-type-load-picker">
      <EntityPicker kind="load" onChange={setLoadId} />
    </div>
    <div data-testid="invoice-type-bill-to-picker">
      <EntityPicker kind={billToEntityType} onChange={setBillToEntityId} />
    </div>
    if (value.bill_to_entity_type === "driver" || value.bill_to_entity_type === "vendor") {
      // require uuid
    }
    bill_to_entity_id:
      billToEntityType === "customer" || billToEntityType === "other"
        ? parsed.customer_id
        : parsed.bill_to_entity_id.trim() || null,
  `;
  const goodDetail = `<span data-testid="invoice-bill-to-link"><EntityLink kind="driver" /></span>`;
  const badP = collectProblems(bad, "");
  const goodP = collectProblems(good, goodDetail);
  if (badP.length < 3 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
const detailAbs = path.join(ROOT, DETAIL);
const src = fs.readFileSync(abs, "utf8");
const detailSrc = fs.readFileSync(detailAbs, "utf8");
const problems = collectProblems(src, detailSrc);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — invoice type load + bill-to EntityPicker; detail bill-to link`);
