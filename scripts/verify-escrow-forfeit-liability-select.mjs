#!/usr/bin/env node
/**
 * EscrowForfeitModal liability offset picker must use SelectCombobox (shared chrome),
 * not Combobox. Cursor even claim: 2398.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-forfeit-liability-select";
const TARGET = "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/data-testid=["']escrow-forfeit-liability-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=escrow-forfeit-liability-picker`);
  }
  if (!/SelectCombobox/.test(code) || !/setLinkedLiabilityId/.test(code)) {
    problems.push(`${TARGET}: liability picker must use SelectCombobox`);
  }
  if (/from ["'].*\/Combobox["']/.test(src) || /<Combobox[\s\S]{0,200}linkedLiabilityId/.test(code)) {
    problems.push(`${TARGET}: Combobox must not remain on liability picker`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../../components/Combobox";
    <div data-testid="escrow-forfeit-liability-picker">
      <Combobox value={linkedLiabilityId} onChange={setLinkedLiabilityId} />
    </div>
  `;
  const good = `
    <div data-testid="escrow-forfeit-liability-picker">
      <SelectCombobox value={linkedLiabilityId ?? ""} onChange={(e) => setLinkedLiabilityId(e.target.value || null)} />
    </div>
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 1 || goodP.length !== 0) {
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
console.log(`${LABEL} OK — escrow forfeit liability uses SelectCombobox`);
