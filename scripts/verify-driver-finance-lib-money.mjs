#!/usr/bin/env node
// ROUND 296 item 5 (CC-1) — the driver-finance lane formats money ONE way: apps/frontend/src/lib/money.ts.
// The 15 surfaces below hand-rolled `$${x.toFixed(2)}`, `toLocaleString("en-US", {…FractionDigits})` and per-file
// Intl.NumberFormat, so the same settlement amount read "$1500.00" on one screen and "$1,500.00" on the next, a
// negative printed "-$12.00" instead of "($12.00)", and a missing amount printed a fabricated "$0.00".
// This guard fails if any of these files:
//   1. hand-rolls money / quantity formatting (toFixed(2|4) on a displayed value, toLocaleString with fraction
//      digits, Intl.NumberFormat) — an input-value setter (`setX((a / b).toFixed(2))`) is the one allowed toFixed;
//   2. stops importing lib/money;
//   3. declares a ParityTable money column (kind: "money") without QBO_MONEY_CELL_CLASS and the 120px floor.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-finance-lib-money";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FILES = [
  "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx",
  "apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx",
  "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx",
  "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
  "apps/frontend/src/pages/driver-finance/components/FuelPurchasesSection.tsx",
  "apps/frontend/src/pages/driver-finance/components/DebtBanner.tsx",
  "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx",
  "apps/frontend/src/pages/driver-finance/components/NetPaySummary.tsx",
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx",
  "apps/frontend/src/pages/DriverDetail.tsx",
  "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
  "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx",
  "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx",
];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(file, src) {
  const p = [];
  const code = strip(src);
  code.split("\n").forEach((line, i) => {
    if (/\.toFixed\(\d\)/.test(line) && !/\bset[A-Z]\w*\(.*\.toFixed\(2\)\);?\s*$/.test(line)) p.push(`${file}:${i + 1} hand-rolled toFixed — use lib/money`);
    if (/toLocaleString\(\s*["']en-US["']\s*,\s*\{[^}]*FractionDigits/.test(line)) p.push(`${file}:${i + 1} hand-rolled toLocaleString — use lib/money formatQuantityTable / formatNumberTable`);
    if (/new Intl\.NumberFormat\(/.test(line)) p.push(`${file}:${i + 1} per-file Intl.NumberFormat — use lib/money`);
  });
  if (!/from "(?:\.\.?\/)+(?:lib\/)?money"/.test(code) && !/from "[^"]*\/lib\/money"/.test(code)) p.push(`${file} does not import lib/money`);
  for (const obj of code.split(/\bkey: ["']/).slice(1).filter((c) => /kind: "money"/.test(c))) {
    if (!/QBO_MONEY_CELL_CLASS/.test(obj) || !/minWidth: 120\b/.test(obj)) p.push(`${file} money column without QBO_MONEY_CELL_CLASS + minWidth: 120`);
  }
  return p;
}

export function run() {
  return FILES.flatMap((f) => problems(f, readFileSync(path.join(ROOT, f), "utf8")));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const own = run();
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const f = FILES[0];
    const real = readFileSync(path.join(ROOT, f), "utf8");
    const plants = [
      ["toFixed money", real + "\nconst x = <span>${Number(a).toFixed(2)}</span>;"],
      ["toLocaleString miles", real + '\nconst m = v.toLocaleString("en-US", { minimumFractionDigits: 1 });'],
      ["per-file Intl", real + '\nconst F = new Intl.NumberFormat("en-US");'],
      ["money column without class", real + '\nconst c = [{\n  key: "amt",\n  kind: "money",\n  label: "Amt",\n}];'],
      ["lib/money import removed", real.replace(/import \{[^}]*\} from "[^"]*lib\/money";\n/, "")],
    ];
    for (const [name, planted] of plants) {
      if (!problems(f, planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    if (problems(f, real + "\nsetWeeklyAmount((d / periods).toFixed(2));").length) { console.error(`${LABEL} --selftest FAIL — input setter flagged`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught; input setter allowed)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — ${FILES.length} driver-finance surfaces format money through lib/money (accounting parentheses, em dash for missing, 120px QBO money columns).`);
}
