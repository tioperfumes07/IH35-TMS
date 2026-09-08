#!/usr/bin/env node
/**
 * verify-factoring-chargebacks-summary-not-interleaved.mjs
 *
 * NEW-24 (owner 2026-09-07 raw findings): "Chargebacks & Fee History screen is split awkwardly
 * with Monthly Fee Summaries mixed in — give each its own tab/window, or put Monthly Fee Summary
 * above, not interleaved." Live-verified on /factoring/chargebacks-fees (Chrome, this session):
 * the two panels ("Chargebacks + fee history" and "Monthly fee summaries") sat side-by-side in a
 * `grid lg:grid-cols-2` — each squeezed into half the screen width, not the owner's "above, not
 * interleaved" ask.
 *
 * FIX: FactoringHome.tsx's chargebacks_fees tab is now a vertical stack (no lg:grid-cols-2),
 * Monthly fee summaries FIRST (full width), Chargebacks + fee history SECOND (full width) --
 * the owner's own second stated option.
 *
 * WHAT IS ASSERTED: within the chargebacks_fees tab block, "Monthly fee summaries" appears
 * BEFORE "Chargebacks + fee history" in source order, and the two panels are not both children
 * of the same `grid ... lg:grid-cols-2` row.
 *
 * Usage:
 *   node scripts/verify-factoring-chargebacks-summary-not-interleaved.mjs            # scan
 *   node scripts/verify-factoring-chargebacks-summary-not-interleaved.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-chargebacks-summary-not-interleaved";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkStackedNotInterleaved(src) {
  const failures = [];
  const tabSection = src.split('tab === "chargebacks_fees"')[1]?.split('tab === "statements_settings"')[0] ?? "";
  if (!tabSection) {
    failures.push(`${HOME}: could not find the chargebacks_fees tab block.`);
    return failures;
  }
  const summaryIdx = tabSection.indexOf("Monthly fee summaries");
  const detailIdx = tabSection.indexOf("Chargebacks + fee history");
  if (summaryIdx === -1 || detailIdx === -1) {
    failures.push(`${HOME}: chargebacks_fees tab is missing one of the two panels.`);
    return failures;
  }
  if (summaryIdx > detailIdx) {
    failures.push(
      `${HOME}: NEW-24 regression -- "Monthly fee summaries" must render ABOVE "Chargebacks + fee history" ` +
        `(owner: "put Monthly Fee Summary above, not interleaved").`,
    );
  }
  // The two panels must not both sit inside the same lg:grid-cols-2 row (that IS the
  // "interleaved side-by-side" shape the owner flagged).
  if (/grid[^"']*lg:grid-cols-2[^"']*"[\s\S]{0,400}Monthly fee summaries/.test(tabSection) &&
      /grid[^"']*lg:grid-cols-2[^"']*"[\s\S]{0,400}Chargebacks \+ fee history/.test(tabSection)) {
    failures.push(
      `${HOME}: NEW-24 regression -- both panels sit inside the same lg:grid-cols-2 row (side-by-side, interleaved).`,
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(HOME);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkStackedNotInterleaved(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    tab === "chargebacks_fees" ? (
      <div>
        <div>Monthly fee summaries</div>
        <div>Chargebacks + fee history</div>
      </div>
    ) : null

    tab === "statements_settings" ? (
      <div>Statement history</div>
    ) : null
  `;
  const badReversedOrder = `
    tab === "chargebacks_fees" ? (
      <div>
        <div>Chargebacks + fee history</div>
        <div>Monthly fee summaries</div>
      </div>
    ) : null

    tab === "statements_settings" ? (
      <div>Statement history</div>
    ) : null
  `;
  const badSideBySide = `
    tab === "chargebacks_fees" ? (
      <div className="grid gap-3 lg:grid-cols-2">
        <div>Monthly fee summaries</div>
        <div>Chargebacks + fee history</div>
      </div>
    ) : null

    tab === "statements_settings" ? (
      <div>Statement history</div>
    ) : null
  `;

  const checks = [
    ["clean stacked order passes", checkStackedNotInterleaved(goodSrc).length === 0],
    ["reversed order fails", checkStackedNotInterleaved(badReversedOrder).length > 0],
    ["side-by-side grid fails", checkStackedNotInterleaved(badSideBySide).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Monthly fee summaries renders above Chargebacks + fee history, not interleaved (NEW-24)`);
process.exit(0);
