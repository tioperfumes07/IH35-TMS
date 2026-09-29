#!/usr/bin/env node
/**
 * verify-cancel-releases-presettlement-link.mjs
 *
 * ROUND 219 ADDENDUM (owner, 2026-09-28): load 13623 was cancelled while still pointing at an open
 * pre-settlement via mdata.loads.presettlement_link_id. ROOT CAUSE, confirmed live: that column is a
 * FORWARD pointer set at booking/dispatch time (presettlement-link.service.ts), before the load has
 * ever been pulled into a tour close and before any driver_finance.settlement_lines row exists for
 * it. cancelLoadInClientTx's VOID-CASCADE-SETTLEMENTS step only finds settlements that already have
 * settlement_lines for this load -- i.e. it only ever cleans up AFTER a tour has closed. A load
 * cancelled before its tour ever closes has zero settlement_lines, so that cascade finds nothing, and
 * the forward pointer was never released.
 *
 * This guard asserts the new VOID-CASCADE-PRESETTLEMENT-LINK-RELEASE step exists, is scoped to loads
 * with ZERO settlement_lines (so it can never touch a load whose settlement totals already reflect
 * it -- no amount, GL account, or settlement total ever moves), and is audited.
 */
import { readFileSync } from "node:fs";

const SERVICE_PATH = "apps/backend/src/dispatch/cancellation.service.ts";

function loadSource() {
  return readFileSync(SERVICE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!/SET presettlement_link_id = NULL, updated_at = now\(\)/.test(src)) {
    failures.push("cancellation.service.ts does not clear presettlement_link_id on cancel");
  }
  if (!/AND presettlement_link_id IS NOT NULL/.test(src)) {
    failures.push("presettlement-link release is not gated on the link actually being set (would no-op-scan every cancel for nothing, and risks a broader match)");
  }
  if (
    !/NOT EXISTS \(\s*SELECT 1 FROM driver_finance\.settlement_lines sl WHERE sl\.load_id = \$1::uuid\s*\)/.test(
      src
    )
  ) {
    failures.push(
      "presettlement-link release is not scoped to loads with ZERO settlement_lines -- could clear a pointer a settlement's own totals still depend on"
    );
  }
  if (!/dispatch\.load\.presettlement_link_released_by_cancel/.test(src)) {
    failures.push("presettlement-link release is not audited");
  }
  if (!/VOID-CASCADE-PRESETTLEMENT-LINK-RELEASE/.test(src)) {
    failures.push("presettlement-link release finding tag is missing");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-cancel-releases-presettlement-link SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    [
      "release UPDATE removed entirely",
      "SET presettlement_link_id = NULL, updated_at = now()",
      "SET updated_at = now()",
    ],
    ["IS NOT NULL gate removed", "AND presettlement_link_id IS NOT NULL\n", ""],
    [
      "zero-settlement_lines scope removed",
      "AND NOT EXISTS (\n                  SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.load_id = $1::uuid\n                )\n",
      "",
    ],
    [
      "audit event removed",
      '"dispatch.load.presettlement_link_released_by_cancel"',
      '"dispatch.load.patched"',
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-cancel-releases-presettlement-link SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-cancel-releases-presettlement-link SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-cancel-releases-presettlement-link: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-cancel-releases-presettlement-link: OK — cancelling a load with zero settlement_lines releases its presettlement_link_id forward pointer, audited, scoped so no amount/GL account/settlement total can ever move"
);
