#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.financial_pl"],"task":"FLEET-F5916-FINANCIAL-PL-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.financial_pl"],"task":"FLEET-F5938-FINANCIAL-PL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
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
const REQUIRED = "docs/specs/scoreboard/modules/fleet.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-fleet-unit-financial-pl-load-reverse.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.financial_pl"],"task":"FLEET-F5916-FINANCIAL-PL-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.financial_pl"],"task":"FLEET-F5938-FINANCIAL-PL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(overrides = {}) {
  const failures = [];
  const service = overrides.service ?? read(SERVICE);
  const section = overrides.section ?? read(SECTION);
  const required = overrides.required ?? read(REQUIRED);
  const feed = overrides.feed ?? read(FEED);
  const self = overrides.self ?? read(SELF);

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
  if (!/EntityLinkOrTombstone[\s\S]{0,120}kind="load"[\s\S]{0,120}id=\{load\.id\}/.test(section) && !/EntityLinkOrTombstone[\s\S]{0,120}id=\{load\.id\}[\s\S]{0,120}kind="load"/.test(section)) {
    failures.push("FinancialUnitPLSection must render EntityLinkOrTombstone kind=\"load\" id={load.id} for each contributing load");
  }
  if (!/No loads contributed revenue in this period/.test(section)) {
    failures.push("FinancialUnitPLSection must render an honest empty state when contributing_loads is []");
  }
  if (!/totalCount - loads\.length/.test(section)) {
    failures.push("FinancialUnitPLSection must disclose the real remaining count when the list is capped (no silent cap)");
  }
  let leaf;
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "unit.profile.financial_pl" && Array.isArray(value.required)) leaf = value;
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(required));
  if (!leaf) failures.push("Fleet financial P&L Required leaf missing");
  else {
    if (!leaf.required.includes("reverse_link")) failures.push("Fleet financial P&L must require reverse_link");
    if (!leaf.required.includes("connectivity")) failures.push("Fleet financial P&L must require connectivity");
    if (leaf.route_hint !== "/fleet/units/:id") failures.push("Fleet financial P&L must mount on canonical unit profile");
  }
  if (!self.split("/**\n * verify-")[0].includes(EXACT_HEADER)) failures.push("exact Fleet financial P&L reverse header missing");
  if (!self.split("/**\n * verify-")[0].includes(CONNECTIVITY_HEADER)) failures.push("exact Fleet financial P&L connectivity header missing");
  if (/"guard"\s*:\s*"scripts\/verify-fleet-unit-financial-pl-load-reverse\.mjs"/.test(feed)) failures.push("manual feed duplicates financial P&L reverse ownership");

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
    ["Required leaf removed", { required: read(REQUIRED).replace('"unit.profile.financial_pl"', '"unit.profile.financial_pl_MISSING"') }],
    ["Required reverse removed", { required: read(REQUIRED).replace(/("id": "unit\.profile\.financial_pl"[\s\S]{0,260})"reverse_link"/, '$1"reverse_link_MISSING"') }],
    ["Required route changed", { required: read(REQUIRED).replace(/("id": "unit\.profile\.financial_pl"[\s\S]{0,180})"\/fleet\/units\/:id"/, '$1"/fleet/trailers/:id"') }],
    ["exact header removed", { self: read(SELF).replace(EXACT_HEADER, EXACT_HEADER.replace("reverse_link", "connectivity")) }],
    ["Required connectivity removed", { required: read(REQUIRED).replace(/("id": "unit\.profile\.financial_pl"[\s\S]{0,260})"connectivity"/, '$1"connectivity_MISSING"') }],
    ["connectivity header removed", { self: read(SELF).replace(CONNECTIVITY_HEADER, CONNECTIVITY_HEADER.replace("connectivity", "load")) }],
    ["duplicate feed inserted", { feed: `[{"guard":"scripts/verify-fleet-unit-financial-pl-load-reverse.mjs"}]` }],
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
