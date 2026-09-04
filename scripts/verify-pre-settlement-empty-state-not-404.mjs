#!/usr/bin/env node
/**
 * verify-pre-settlement-empty-state-not-404.mjs
 *
 * LOAD-COSTS-COMPLETE follow-up (owner order 2026-09-04): "Pre-Settlement returns HTTP 404 for the
 * ordinary empty state. Return 200." GET /api/v1/driver-finance/pre-settlements/by-driver/:driverId
 * previously returned 404 when a driver simply has no open pre-settlement yet -- the ordinary state
 * before a driver's first southbound load of a tour, not an error. apiRequest() (api/client.ts)
 * throws on any non-2xx status, so this 404 made PreSettlementPanel.tsx's own existing, correctly-
 * built "No active pre-settlement found for this driver" branch unreachable -- callers saw the
 * alarming "Couldn't load pre-settlement" error state instead, for a state that was never an error.
 *
 * Source-level regression lock (CI has no reachable Postgres for this route's own query logic).
 */
import { readFileSync } from "node:fs";

const PATH = "apps/backend/src/driver-finance/pre-settlement.routes.ts";

function loadSource() {
  return readFileSync(PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (/reply\.code\(404\)\.send\(\{ error: "no_active_pre_settlement" \}\)/.test(src)) {
    failures.push("the by-driver route still returns a raw 404 for the ordinary no-active-pre-settlement state");
  }
  if (!/if \(!settlement\) return \{ settlement: null, lines: \[\] \};/.test(src)) {
    failures.push("the by-driver route no longer returns the honest { settlement: null, lines: [] } empty payload for this state");
  }
  // "schema_absent" is the ONLY case allowed to still return a non-200 (501, a real config gap) --
  // it must stay distinct from the ordinary empty-tour case above, never collapsed back into a 404.
  if (!/result === "schema_absent"/.test(src)) {
    failures.push("the schema_absent/no-open-tour distinction was removed -- both cases must not collapse back into one 404 branch");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = loadSource();
  const baseline = collectFailures(src);
  if (baseline.length) {
    console.error(`verify-pre-settlement-empty-state-not-404 SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const bad404 = src.replace(
    "if (!settlement) return { settlement: null, lines: [] };",
    'if (!settlement) return reply.code(404).send({ error: "no_active_pre_settlement" });'
  );
  if (bad404 === src || collectFailures(bad404).length === 0) {
    escaped.push("reintroduced raw 404 not caught");
  }

  const collapsedSchemaAbsent = src.replace('result === "schema_absent"', "false");
  if (collapsedSchemaAbsent === src || collectFailures(collapsedSchemaAbsent).length === 0) {
    escaped.push("schema_absent/no-open-tour distinction removal not caught");
  }

  if (escaped.length) {
    console.error(`verify-pre-settlement-empty-state-not-404 SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-pre-settlement-empty-state-not-404 SELFTEST PASS — 1/1 plants rejected");
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-pre-settlement-empty-state-not-404: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-pre-settlement-empty-state-not-404: OK — the ordinary no-open-pre-settlement state returns 200, never a raw 404");
