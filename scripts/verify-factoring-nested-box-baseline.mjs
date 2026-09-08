#!/usr/bin/env node
// GUARD for the FactoringHome.tsx nested-box CI regression (2026-09-08).
//
// FINDING: FactoringHome.tsx regressed from the ratcheted nested-box baseline
// of 1 to 5 (Fees Paid + Statements view-toggle wrappers, 3 Aging Report stat
// tiles) during an earlier FAC-09a build, silently blocking the required
// `locked-guards` / `locked-guards-heavy` CI checks on every unrelated PR
// touching this repo. Fixed by stripping the redundant `rounded-sm` class
// from 5 inner wrapper/tile <div> elements (keeping their `border` — so the
// visual boundary is unchanged, only the corner-rounding is dropped) so they
// no longer qualify as a "box" under verify-no-nested-box.mjs's
// rounded+border/shadow test while nested inside a real card.
//
// This guard statically asserts the 5 specific offending elements never
// regain a `rounded*` class alongside their border, and that
// verify-no-nested-box.mjs itself reports PASS with no NEW offenders in this
// file. It is deliberately narrow (this exact regression), not a re-
// implementation of the general ratchet.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

const MARKERS = [
  { testid: "factoring-fees-paid-view-toggle", label: "Fees Paid view toggle" },
  { testid: "factoring-statements-view-toggle", label: "Statements view toggle" },
  { testid: "factoring-aging-total-records", label: "Aging — Total Records tile", isChild: true },
  { testid: "factoring-aging-total-balance", label: "Aging — Total Balance tile", isChild: true },
];

function isRoundedBoxClassName(cls) {
  const hasRounded = /\brounded(-[a-z0-9]+)?\b/.test(cls);
  const hasBorder = /\bborder\b/.test(cls) && !/\bborder-(0|none)\b/.test(cls);
  const hasShadow = /\bshadow(-[a-z0-9]+)?\b/.test(cls) && !/\bshadow-none\b/.test(cls);
  return hasRounded && (hasBorder || hasShadow);
}

export function assertFactoringHome(src) {
  const errors = [];

  // 1) The two view-toggle wrappers: must carry `border` (visual boundary kept)
  //    but must NOT carry `rounded*` (that combination is what made them a
  //    "box" nested inside the real card).
  for (const testid of ["factoring-fees-paid-view-toggle", "factoring-statements-view-toggle"]) {
    const re = new RegExp(`className="([^"]*)"\\s+data-testid="${testid}"`);
    const m = re.exec(src);
    if (!m) {
      errors.push(`${testid}: element not found (was it removed or renamed?)`);
      continue;
    }
    const cls = m[1];
    if (isRoundedBoxClassName(cls)) {
      errors.push(`${testid}: className="${cls}" is rounded+border/shadow again — REGRESSED to a nested box.`);
    }
    if (!/\bborder\b/.test(cls)) {
      errors.push(`${testid}: lost its border entirely — visual boundary regression, not just the nested-box fix.`);
    }
  }

  // 2) The three Aging Report stat tiles (Total Records / bucket loop / Total
  //    Balance): same rule — border kept, rounded dropped. The bucket-loop
  //    tile is templated (`key={bucket}`), so match by its sibling markers
  //    (Total Records / Total Balance) plus a scan of the whole Aging block
  //    for any remaining `rounded-sm border border-gray-200 p-2 text-center`.
  const agingBlockMatch = /Aging Report — as of[\s\S]{0,2000}?factoring-aging-total-balance/.exec(src);
  if (!agingBlockMatch) {
    errors.push("Aging Report block not found by anchor text — structure changed, guard needs updating.");
  } else {
    const block = agingBlockMatch[0];
    const regressedTile = /rounded(-[a-z0-9]+)?\s+border\s+border-gray-200\s+p-2\s+text-center/.exec(block);
    if (regressedTile) {
      errors.push(`Aging Report stat tile regressed: found "${regressedTile[0]}" (rounded+border) inside the card again.`);
    }
    // Source has 3 literal JSX occurrences of this tile class: the static
    // "Total Records" tile, the templated bucket tile (rendered ×4 at
    // runtime but written once in source inside .map()), and the static
    // "Total Balance" tile.
    const tileCount = (block.match(/\bborder\s+border-gray-200\s+p-2\s+text-center\b/g) || []).length;
    if (tileCount < 3) {
      errors.push(`Aging Report stat tiles: expected the border+p-2+text-center tile class on all 3 source occurrences (Total Records / templated bucket / Total Balance), found ${tileCount} — investigate before assuming fixed.`);
    }
  }

  return errors;
}

function runNestedBoxGuard() {
  try {
    const out = execFileSync("node", ["scripts/verify-no-nested-box.mjs"], { encoding: "utf8" });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || "") };
  }
}

function selftest() {
  const bad = `
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="inline-flex overflow-hidden rounded-sm border border-gray-300" data-testid="factoring-fees-paid-view-toggle">x</div>
    </div>`;
  const badErrors = assertFactoringHome(bad);
  if (badErrors.length === 0) throw new Error("selftest FAILED: bad fixture (rounded+border wrapper) was not flagged");

  const good = `
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="inline-flex overflow-hidden border border-gray-300" data-testid="factoring-fees-paid-view-toggle">x</div>
      <div className="inline-flex overflow-hidden border border-gray-300" data-testid="factoring-statements-view-toggle">x</div>
      Aging Report — as of 2026-09-08
      <div className="border border-gray-200 p-2 text-center">
        <div data-testid="factoring-aging-total-records">1</div>
      </div>
      {["0-30"].map((bucket) => (
        <div key={bucket} className="border border-gray-200 p-2 text-center">bucket</div>
      ))}
      <div className="border border-gray-200 p-2 text-center">
        <div data-testid="factoring-aging-total-balance">2</div>
      </div>
    </div>`;
  const goodErrors = assertFactoringHome(good);
  if (goodErrors.length !== 0) throw new Error(`selftest FAILED: good fixture was flagged: ${goodErrors.join(" | ")}`);

  console.log("[verify-factoring-nested-box-baseline] selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(FILE, "utf8");
  const errors = assertFactoringHome(src);
  const nb = runNestedBoxGuard();

  if (errors.length || !nb.ok) {
    console.error("[verify-factoring-nested-box-baseline] FAIL");
    for (const e of errors) console.error(`  - ${e}`);
    if (!nb.ok) {
      console.error("  - verify-no-nested-box.mjs did not PASS:");
      console.error(nb.out.split("\n").map((l) => `      ${l}`).join("\n"));
    }
    process.exit(1);
  }
  console.log("[verify-factoring-nested-box-baseline] PASS — 5 offenders stay flat, verify-no-nested-box.mjs PASS");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
