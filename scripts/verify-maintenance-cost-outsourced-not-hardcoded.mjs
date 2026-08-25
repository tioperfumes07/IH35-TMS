#!/usr/bin/env node
/**
 * MAINT-COST-OUTSOURCED-HARDCODED-ZERO — /reports/maintenance-cost-per-unit's per-unit Outsourced
 * column was a literal `0::text AS outsourced_cents` in the SQL -- never computed from real data.
 * The CTE chain already computes `other_cents` (WO line items that are neither 'part'/'parts' nor
 * 'labor') and carries it through wo_enriched.other_cents, but the final SELECT dropped it silently
 * instead of surfacing it. Consequence: any unit with real non-part/non-labor WO spend (line_type=
 * 'other', e.g. roadside/outsourced work) showed Outsourced = $0.00 while Total (SUM of
 * wo.total_actual_cost) still included that spend, so Parts + Labor + Outsourced never summed to
 * Total on that row. Live-confirmed: unit USMCA-001 had two real WOs, both 100% line_type='other'
 * ($75.00 + $125.00 = $200.00), Outsourced showed $0.00, Total correctly showed $200.00.
 *
 * This guard asserts the unitAgg query sums we.other_cents into outsourced_cents instead of a
 * hardcoded literal, and that the literal-zero pattern cannot silently come back.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/reports/maintenance-cost-per-unit.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const stripped = stripComments(text);

  need(
    /COALESCE\(SUM\(we\.other_cents\), 0\)::text AS outsourced_cents/.test(stripped),
    "outsourced_cents must be COALESCE(SUM(we.other_cents), 0)::text -- the real non-part/non-labor line-item sum, not a hardcoded literal"
  );
  need(
    !/0::text AS outsourced_cents/.test(stripped),
    "outsourced_cents must never be a hardcoded 0::text literal again -- that silently drops real other_cents spend from the Outsourced column while Total still counts it"
  );
  // wo_enriched must still carry other_cents through so there is something real to sum.
  need(
    /other_cents AS other_cents|COALESCE\(lt\.other_cents, 0\) AS other_cents/.test(stripped),
    "wo_enriched must still compute/carry other_cents from line_totals -- do not remove the source data this fix depends on"
  );

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-maintenance-cost-outsourced-not-hardcoded FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "revert to hardcoded 0::text",
      mutate: (t) =>
        t.replace(
          "COALESCE(SUM(we.other_cents), 0)::text AS outsourced_cents",
          "0::text AS outsourced_cents"
        ),
    },
    {
      name: "sum the wrong column (parts again) instead of other_cents",
      mutate: (t) =>
        t.replace(
          "COALESCE(SUM(we.other_cents), 0)::text AS outsourced_cents",
          "COALESCE(SUM(we.parts_cents), 0)::text AS outsourced_cents"
        ),
    },
    {
      name: "drop other_cents from wo_enriched entirely",
      mutate: (t) => t.replace(/COALESCE\(lt\.other_cents, 0\) AS other_cents,?\n?/, ""),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-maintenance-cost-outsourced-not-hardcoded SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-maintenance-cost-outsourced-not-hardcoded PASS — Outsourced sums real other_cents, not a hardcoded zero"
);
