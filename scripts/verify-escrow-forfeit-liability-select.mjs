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
  // LEAD 443.99 class B (2026-10-12).
  //   old rule: any import from a module path ending `/Combobox` fails.
  //   new rule: importing the bare `Combobox` named export (from any module) fails, as does rendering
  //             `<Combobox` on the liability; `SelectCombobox` from components/Combobox is the required control.
  //   why: K2 (GO-23 Wave 4, 2026-09-02) folded components/shared/SelectCombobox.tsx into components/Combobox.tsx,
  //        so the REQUIRED SelectCombobox now arrives from a path ending `/Combobox`; the path test flagged the
  //        correct control. Re-introducing the old Combobox still fails on its import name or its JSX.
  const importsBareCombobox = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g)]
    .some((m) => m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).includes("Combobox"));
  if (importsBareCombobox || /<Combobox\b[\s\S]{0,200}linkedLiabilityId/.test(code)) {
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
  const goodRealImport = `import { SelectCombobox } from "../../../components/Combobox";\n${good}`;
  const badAliased = `import { Combobox as Picker, SelectCombobox } from "../../../components/Combobox";\n${good}`;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  const goodImportP = collectProblems(goodRealImport);
  const badAliasedP = collectProblems(badAliased);
  if (badP.length < 1 || goodP.length !== 0 || goodImportP.length !== 0 || badAliasedP.length < 1) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP, goodImportP, badAliasedP });
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
