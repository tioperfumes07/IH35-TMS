// §7 PALETTE RATCHET (FINANCIAL UI) — companion to verify-section7-palette-nonfinancial.mjs, scoped to
// the financial modules (banking / accounting / lists + the money-rendering feature dirs). §7 locks status
// colors to navy/slate (green pill #d1fae5 = Class pill only; red #dc2626 = delete/Accident only). Off-
// palette amber/emerald/green/yellow status classes are §7 drift. Financial UI is Tier-1 (never
// autonomously recolored), so this guard is a downward RATCHET only: it FAILS if the count of off-palette
// status classes in the financial tree rises above the frozen BASELINE. Recolors here land under Jorge's
// review (HOLD-FOR-JORGE).
//
// To lower the baseline after removing off-palette classes: run
//   PALETTE_BASELINE_PRINT=1 node scripts/verify-section7-palette-financial.mjs
// and set BASELINE to the printed number.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const fail = (m) => { console.error(`FAIL verify-section7-palette-financial: ${m}`); process.exit(1); };

// Financial roots only (the dirs excluded by the non-financial guard). Directory-scoped so the two
// guards partition the tree without overlap.
const ROOTS = [
  "apps/frontend/src/pages/banking",
  "apps/frontend/src/pages/accounting",
  "apps/frontend/src/pages/lists",
  "apps/frontend/src/components/accounting",
  "apps/frontend/src/pages/driver-finance",
  "apps/frontend/src/pages/liabilities",
  "apps/frontend/src/pages/factoring",
  "apps/frontend/src/pages/cash-advances",
  "apps/frontend/src/pages/cash-flow",
  "apps/frontend/src/pages/finance",
  "apps/frontend/src/pages/invoices",
  // money-rendering dispatch card lives outside the finance dirs but is financial content:
  "apps/frontend/src/components/dispatch/tabs",
];

const OFF_PALETTE = /\b(bg|text|border|ring|from|to|via|divide|ring-offset|outline|decoration|placeholder|accent|fill|stroke)-(amber|emerald|green|yellow)-\d{2,3}\b/g;

// Frozen count of pre-existing off-palette status classes in the financial tree (grandfathered).
const BASELINE = 481; // set by PALETTE_BASELINE_PRINT (2026-07-01) — grandfathered; ratchet only downward

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else if (/\.(tsx?|css)$/.test(e)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap(walk);
let count = 0;
const perFile = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const m = src.match(OFF_PALETTE);
  if (m && m.length) { count += m.length; perFile.push([f, m.length]); }
}

if (process.env.PALETTE_BASELINE_PRINT) {
  console.log(`financial off-palette status classes: ${count} (across ${perFile.length} files)`);
  process.exit(0);
}

if (count > BASELINE) {
  perFile.sort((a, b) => b[1] - a[1]);
  fail(
    `off-palette §7 status classes INCREASED in FINANCIAL UI: ${count} > baseline ${BASELINE}. Use §7 tokens ` +
    `(bg-slate-100 / text-slate-600|700 / border-slate-200; red only for delete/Accident; green pill ` +
    `#d1fae5 = Class pill only).\n  Top files:\n  ` + perFile.slice(0, 15).map(([f, n]) => `${f}: ${n}`).join("\n  ")
  );
}

if (count < BASELINE) {
  console.log(
    `OK verify-section7-palette-financial: ${count} off-palette status classes (< baseline ${BASELINE}). ` +
    `Please lower BASELINE to ${count} (PALETTE_BASELINE_PRINT=1) so the ratchet tightens.`
  );
} else {
  console.log(`OK verify-section7-palette-financial: ${count} off-palette status classes == baseline (frozen; no NET-NEW).`);
}
