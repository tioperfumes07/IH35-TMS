#!/usr/bin/env node
/**
 * InvoiceTypeModalBase optional load must use EntityPicker (kind=load),
 * not Combobox over listLoads. Cursor even claim: 2404.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-type-load-entity-picker";
const TARGET = "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
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
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../../components/Combobox";
    listLoads({})
    <Combobox options={loadOptions} value={loadId} onChange={setLoadId} />
  `;
  const good = `
    <div data-testid="invoice-type-load-picker">
      <EntityPicker kind="load" onChange={setLoadId} />
    </div>
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 2 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
const src = fs.readFileSync(abs, "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — invoice type load uses EntityPicker`);
