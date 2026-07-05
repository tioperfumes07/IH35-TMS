#!/usr/bin/env node
// Money-format guard — keep every displayed amount in ONE QuickBooks format.
//
// The canonical formatter is apps/frontend/src/lib/money.ts (formatUsdCents / formatUsd / formatNumber),
// which renders "$1,234.56" (thousands commas, exactly 2 decimals, "-$1,234.56" negatives). This guard
// flags the money-format patterns that drift OUT of that: string-interpolated `$${x.toFixed(2)}`,
// per-file `Intl.NumberFormat(...currency...)`, browser-locale `toLocaleString(..., {style:"currency"})`,
// and local fmtMoney/formatMoney/formatCurrency copies.
//
// Phase 1 (now): INFORMATIONAL — prints the offender count so the app-wide sweep can burn it down without
// breaking CI mid-migration. Once the sweep lands and the count is 0, flip ENFORCE=true below to lock it
// so no new file can reintroduce a non-canonical money format.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENFORCE = false; // flip to true after the sweep drives the count to 0
const TAG = "[verify-money-format]";
const ROOT = process.cwd();
const SRC = path.join(ROOT, "apps/frontend/src");
const CANON = "apps/frontend/src/lib/money.ts";

if (!fs.existsSync(path.join(ROOT, CANON))) {
  console.error(`${TAG} FAIL: canonical formatter missing at ${CANON}`);
  process.exit(1);
}

// Patterns that indicate a non-canonical money format. Each is intentionally narrow (money-only) so plain
// non-money toFixed/toLocaleString (percentages, hours, coordinates) is not flagged.
const PATTERNS = [
  { key: "interpolated-toFixed-money", re: /\$\$\{[^}]*\.toFixed\(2\)/ }, // `$${x.toFixed(2)}`
  { key: "locale-currency", re: /toLocaleString\([^)]*currency/ }, // browser-locale currency
  { key: "inline-Intl-currency", re: /NumberFormat\([^)]*currency/ }, // per-file currency formatter
  { key: "local-money-fn", re: /\b(?:function|const)\s+(?:fmtMoney|formatMoney|formatCurrency|fmtUsd|formatUsd)\b/ },
];

const offenders = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      const rel = path.relative(ROOT, full);
      if (rel === CANON) continue; // the canonical file legitimately defines the currency formatter
      const src = fs.readFileSync(full, "utf8");
      // A file that imports the canonical helper is considered migrated — a thin local wrapper that
      // delegates to formatUsdCents is fine. Interpolated-toFixed and browser-locale currency are always
      // flagged (clear format bugs) even if the file also imports the canonical elsewhere.
      const usesCanonical = /from ["'][^"']*lib\/money["']/.test(src);
      const hits = PATTERNS.filter((p) => {
        if (!p.re.test(src)) return false;
        if (usesCanonical && (p.key === "local-money-fn" || p.key === "inline-Intl-currency")) return false;
        return true;
      }).map((p) => p.key);
      if (hits.length) offenders.push({ rel, hits });
    }
  }
}
if (fs.existsSync(SRC)) walk(SRC);

console.log(`${TAG} canonical: ${CANON} (formatUsdCents / formatUsd / formatNumber)`);
console.log(`${TAG} non-canonical money-format surfaces: ${offenders.length}`);
for (const o of offenders.slice(0, 40)) console.log(`${TAG}   - ${o.rel} [${o.hits.join(",")}]`);
if (offenders.length > 40) console.log(`${TAG}   … +${offenders.length - 40} more`);

if (ENFORCE && offenders.length > 0) {
  console.error(`${TAG} FAIL: ${offenders.length} non-canonical money-format surface(s) — route through ${CANON}`);
  process.exit(1);
}
console.log(`${TAG} OK (informational${ENFORCE ? "+enforced" : ""})`);
