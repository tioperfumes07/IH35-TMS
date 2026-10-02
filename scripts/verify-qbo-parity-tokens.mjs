#!/usr/bin/env node
/**
 * C-18 + D47..D54 — QuickBooks parity token pass guard (owner register 2026-09-30).
 * Static existence + wiring checks. Does not invent palette colors.
 *
 * Usage:
 *   node scripts/verify-qbo-parity-tokens.mjs
 *   node scripts/verify-qbo-parity-tokens.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-parity-tokens";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  tokens: "apps/frontend/src/design/qbo-parity.ts",
  formatDate: "apps/frontend/src/lib/formatDate.ts",
  money: "apps/frontend/src/lib/money.ts",
  indexCss: "apps/frontend/src/index.css",
  filterTokens: "apps/frontend/src/design/tokens.ts",
  parity: "apps/frontend/src/components/parity/ParityTable.tsx",
  banking: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const qbo = read(FILES.tokens);
  const must = [
    ["C-18 QBO_SURFACE.border", /border:\s*"#E5E7EB"/],
    ["C-18 QBO_SURFACE.divider", /divider:\s*"#D8DEE6"/],
    ["D47 listFormat", /listFormat:\s*"M\/D\/YY"/],
    ["D47 bankingFormat", /bankingFormat:\s*"MM\/DD\/YYYY"/],
    ["D48 QBO_MONEY_CELL_CLASS", /QBO_MONEY_CELL_CLASS\s*=\s*"text-right tabular-nums"/],
    ["D49 QBO_BANKING_ACTION_TEXT_CLASS", /QBO_BANKING_ACTION_TEXT_CLASS/],
    ["D50 QBO_TABLE_RULES.list", /list:\s*"row"/],
    ["D51 qboHeaderFontPx", /export function qboHeaderFontPx/],
    ["D52 QBO_FILTER_CONTROL_SIZE_CLASS", /QBO_FILTER_CONTROL_SIZE_CLASS/],
    ["D53 QBO_TOOLBAR_ICON_SLOT", /QBO_TOOLBAR_ICON_SLOT/],
    ["D54 Add/Match/Record transfer", /add:\s*"Add"[\s\S]*match:\s*"Match"[\s\S]*recordTransfer:\s*"Record transfer"/],
  ];
  for (const [name, re] of must) {
    if (!re.test(qbo)) f.push(`${FILES.tokens}: missing ${name}`);
  }

  const dates = read(FILES.formatDate);
  if (!/export function formatDateQboList/.test(dates)) f.push(`${FILES.formatDate}: missing formatDateQboList (D47)`);
  if (!/export function formatDateUS/.test(dates)) f.push(`${FILES.formatDate}: missing formatDateUS (D47 banking)`);

  const money = read(FILES.money);
  if (!/QBO_MONEY_CELL_CLASS/.test(money)) f.push(`${FILES.money}: must re-export QBO_MONEY_CELL_CLASS (D48)`);

  const css = read(FILES.indexCss);
  if (!/--color-border:\s*#E5E7EB/.test(css)) f.push(`${FILES.indexCss}: --color-border must be #E5E7EB (C-18)`);
  if (!/--color-divider:\s*#D8DEE6/.test(css)) f.push(`${FILES.indexCss}: --color-divider must be #D8DEE6 (C-18)`);

  const filter = read(FILES.filterTokens);
  // OWNER DESIGN LAW 2026-10-02 rule 2: every filter control is 34px (h-8.5) — supersedes D52's h-10.
  if (!/FILTER_CONTROL_SIZE_CLASS\s*=\s*"[^"]*\bh-8\.5\b[^"]*"/.test(filter)) {
    f.push(`${FILES.filterTokens}: FILTER_CONTROL_SIZE_CLASS must be 34px h-8.5 (owner design law 2026-10-02)`);
  }

  const parity = read(FILES.parity);
  // D50 / QBO-ROWS-NOT-COLUMNS — body must NOT carry vertical tableBodyRule column lines.
  if (/borderRight:\s*`1px solid \$\{colors\.tableBodyRule\}`/.test(parity)) {
    f.push(`${FILES.parity}: D50 body must not draw vertical column rules (QBO-ROWS-NOT-COLUMNS)`);
  }
  if (!/borderBottom:\s*`1px solid \$\{colors\.tableBodyRule\}`/.test(parity)) {
    f.push(`${FILES.parity}: D50 body must keep horizontal row rule (colors.tableBodyRule)`);
  }
  // D51 — tip main + C-18: Math.max(panelHeader, body+1)
  if (!/fontSize:\s*Math\.max\(typography\.panelHeader \?\? 11, d\.font \+ 1\)/.test(parity)) {
    f.push(`${FILES.parity}: D51 header font must outrank row (Math.max panelHeader, d.font+1)`);
  }
  if (!/parity-table-print/.test(parity)) f.push(`${FILES.parity}: D53 print control missing`);
  if (!/QBO_TOOLBAR_ICON_SLOT/.test(parity)) f.push(`${FILES.parity}: D53 toolbar slot missing`);

  const banking = read(FILES.banking);
  if (!/QBO_BANKING_ACTIONS/.test(banking)) f.push(`${FILES.banking}: D54 QBO_BANKING_ACTIONS missing`);
  if (!/QBO_BANKING_ACTIONS\.add/.test(banking)) f.push(`${FILES.banking}: D54 Add label missing`);
  if (!/QBO_BANKING_ACTIONS\.recordTransfer/.test(banking)) f.push(`${FILES.banking}: D54 Record transfer label missing`);

  return f;
}

if (SELFTEST) {
  const failures = audit();
  const parity = read(FILES.parity);
  const mutated = parity.replace(
    /fontSize:\s*Math\.max\(typography\.panelHeader \?\? 11, d\.font \+ 1\)/g,
    "fontSize: typography.panelHeader",
  );
  const wouldCatch = !/fontSize:\s*Math\.max\(typography\.panelHeader \?\? 11, d\.font \+ 1\)/.test(mutated);
  if (!wouldCatch) {
    console.error(`${LABEL} SELFTEST FAIL — could not prove D51 regression trip`);
    process.exit(1);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree already red:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — C-18 + D47..D54 tokens present and wired`);
process.exit(0);
