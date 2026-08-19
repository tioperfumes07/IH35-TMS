#!/usr/bin/env node
/**
 * verify-fleet-unit-financial-pl-load-reverse.mjs
 * FLEET-UNIT-FINANCIAL-PL-LOAD-REVERSE-MISSING
 *
 * fleet:unit.profile.financial_pl requires `load`, `connectivity`, and `reverse_link` — the mounted
 * Financial P&L used to render only aggregate metrics with no contributing-load identity or drill.
 * A decorative link would be theater: this guard requires the returned load rows to come from the
 * SAME entity-scoped WHERE clause the revenue/mileage math is summed from (not an unrelated query),
 * and requires the frontend to render each one as a real canonical load drill, with an honest
 * empty state and an honest disclosed cap (no silent list truncation).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-fleet-unit-financial-pl-load-reverse";
const SERVICE = "apps/backend/src/mdata/unit-financial.service.ts";
const SECTION = "apps/frontend/src/components/vehicle-profile/FinancialUnitPLSection.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(overrides = {}) {
  const failures = [];
  const service = overrides.service ?? read(SERVICE);
  const section = overrides.section ?? read(SECTION);

  // The returned type must carry real load identities + an honest total count (not a bare "hasMore").
  if (!/contributing_loads:\s*UnitFinancialContributingLoad\[\]/.test(service)) {
    failures.push("UnitFinancialSnapshot must declare contributing_loads: UnitFinancialContributingLoad[]");
  }
  if (!/contributing_loads_total_count:\s*number/.test(service)) {
    failures.push("UnitFinancialSnapshot must declare contributing_loads_total_count: number (honest cap disclosure)");
  }

  // queryContributingLoads must scope on the SAME entity predicates as the revenue/mileage aggregate
  // (operating_company_id, assigned_unit_id, soft_deleted_at, period bounds) — not a looser query that
  // would leak cross-entity or off-period loads into a money-adjacent UI.
  const contribFnMatch = service.match(/async function queryContributingLoads[\s\S]*?\n}\n/);
  const contribFn = contribFnMatch ? contribFnMatch[0] : "";
  if (!contribFn) {
    failures.push("queryContributingLoads function not found");
  } else {
    if (!/operating_company_id\s*=\s*\$1::uuid/.test(contribFn)) {
      failures.push("queryContributingLoads must scope on operating_company_id = $1::uuid (entity scope)");
    }
    if (!/assigned_unit_id\s*=\s*\$2::uuid/.test(contribFn)) {
      failures.push("queryContributingLoads must scope on assigned_unit_id = $2::uuid (the SAME unit)");
    }
    if (!/soft_deleted_at IS NULL/.test(contribFn)) {
      failures.push("queryContributingLoads must exclude soft-deleted loads (soft_deleted_at IS NULL)");
    }
    if (!/created_at::date BETWEEN \$3::date AND \$4::date/.test(contribFn)) {
      failures.push("queryContributingLoads must scope on the SAME period bounds as the revenue aggregate");
    }
  }

  // getUnitFinancialYTD must actually call queryContributingLoads and thread both fields into the
  // returned snapshot — declaring the type is not enough; a stub `[]`/`0` would satisfy the type
  // checks above but be theater.
  if (!/const contributing = await queryContributingLoads\(/.test(service)) {
    failures.push("getUnitFinancialYTD must call queryContributingLoads(...)");
  }
  if (!/contributing_loads:\s*contributing\.loads/.test(service)) {
    failures.push("getUnitFinancialYTD must return contributing_loads: contributing.loads (not a stub)");
  }
  if (!/contributing_loads_total_count:\s*contributing\.totalCount/.test(service)) {
    failures.push("getUnitFinancialYTD must return contributing_loads_total_count: contributing.totalCount (not a stub)");
  }

  // Frontend must render a real canonical load drill for each contributing load, an honest empty
  // state, and an honest disclosed cap — not a decorative count with no link.
  if (!/kind="load"[\s\S]{0,120}id=\{load\.id\}/.test(section) && !/id=\{load\.id\}[\s\S]{0,120}kind="load"/.test(section)) {
    failures.push("FinancialUnitPLSection must render EntityLinkOrTombstone kind=\"load\" id={load.id} for each contributing load");
  }
  if (!/No loads contributed revenue in this period/.test(section)) {
    failures.push("FinancialUnitPLSection must render an honest empty state when contributing_loads is []");
  }
  if (!/totalCount - loads\.length/.test(section)) {
    failures.push("FinancialUnitPLSection must disclose the real remaining count when the list is capped (no silent cap)");
  }

  return failures;
}

// Mutate ONLY inside queryContributingLoads (its WHERE clause is textually identical to the sibling
// aggregate query's, so a plain non-global .replace() on the whole file would silently hit the WRONG
// occurrence and the mutation would escape detection for the wrong reason — mutate the extracted
// function body, then splice it back in via its own unique anchor).
function mutateContribFn(service, from, to) {
  const contribFnMatch = service.match(/async function queryContributingLoads[\s\S]*?\n}\n/);
  const contribFn = contribFnMatch ? contribFnMatch[0] : "";
  if (!contribFn.includes(from)) throw new Error(`selftest anchor not found in queryContributingLoads: ${from}`);
  return service.replace(contribFn, contribFn.replace(from, to));
}

function selftest() {
  const service = read(SERVICE);
  const section = read(SECTION);

  const mutations = [
    ["type declaration removed", { service: service.replace("contributing_loads: UnitFinancialContributingLoad[];", "// removed") }],
    ["entity-scope predicate dropped", { service: mutateContribFn(service, "l.assigned_unit_id = $2::uuid", "true") }],
    ["soft-delete filter dropped", { service: mutateContribFn(service, "AND l.soft_deleted_at IS NULL\n", "") }],
    ["stubbed return (theater)", { service: service.replace("contributing_loads: contributing.loads,", "contributing_loads: [],") }],
    ["frontend link removed", { section: section.replace('kind="load"', 'kind="unit"') }],
    ["empty state removed", { section: section.replace("No loads contributed revenue in this period.", "No data.") }],
    ["silent cap (disclosure removed)", { section: section.replace(/\{typeof totalCount === "number"[\s\S]*?<\/p>\n\s*\) : null\}/, "") }],
  ];
  for (const [name, overrides] of mutations) {
    const before = analyze();
    const after = analyze(overrides);
    if (after.length <= before.length) {
      console.error(`${LABEL} SELFTEST FAIL — mutation "${name}" escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Financial P&L contributing loads are real, entity-scoped, and drill through honestly`);
