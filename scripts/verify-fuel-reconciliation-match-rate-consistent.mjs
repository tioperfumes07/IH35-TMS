#!/usr/bin/env node
/**
 * FUEL-RECON-MATCH-RATE-VS-ROW-MISMATCH — /reports/fuel-reconciliation's headline "Match Rate" KPI
 * used to be computed from a looser "unit appears in both source queries" check, while each visible
 * row's own `matched_pct` correctly required real dollars on both sides (card_amount_cents > 0 AND
 * wo_amount_cents > 0). The WO-side query has no `fuel_cost_cents > 0` filter (unlike the sibling
 * unmatchedWo query, which does), so a unit could land in the WO map with cents = 0 and still count
 * as "matched" by the old aggregate. Live-confirmed: MATCH RATE showed 14.3% while all 7 visible
 * rows showed 0% matched -- a self-contradicting report.
 *
 * Fixed by extracting a single `computeFuelMatchRatePct` function that both the aggregate and the
 * (already-correct) per-row `matched_pct` logic are provably consistent with. This guard asserts
 * the route handler computes match_rate_pct via that shared function, and that the function itself
 * requires real dollars on both sides -- not raw key-set membership.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/reports/fuel-reconciliation.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const stripped = stripComments(text);

  need(
    /export function computeFuelMatchRatePct/.test(stripped),
    "computeFuelMatchRatePct must exist as an exported, unit-testable function"
  );
  need(
    /const match_rate_pct = computeFuelMatchRatePct\(byTruck\)/.test(stripped),
    "match_rate_pct must be computed by calling computeFuelMatchRatePct(byTruck) -- not a separate, potentially inconsistent key-set calculation"
  );

  const fnMatch = stripped.match(/export function computeFuelMatchRatePct\([\s\S]*?\n}/);
  need(fnMatch, "could not isolate the computeFuelMatchRatePct function body");
  if (fnMatch) {
    const body = fnMatch[0];
    need(
      /card_amount_cents > 0 && t\.wo_amount_cents > 0/.test(body) ||
        /t\.card_amount_cents > 0 && t\.wo_amount_cents > 0/.test(body),
      "matchedUnits must require card_amount_cents > 0 AND wo_amount_cents > 0 (real dollars both sides), matching the per-row matched_pct definition"
    );
    need(
      /activeUnitCount === 0 \? 100/.test(body),
      "must guard the zero-active-units case explicitly (division by zero), returning 100 not NaN"
    );
  }

  // The old, looser definition must not reappear anywhere in the file.
  need(
    !/unitsWithCard\.has\(id\)|new Set\(cardMap\.keys\(\)\)/.test(stripped),
    "the old key-set-membership match logic (unitsWithCard/unitsWithWo) must not come back -- it double-counts units with zero real dollars on one side"
  );

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fuel-reconciliation-match-rate-consistent FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "remove the exported function",
      mutate: (t) => t.replace("export function computeFuelMatchRatePct", "function computeFuelMatchRatePct"),
    },
    {
      name: "stop calling it from the route",
      mutate: (t) =>
        t.replace(
          "const match_rate_pct = computeFuelMatchRatePct(byTruck);",
          "const match_rate_pct = 100;"
        ),
    },
    {
      name: "loosen matchedUnits back to key-set presence",
      mutate: (t) =>
        t.replace(
          "const matchedUnits = byTruck.filter((t) => t.card_amount_cents > 0 && t.wo_amount_cents > 0).length;",
          "const matchedUnits = byTruck.length;"
        ),
    },
    {
      name: "drop the divide-by-zero guard",
      mutate: (t) =>
        t.replace(
          "return activeUnitCount === 0 ? 100 : Math.round((matchedUnits / activeUnitCount) * 1000) / 10;",
          "return Math.round((matchedUnits / activeUnitCount) * 1000) / 10;"
        ),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-fuel-reconciliation-match-rate-consistent SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-fuel-reconciliation-match-rate-consistent PASS — the headline match rate and per-row matched_pct share one real-dollar definition"
);
