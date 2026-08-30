#!/usr/bin/env node
/**
 * verify-page-header-title-actions-no-overlap.mjs  (BANKING-HOME-TITLE-ACTIONS-OVERLAP)
 *
 * Root cause: apps/frontend/src/components/layout/PageHeader.tsx's title-group container carried
 * both `flex-1` AND `min-w-0` inside a `flex-wrap` row shared with the actions block. `min-w-0` let
 * the flex algorithm shrink the whole title-group narrower than its own `h1` (flexShrink:0, nowrap,
 * no overflow clipping) whenever the actions block's natural width left little room on the header's
 * first line — instead of wrapping the actions to their own line, the browser shrank the title-group
 * box down to a few px and the h1's text rendered straight over the actions. Live-reproduced and
 * live-fixed on /banking/transactions (a short action list that fits the first line, unlike the long
 * Accounts-tab action list that already forced a correct wrap) before touching source: removing
 * min-w-0 restores the correct wrap-to-second-line behavior.
 *
 * This is a SHARED component (~200 pages import it) — the guard makes the regression impossible to
 * re-ship anywhere in the app, not just on the one page it was found on.
 *
 * Usage:
 *   node scripts/verify-page-header-title-actions-no-overlap.mjs            # scan
 *   node scripts/verify-page-header-title-actions-no-overlap.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const HEADER_FILE = "apps/frontend/src/components/layout/PageHeader.tsx";

// Two safe layouts have shipped:
//   1. natural-width title group, which makes flex-wrap move actions below; or
//   2. a shrinkable title group whose overflow is clipped, paired with an elevated/non-shrinking
//      actions group. ACCT-F6409 deliberately adopted (2) to contain very long title/subtitle rows.
// The original defect is min-w-0 WITHOUT that containment pair.
const TITLE_GROUP_RE = /<div className="flex\s+flex-1 items-end gap-2">/;
const CONTAINED_TITLE_GROUP_RE = /<div className="flex min-w-0 flex-1 items-end gap-2 overflow-hidden">/;
const CONTAINED_ACTIONS_RE = /<div className="relative z-50 w-full shrink-0 sm:w-auto">\{actions\}<\/div>/;
const REGRESSION_RE = /<div className="flex min-w-0 flex-1 items-end gap-2">/;

export function checkPageHeaderNoOverlap(src) {
  const offenders = [];
  if (REGRESSION_RE.test(src)) {
    offenders.push(
      `${HEADER_FILE}: title-group div carries min-w-0 again — BANKING-HOME-TITLE-ACTIONS-OVERLAP regression (title-group can shrink below the h1's content width, and the actions block renders on top of the overflowing title instead of wrapping below it).`,
    );
    return offenders;
  }
  const wrapsNaturally = TITLE_GROUP_RE.test(src);
  const containsOverflow = CONTAINED_TITLE_GROUP_RE.test(src) && CONTAINED_ACTIONS_RE.test(src);
  if (!wrapsNaturally && !containsOverflow) {
    offenders.push(
      `${HEADER_FILE}: neither safe header layout is complete — require natural title wrapping or the overflow-hidden title + z-50 shrink-0 actions containment pair.`,
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, HEADER_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkPageHeaderNoOverlap(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-end gap-2">
          <button aria-label="Back" />
          <h1>{title}</h1>
        </div>
        <div className="w-full sm:w-auto">{actions}</div>
      </div>
  `;
  const fixed = `
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 items-end gap-2">
          <button aria-label="Back" />
          <h1>{title}</h1>
        </div>
        <div className="w-full sm:w-auto">{actions}</div>
      </div>
  `;

  const contained = `
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-end gap-2 overflow-hidden">
          <button aria-label="Back" />
          <h1>{title}</h1>
        </div>
        <div className="relative z-50 w-full shrink-0 sm:w-auto">{actions}</div>
      </div>
  `;
  const containedWithoutClip = contained.replace(" overflow-hidden", "");
  const containedWithoutActionBoundary = contained.replace("relative z-50 w-full shrink-0 sm:w-auto", "w-full sm:w-auto");

  const buggyFails = checkPageHeaderNoOverlap(buggy).length > 0;
  const fixedPasses = checkPageHeaderNoOverlap(fixed).length === 0;
  const containedPasses = checkPageHeaderNoOverlap(contained).length === 0;
  const clipRemovalFails = checkPageHeaderNoOverlap(containedWithoutClip).length > 0;
  const actionBoundaryRemovalFails = checkPageHeaderNoOverlap(containedWithoutActionBoundary).length > 0;

  if (buggyFails && fixedPasses && containedPasses && clipRemovalFails && actionBoundaryRemovalFails) {
    console.log("verify:page-header-title-actions-no-overlap selftest OK — 5/5 layout states distinguished");
    process.exit(0);
  }
  console.error("verify:page-header-title-actions-no-overlap selftest FAILED", {
    buggyFails,
    fixedPasses,
    containedPasses,
    clipRemovalFails,
    actionBoundaryRemovalFails,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify:page-header-title-actions-no-overlap FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify:page-header-title-actions-no-overlap OK — shared PageHeader wraps naturally or contains title overflow behind non-shrinking actions",
  );
}
