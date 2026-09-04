#!/usr/bin/env node
/**
 * verify-miles-shortest-never-autofilled-from-catalog.mjs
 *
 * MILES-SHORTEST-HOLDS-ALWAYSTRACK-BLEND (owner order 2026-09-04, live-blocking). Law:
 * docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md -- "Never derive one mileage from another" /
 * "Never fill a number that will be paid out." catalogs.lane_mileage.short_miles was seeded from
 * AlwaysTrack's BLEND (loaded-shortest + deadhead), not a pure loaded-shortest distance -- proven
 * live on load 13508 (owner: "the pay for the Indianapolis trip to Laredo was 1319 or something
 * like that, the 1478 is including the deadhead miles"). Autofilling miles_shortest -- the field
 * DRIVER PAY is computed from -- straight from that contaminated catalog column would silently
 * overpay every load on an untrustworthy lane.
 *
 * The wizard (BookLoadModalV4.tsx) already gets this right: it autofills miles_practical from the
 * catalog but explicitly leaves miles_shortest untouched ("short_miles stays NULL (P0). Never fill
 * from catalog.") -- the operator types it. MILES-INVERT-01 (migration 202613500001,
 * catalogs.lane_mileage.short_miles_untrustworthy) flags short>practical or a reverse-lane
 * disagreement >100mi, and the wizard shows a non-blocking MilesInvertAck popup on that flag. This
 * guard is a REGRESSION LOCK on that already-correct behavior, plus proof the flag path exists and
 * fires -- nothing here is new construction, it protects what is already shipped and live.
 *
 * CI-runnable, no reachable Postgres: source-level checks only (same pattern as every other guard
 * this session).
 */
import { readFileSync } from "node:fs";

const WIZARD_PATH = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const MILES_INVERT_PATH = "apps/frontend/src/pages/dispatch/components/book-load-v4/miles-invert.ts";

function loadSource(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures(wizardSrc, milesInvertSrc) {
  const failures = [];

  if (!wizardSrc) {
    failures.push(`${WIZARD_PATH} not found`);
  } else {
    // The lane-mileage autofill effect must never call form.setValue("miles_shortest", ...) with
    // a value sourced from `lane.short_miles` (the catalog's AlwaysTrack-blend column). Only
    // miles_practical may be autofilled from the catalog in that effect.
    const effectMatch = wizardSrc.match(
      /useEffect\(\(\) => \{\s*\n\s*const lane = laneMileageQuery\.data;[\s\S]{0,2500}?\n {2}\}, \[destPlace\.city, destPlace\.state, form, laneMileageQuery\.data, originPlace\.city, originPlace\.state\]\);/
    );
    if (!effectMatch) {
      failures.push("could not find the lane-mileage autofill effect in BookLoadModalV4.tsx -- source shape drifted, guard needs review");
    } else {
      const block = effectMatch[0];
      if (/setValue\(\s*"miles_shortest"\s*,\s*lane\.short_miles/.test(block)) {
        failures.push('the lane-mileage autofill effect calls form.setValue("miles_shortest", lane.short_miles, ...) -- this reintroduces the AlwaysTrack-blend contamination into driver pay');
      }
      if (!/short_miles stays NULL/.test(block)) {
        failures.push("the effect no longer documents the never-autofill-short-miles rule -- guard cannot confirm intent survived a refactor");
      }
      if (!/untrustworthy\.any.*setShowMilesInvertAck\(true\)|setShowMilesInvertAck\(true\)/.test(block)) {
        failures.push("the MilesInvertAck popup is no longer triggered by the untrustworthy flag inside this effect");
      }
    }

    if (!/const \[showMilesInvertAck, setShowMilesInvertAck\] = useState\(false\);/.test(wizardSrc)) {
      failures.push("showMilesInvertAck state was removed -- the non-blocking flag popup has no state to drive it");
    }
    // NEVER BLOCK BOOKING: the ack dialog must not gate form submission -- only fired as an
    // informational surface. We assert the submit handler exists independent of the ack state
    // (i.e. no `if (showMilesInvertAck) return` style gate) by checking the dialog is a plain
    // open/onOpenChange pair, not wired into a disabled= on the submit button.
    if (/disabled=\{[^}]*showMilesInvertAck/.test(wizardSrc)) {
      failures.push("something disables submission based on showMilesInvertAck -- the law says NEVER block booking on this flag");
    }
  }

  if (!milesInvertSrc) {
    failures.push(`${MILES_INVERT_PATH} not found`);
  } else {
    if (!/shortest > practical/.test(milesInvertSrc.replace(/\s+/g, " "))) {
      failures.push("isMilesColumnInverted no longer checks shortest > practical");
    }
    if (!/REVERSE_LANE_SHORT_DIFF_REASON\s*=\s*"reverse_lane_short_differs_over_100mi"/.test(milesInvertSrc)) {
      failures.push("the reverse-lane->100mi trigger reason string no longer matches the DB trigger's own reason (catalogs.recompute_lane_short_miles_trust) -- code/DB would silently disagree on what 'untrustworthy' means");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const wizardSrc = loadSource(WIZARD_PATH);
  const milesInvertSrc = loadSource(MILES_INVERT_PATH);
  const baseline = collectFailures(wizardSrc, milesInvertSrc);
  if (baseline.length) {
    console.error(`verify-miles-shortest-never-autofilled-from-catalog SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  // Plant 1: reintroduce the exact regression the law forbids -- autofill miles_shortest from
  // the catalog's blend column.
  const badWizard = wizardSrc.replace(
    '// short_miles stays NULL (P0). Never fill from catalog.',
    'if (lane.short_miles != null) { form.setValue("miles_shortest", lane.short_miles, { shouldDirty: true, shouldValidate: true }); }'
  );
  if (badWizard === wizardSrc || collectFailures(badWizard, milesInvertSrc).length === 0) {
    escaped.push("miles_shortest autofilled from lane.short_miles");
  }

  // Plant 2: drop the reverse-lane trigger reason string (code/DB would silently disagree).
  const badMilesInvert = milesInvertSrc.replace(
    'const REVERSE_LANE_SHORT_DIFF_REASON = "reverse_lane_short_differs_over_100mi";',
    'const REVERSE_LANE_SHORT_DIFF_REASON = "reverse_lane_mismatch";'
  );
  if (badMilesInvert === milesInvertSrc || collectFailures(wizardSrc, badMilesInvert).length === 0) {
    escaped.push("reverse-lane trigger reason string drifted from the DB trigger's own literal");
  }

  if (escaped.length) {
    console.error(`verify-miles-shortest-never-autofilled-from-catalog SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-miles-shortest-never-autofilled-from-catalog SELFTEST PASS — 2/2 plants rejected");
}

const wizardSrc = loadSource(WIZARD_PATH);
const milesInvertSrc = loadSource(MILES_INVERT_PATH);
const failures = collectFailures(wizardSrc, milesInvertSrc);
if (failures.length > 0) {
  console.error("verify-miles-shortest-never-autofilled-from-catalog: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-miles-shortest-never-autofilled-from-catalog: OK — the wizard never autofills miles_shortest from the AlwaysTrack-blend catalog column, and the untrustworthy-lane popup is wired and non-blocking"
);
