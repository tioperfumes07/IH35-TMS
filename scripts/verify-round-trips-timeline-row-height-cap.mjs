#!/usr/bin/env node
/**
 * RT-ROW-HEIGHT-CAP (owner correction 2026-09-11, verbatim): "fix the row height cap so 16 units fit
 * in view (RoundTripsTimeline.tsx's row height currently grows unbounded with leg count -- cap it or
 * make the column that grows scrollable independently, not the whole page)."
 *
 * Before this fix, a unit's own row height was `40 + (legs+undated)*22` with NO upper bound -- a
 * single busy unit with many legs could grow tall enough to push every other unit below the fold,
 * defeating "16 units visible without excess scrolling." This guard asserts the cap constants exist
 * and are actually used to bound the row height, and that the over-cap case gets an independently
 * scrollable bars container (overflow-y-auto + maxHeight) rather than an ever-taller row.
 *
 * Self-testing static guard. Run: node scripts/verify-round-trips-timeline-row-height-cap.mjs [--selftest]
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx";
const original = fs.readFileSync(FILE, "utf8");

const contracts = [
  [
    "ROW_MAX_VISIBLE_LEGS cap constant exists",
    (s) => /const ROW_MAX_VISIBLE_LEGS = \d+/.test(s),
    (s) => s.replace(/const ROW_MAX_VISIBLE_LEGS = \d+;/, "const ROW_MAX_VISIBLE_LEGS = Infinity;"),
  ],
  [
    "row minHeight is computed from the CAPPED visible-leg count, not the raw unbounded leg count",
    (s) => /const visibleLegRows = Math\.min\(totalLegRows, ROW_MAX_VISIBLE_LEGS\)/.test(s) && /const rowMinHeight = ROW_HEADER_HEIGHT \+ visibleLegRows \* LEG_ROW_HEIGHT/.test(s),
    (s) => s.replace("const rowMinHeight = ROW_HEADER_HEIGHT + visibleLegRows * LEG_ROW_HEIGHT;", "const rowMinHeight = ROW_HEADER_HEIGHT + totalLegRows * LEG_ROW_HEIGHT;"),
  ],
  [
    "an over-cap unit's bars container gets overflow-y-auto + a bounded maxHeight (scrolls internally, never grows the row)",
    // Scoped to the specific conditional expression (not a bare /overflow-y-auto/ word match) --
    // the OUTER page-level scroll container (a separate, pre-existing, unconditional overflow-y-auto
    // a few lines above) would otherwise mask a mutation that removes THIS row-level one.
    (s) => /barsOverflow \? "overflow-y-auto" : ""/.test(s) && /maxHeight: barsOverflow \? rowMinHeight : undefined/.test(s),
    (s) => s.replace('barsOverflow ? "overflow-y-auto" : ""', '""'),
  ],
];

function audit(source) {
  return contracts.filter(([, test]) => !test(source)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-round-trips-timeline-row-height-cap] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, test, mutate] of contracts) {
    const mutated = mutate(original);
    if (mutated === original) throw new Error(`selftest mutate() was a no-op for: ${name}`);
    if (!test(mutated)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-round-trips-timeline-row-height-cap] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-round-trips-timeline-row-height-cap] OK — row height is capped, over-cap units scroll internally instead of growing the row");
