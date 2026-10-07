#!/usr/bin/env node
/**
 * SETL-F443 — every Settlement Creator money + quantity box accepts typed decimals.
 *
 * Owner 2026-10-07: "ALL MONEY MUST BE ABLE TO PUT DECIMAL AND ALL QUANTITES, FOR DIESEL ETC."
 *
 * Locks:
 *  1. MoneyInput does not emit on trailing "." (so "12." / "0." survive mid-keystroke)
 *  2. Creator gallons (diesel/reefer/DEF) use DecimalNumberInput
 *  3. Creator miles use DecimalNumberInput
 *  4. Creator has no Number(e.target.value) quantity/money handlers left
 *  5. Creator money fields stay on MoneyInput
 *  6. Shared NumberInput holds trailing "." (same class as MoneyInput)
 *  7. Fuel create gallons + CostBreakdown/WO qty use NumberInput (not raw type=number)
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-settlement-creator-decimals-f443";
const files = {
  money: "apps/frontend/src/components/forms/MoneyInput.tsx",
  number: "apps/frontend/src/components/forms/NumberInput.tsx",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  fuelCreate: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  costBox: "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx",
  woModal: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
};

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function run(src) {
  const out = [];
  if (!src.money) return [`RULE 0: ${files.money} missing`];
  if (!src.drawer) return [`RULE 0b: ${files.drawer} missing`];
  if (!src.number) return [`RULE 0c: ${files.number} missing`];

  // MoneyInput: trailing "." must be treated as incomplete (do not emit).
  // Source contains the literal characters: /\.$/.test(cleaned)
  if (!src.money.includes("/\\.$/.test(cleaned)")) {
    out.push(
      'RULE 1: MoneyInput onChange must include /\\.$/.test(cleaned) so "12." / CPG decimals are typeable.',
    );
  }
  if (!src.number.includes("/\\.$/.test(cleaned)")) {
    out.push(
      'RULE 1b: NumberInput onChange must include /\\.$/.test(cleaned) so "45." gallons/qty are typeable.',
    );
  }

  if (!/function DecimalNumberInput/.test(src.drawer)) {
    out.push("RULE 2: SettlementCreatorDrawer must define DecimalNumberInput for quantities.");
  }
  if (!/<DecimalNumberInput[\s\S]{0,2000}sc-fuel-gallons-/.test(src.drawer)) {
    out.push("RULE 2b: Fuel gallons (diesel/reefer/DEF) must use DecimalNumberInput.");
  }
  if (!/<DecimalNumberInput[\s\S]{0,2000}sc-load-loaded-miles-/.test(src.drawer)) {
    out.push("RULE 2c: Loaded miles must use DecimalNumberInput.");
  }
  if (!/<DecimalNumberInput[\s\S]{0,2000}sc-load-empty-miles-/.test(src.drawer)) {
    out.push("RULE 2d: Empty miles must use DecimalNumberInput.");
  }

  // No raw Number(e.target.value) assignment on gallons/miles (the F442 breakage).
  if (/gallons:\s*Number\(e\.target\.value\)/.test(src.drawer)) {
    out.push("RULE 3: gallons still uses Number(e.target.value) — decimals die mid-keystroke.");
  }
  if (/loaded_miles:\s*e\.target\.value\s*===\s*""\s*\?\s*null\s*:\s*Number\(e\.target\.value\)/.test(src.drawer)) {
    out.push("RULE 3b: loaded_miles still uses Number(e.target.value).");
  }
  if (/empty_miles:\s*e\.target\.value\s*===\s*""\s*\?\s*null\s*:\s*Number\(e\.target\.value\)/.test(src.drawer)) {
    out.push("RULE 3c: empty_miles still uses Number(e.target.value).");
  }

  // Money fields: rates / revenue / CPG / amounts stay on MoneyInput (not plain <input>).
  if (!/MoneyInput/.test(src.drawer) || !/valueCents=\{fuel\.cpg_cents/.test(src.drawer)) {
    out.push("RULE 4: Fuel CPG must stay on MoneyInput (decimal $).");
  }
  if (!/valueCents=\{load\.line_haul_rate_cents/.test(src.drawer)) {
    out.push("RULE 4b: Rate $/mi must stay on MoneyInput.");
  }
  if (!/valueCents=\{load\.line_haul_amount_cents/.test(src.drawer)) {
    out.push("RULE 4c: Revenue must stay on MoneyInput.");
  }

  // App-wide qty/money: fuel create + cost lines + WO edit qty.
  if (src.fuelCreate) {
    if (!/<NumberInput[\s\S]{0,400}fuel-create-gallons|data-testid="fuel-create-gallons"[\s\S]{0,400}<NumberInput/.test(src.fuelCreate)) {
      out.push("RULE 5: CreateFuelTransactionModal gallons must use NumberInput.");
    }
    if (!/fuel-create-ppg[\s\S]{0,400}<MoneyInput|data-testid="fuel-create-ppg"[\s\S]{0,400}<MoneyInput/.test(src.fuelCreate)) {
      out.push("RULE 5b: CreateFuelTransactionModal $/gal must use MoneyInput.");
    }
  }
  if (src.costBox) {
    if ((src.costBox.match(/<NumberInput/g) || []).length < 3) {
      out.push("RULE 6: CostBreakdownBox must use NumberInput on every qty cell (≥3).");
    }
    if (/const quantity = Number\(event\.target\.value/.test(src.costBox)) {
      out.push("RULE 6b: CostBreakdownBox still uses Number(event.target.value) on qty.");
    }
  }
  if (src.woModal) {
    if (!/<NumberInput[\s\S]{0,200}quantity: n \?\? 0|patchEditLine\(row\._idx, \{ quantity: n/.test(src.woModal)) {
      out.push("RULE 7: CreateWorkOrderModal edit qty must use NumberInput.");
    }
    if (/quantity: Number\(e\.target\.value\)/.test(src.woModal)) {
      out.push("RULE 7b: CreateWorkOrderModal still uses Number(e.target.value) on qty.");
    }
  }

  return out;
}

if (process.argv.includes("--selftest")) {
  const good = {
    money: `if (cleaned === "-" || /\\.$/.test(cleaned)) { return; }`,
    number: `if (/\\.$/.test(cleaned)) { return; }`,
    drawer: `function DecimalNumberInput() {}
<DecimalNumberInput data-testid={\`sc-fuel-gallons-\${idx}\`} />
<DecimalNumberInput data-testid={\`sc-load-loaded-miles-\${idx}\`} />
<DecimalNumberInput data-testid={\`sc-load-empty-miles-\${idx}\`} />
<MoneyInput valueCents={fuel.cpg_cents > 0 ? fuel.cpg_cents : null} />
valueCents={load.line_haul_rate_cents}
valueCents={load.line_haul_amount_cents}
`,
    fuelCreate: `data-testid="fuel-create-gallons"><NumberInput value={gallons}
data-testid="fuel-create-ppg"><MoneyInput valueDollars={pricePerGallon}`,
    costBox: `<NumberInput /><NumberInput /><NumberInput />`,
    woModal: `<NumberInput onChange={(n) => patchEditLine(row._idx, { quantity: n ?? 0 })}`,
  };
  const bad = {
    money: `if (cleaned === "-" || cleaned === ".") { return; }`,
    number: `onChange?.(parseNumber(e.target.value, decimals));`,
    drawer: `gallons: Number(e.target.value) || 0,
loaded_miles: e.target.value === "" ? null : Number(e.target.value),
`,
    fuelCreate: `<input data-testid="fuel-create-gallons" /><input data-testid="fuel-create-ppg" />`,
    costBox: `const quantity = Number(event.target.value || 0);`,
    woModal: `quantity: Number(e.target.value)`,
  };
  const cases = [
    ["fixed tree passes", good, 0],
    ["catches old defects", bad, 17],
  ];
  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}\n  ${run(src).join("\n  ")}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run({
  money: read(files.money),
  number: read(files.number),
  drawer: read(files.drawer),
  fuelCreate: read(files.fuelCreate),
  costBox: read(files.costBox),
  woModal: read(files.woModal),
});
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(
  `${NAME}: PASS — MoneyInput+NumberInput trailing-decimal hold; Creator+fuel+cost+WO qty decimals.`,
);
