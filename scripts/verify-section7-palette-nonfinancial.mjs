// §7 PALETTE RATCHET (non-financial UI) — CLAUDE.md §7 locks the status palette to navy/slate, with
// --green-pill (#d1fae5) reserved for the Class pill only and --red (#dc2626) for delete/Accident only.
// Off-palette Tailwind STATUS classes (amber/emerald/green/yellow on a color-bearing property) are §7
// drift. This repo already carries a large amount of such usage that is SEMANTICALLY load-bearing
// (traffic-light green/amber/red triples, positive/negative money) and is deliberately grandfathered by
// the existing verify-section7-palette-maintenance.mjs guard. Rather than flatten that meaning, this guard
// is a RATCHET: it counts the current off-palette status classes in the NON-FINANCIAL frontend tree and
// FAILS if the count goes UP (a NET-NEW off-palette status class was introduced). Existing usage is frozen
// at BASELINE; new work must use §7 tokens (bg-slate-100 / text-slate-600|700 / border-slate-200).
//
// Financial modules (banking/accounting/lists + money components) are covered by a SEPARATE guard
// (verify-section7-palette-financial.mjs) so they can be recolored under Jorge's review (Tier-1).
//
// To lower the baseline after removing off-palette classes: run
//   PALETTE_BASELINE_PRINT=1 node scripts/verify-section7-palette-nonfinancial.mjs
// and set BASELINE to the printed number.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const fail = (m) => { console.error(`FAIL verify-section7-palette-nonfinancial: ${m}`); process.exit(1); };

const ROOTS = [
  "apps/frontend/src/pages",
  "apps/frontend/src/components",
  "apps/frontend/src/portal",
  "apps/frontend/src/layouts",
  "apps/frontend/src/lib",
];

// Financial modules are excluded here and locked by the financial guard instead. Any path segment match
// skips the file. (banking/accounting/lists per §7 memory; plus the money-rendering feature dirs.)
const FINANCIAL_SEGMENTS = [
  "/pages/banking/", "/pages/accounting/", "/pages/lists/", "/components/accounting/",
  "/pages/driver-finance/", "/pages/liabilities/", "/pages/factoring/", "/pages/cash-advances/",
  "/pages/cash-flow/", "/pages/finance/", "/pages/invoices/",
];

// Off-palette STATUS classes: amber / emerald / green / yellow on a color-bearing property. #d1fae5 (the
// Class pill) is a raw hex, not a class, so it is never matched here.
const OFF_PALETTE = /\b(bg|text|border|ring|from|to|via|divide|ring-offset|outline|decoration|placeholder|accent|fill|stroke)-(amber|emerald|green|yellow)-\d{2,3}\b/g;

// Frozen count of pre-existing (grandfathered) off-palette status classes in the non-financial tree.
const BASELINE = 1420; // set by PALETTE_BASELINE_PRINT (2026-07-01) — grandfathered; ratchet only downward

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

const files = ROOTS.flatMap(walk).filter((f) => {
  const norm = "/" + f.replace(/\\/g, "/") + "/";
  return !FINANCIAL_SEGMENTS.some((seg) => norm.includes(seg));
});

let count = 0;
const perFile = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const m = src.match(OFF_PALETTE);
  if (m && m.length) { count += m.length; perFile.push([f, m.length]); }
}

if (process.env.PALETTE_BASELINE_PRINT) {
  console.log(`non-financial off-palette status classes: ${count} (across ${perFile.length} files)`);
  process.exit(0);
}

if (count > BASELINE) {
  perFile.sort((a, b) => b[1] - a[1]);
  fail(
    `off-palette §7 status classes INCREASED: ${count} > baseline ${BASELINE}. A new amber/emerald/green/` +
    `yellow status class was added to the non-financial UI. Use §7 tokens instead (bg-slate-100 / ` +
    `text-slate-600|700 / border-slate-200; red only for delete/Accident; green pill #d1fae5 = Class pill ` +
    `only).\n  Top files:\n  ` + perFile.slice(0, 15).map(([f, n]) => `${f}: ${n}`).join("\n  ")
  );
}

if (count < BASELINE) {
  console.log(
    `OK verify-section7-palette-nonfinancial: ${count} off-palette status classes (< baseline ${BASELINE}). ` +
    `You removed some — please lower BASELINE to ${count} (PALETTE_BASELINE_PRINT=1) so the ratchet tightens.`
  );
} else {
  console.log(`OK verify-section7-palette-nonfinancial: ${count} off-palette status classes == baseline (frozen; no NET-NEW).`);
}
