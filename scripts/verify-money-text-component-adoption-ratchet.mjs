#!/usr/bin/env node
/**
 * GLB-05 (owner-ordered 2026-09-01/09-04) — "All money renders in QuickBooks number format
 * ($1,234.56, right aligned, tabular numerals). ONE money component. No exceptions."
 *
 * apps/frontend/src/components/MoneyText.tsx is that one component; apps/frontend/src/lib/money.ts
 * already carries the underlying formatUsdCents/formatUsd formatters. Retrofitting every existing
 * hand-rolled `toLocaleString(..., { style: "currency" })` call site app-wide in one PR is a
 * mega-PR this codebase's own convention rejects (vertical-sweep-by-class: measure the class
 * globally, publish the shared helper, ratchet-guard it — a slice is not a drain). This is that
 * ratchet: the frozen baseline is measured LIVE below, and the count may never go UP. CC-2 owns
 * banking/accounting; converting the remaining files in every OTHER lane is that lane's own work,
 * filed to GUARD-WORKORDERS.md per lane rather than fixed here.
 *
 * A file is exempt if it IS the canonical implementation (lib/money.ts, MoneyText.tsx) — those are
 * the only two places allowed to know what `style: "currency"` means.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-text-component-adoption-ratchet";
const SRC = path.join(ROOT, "apps/frontend/src");

// Frozen 2026-09-04, live-measured with this exact guard's own walk()/regex. Owner order: "every
// money field in the app uses it" — converted 52 more files this pass (on top of the original 6
// already shipped) from a hand-rolled currency formatter (some with an unpinned-locale bug, most
// just a duplicate of formatUsdCents) to the canonical formatUsdCents. 61 occurrences across 58
// files remain, catalogued by lane in GUARD-WORKORDERS.md so each owning seat can convert their
// own surfaces. Ratchet only ever moves down from here.
const BASELINE_OCCURRENCES = 61;
const BASELINE_FILES = 58;

const EXEMPT = new Set(["apps/frontend/src/lib/money.ts", "apps/frontend/src/components/MoneyText.tsx"]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
}

/** Pure check over a list of {path, source} entries, so --selftest can prove it with fixtures. */
export function countRawCurrencyFormatting(files) {
  const RAW = /style:\s*['"]currency['"]/;
  let occurrences = 0;
  const filesHit = new Set();
  for (const { relPath, source } of files) {
    if (EXEMPT.has(relPath)) continue;
    const lines = source.split("\n");
    for (const line of lines) {
      if (RAW.test(line)) {
        occurrences += 1;
        filesHit.add(relPath);
      }
    }
  }
  return { occurrences, files: filesHit.size };
}

function runSelftest() {
  const clean = [{ relPath: "apps/frontend/src/pages/x/Y.tsx", source: `const money = (c) => formatUsdCents(c);\n` }];
  const cleanResult = countRawCurrencyFormatting(clean);
  if (cleanResult.occurrences !== 0) {
    throw new Error(`selftest: a file with no raw formatting must count 0 — got ${cleanResult.occurrences}`);
  }

  const exempt = [{ relPath: "apps/frontend/src/lib/money.ts", source: `style: "currency", currency: "USD"` }];
  const exemptResult = countRawCurrencyFormatting(exempt);
  if (exemptResult.occurrences !== 0) {
    throw new Error("selftest: lib/money.ts itself must be exempt — the canonical implementation is allowed to say 'currency'");
  }

  const planted = [
    { relPath: "apps/frontend/src/pages/x/Y.tsx", source: `const money = (c) => (c/100).toLocaleString(undefined, { style: "currency", currency: "USD" });\n` },
  ];
  const plantedResult = countRawCurrencyFormatting(planted);
  if (plantedResult.occurrences !== 1 || plantedResult.files !== 1) {
    throw new Error(`selftest: a new hand-rolled currency format must be counted — got ${JSON.stringify(plantedResult)}`);
  }

  console.log(`[${LABEL}] --selftest OK (clean fixture counts 0; lib/money.ts itself is exempt; a planted hand-rolled format is counted)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const files = [];
walk(SRC, files);
const entries = files.map((f) => ({
  relPath: path.relative(ROOT, f).split(path.sep).join("/"),
  source: fs.readFileSync(f, "utf8"),
}));
const { occurrences, files: fileCount } = countRawCurrencyFormatting(entries);

if (occurrences > BASELINE_OCCURRENCES) {
  console.error(`${LABEL} FAIL — raw hand-rolled currency formatting went UP: ${BASELINE_OCCURRENCES} -> ${occurrences} (+${occurrences - BASELINE_OCCURRENCES}). New money display code must use MoneyText (components/MoneyText.tsx) or formatUsdCents/formatUsd (lib/money.ts), never a per-file toLocaleString/style:"currency" reimplementation.`);
  process.exit(1);
}
console.log(`${LABEL} OK — raw hand-rolled currency formatting: ${occurrences} occurrences / ${fileCount} files (baseline ${BASELINE_OCCURRENCES}/${BASELINE_FILES}, ${occurrences < BASELINE_OCCURRENCES ? `${BASELINE_OCCURRENCES - occurrences} converted since baseline` : "no change"})`);
process.exit(0);
