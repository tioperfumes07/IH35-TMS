#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["silent_no_op"],"leaves":["fuel.planner.send_to_driver_app"]} */
/**
 * CLASS-F5973-TRUE-REMAINDER-FUEL (leftover leaf): live-verified in Chrome on
 * https://app.ih35dispatch.com/fuel/planner with no active dispatch route — clicking "Send to driver
 * app" (both via the extension's simulated click AND a raw `HTMLButtonElement.click()` from the page's
 * own JS context, to rule out an automation-tooling false negative) produced ZERO effect: no dialog, no
 * toast, no DOM change, no network request. The button's onClick handler
 * (apps/frontend/src/pages/fuel/FuelPlannerHome.tsx) silently `return`ed on `!activeRoute` instead of
 * giving any feedback — indistinguishable from a dead button, the exact SILENT-NO-OP class the sibling
 * "+ Plan trip" button in the same header was already fixed for once (commit 2d17910c9, #1663,
 * "QA-sweep": "Honest disabled affordance instead of a silent no-op button").
 *
 * Fix: give "Send to driver app" the SAME honest-disabled-affordance treatment as "+ Plan trip" —
 * `disabled={!activeRoute || !companyId}` on the ActionButton, wrapped in a `<span title="...">`
 * explaining why, using this file's own established convention (not a plain unwrapped `title`, and not
 * a dead onClick left on a disabled native button — see FuelTransactionsTable.tsx's inconsistent
 * variant of this same anti-pattern, out of scope here).
 *
 * Self-test: node scripts/verify-fuel-send-to-driver-honest-disabled.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const LABEL = "verify-fuel-send-to-driver-honest-disabled";

export function audit(src) {
  const failures = [];

  const uploadIdx = src.indexOf("Upload Loves prices");
  const btnIdx = src.indexOf("Send to driver app");
  if (btnIdx === -1) {
    failures.push(`${FILE}: "Send to driver app" button text not found — was it removed?`);
    return failures;
  }
  // The wrapping span/disabled prop lives between the PRECEDING sibling button and this one's own
  // text, not at a fixed byte offset (the onClick handler body varies in length).
  const context = src.slice(uploadIdx === -1 ? Math.max(0, btnIdx - 1200) : uploadIdx, btnIdx + 50);

  const disabledExpression = context.match(/disabled=\{([^}]*)\}/)?.[1] ?? "";
  const hasRouteGuard = /(?:^|\|\|)\s*!activeRoute\s*(?:\|\||$)/.test(disabledExpression);
  const hasCompanyGuard = /(?:^|\|\|)\s*!companyId\s*(?:\|\||$)/.test(disabledExpression);
  const hasPendingGuard = /(?:^|\|\|)\s*sendRecommendationMutation\.isPending\s*(?:\|\||$)/.test(
    disabledExpression,
  );
  if (!hasRouteGuard || !hasCompanyGuard || !hasPendingGuard) {
    failures.push(
      `${FILE}: "Send to driver app" ActionButton must be disabled for a missing active route, ` +
        `missing company, or an in-flight send — otherwise the control can silently no-op or submit twice.`,
    );
  }
  if (!/<span\s+title=\{/.test(context)) {
    failures.push(
      `${FILE}: "Send to driver app" must be wrapped in a <span title={...}> explaining WHY it's ` +
        `disabled (same convention already used for the sibling "+ Plan trip" button) — a bare disabled ` +
        `button gives the user zero explanation.`,
    );
  }
  if (!/activeRoute\s*\?\s*undefined\s*:/.test(context)) {
    failures.push(
      `${FILE}: the tooltip must be conditional on activeRoute (undefined when enabled, an explanation ` +
        `string when disabled) — a static tooltip would lie while the button is actually clickable.`,
    );
  }

  return failures;
}

function loadSrc(root) {
  return fs.readFileSync(path.join(root, FILE), "utf8");
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { from: "!activeRoute || ", to: "" },
    { from: "!companyId || ", to: "" },
    { from: " || sendRecommendationMutation.isPending", to: "" },
    {
      from: `<span
                  title={
                    activeRoute
                      ? undefined
                      : "There is no active dispatch route to send — trip planning is generated from active dispatch loads"
                  }
                >`,
      to: "<>",
    },
    { from: "activeRoute\n                      ? undefined\n                      :", to: '"static text"; //' },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutated = good.split(m.from).join(m.to);
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — "Send to driver app" gives an honest disabled affordance instead of a silent no-op`);
