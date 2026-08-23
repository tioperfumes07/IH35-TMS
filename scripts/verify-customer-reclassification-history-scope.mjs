#!/usr/bin/env node
/**
 * CUST-F5990 — customer reclassification history is a company-scoped reverse GET.
 *
 * The audit log intentionally retains legacy rows whose operating_company_id is NULL. Those rows may
 * only be returned after the canonical customer itself is resolved inside the selected company; an
 * entity_id-only read is unsafe for Owner sessions because their RLS visibility spans every company.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/mdata/reclassify.routes.ts";
const SELFTEST = process.argv.includes("--selftest");

function routeBlock(source) {
  const start = source.indexOf('app.get("/api/v1/customers/:id/reclassification-history"');
  const end = source.indexOf("// GET /api/v1/vendors/:id/reclassification-history", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

export function problems(source) {
  const block = routeBlock(source);
  const out = [];
  if (!block) return ["customer reclassification-history route missing"];
  if (!/rateLimit: \{ max: 120, timeWindow: "1 minute" \}/.test(block)) {
    out.push("reverse history GET is not protected by the standard read rate limit");
  }
  if (!/historyQuerySchema\.safeParse\(req\.query \?\? \{\}\)/.test(block)) {
    out.push("route does not validate the selected operating_company_id");
  }
  if (!/resolveOperatingCompanyId\([\s\S]*?query\.data\.operating_company_id/.test(block)) {
    out.push("route does not resolve membership in the selected company");
  }
  if (!/set_config\('app\.operating_company_id'/.test(block)) {
    out.push("route does not set the company context before reading the audit log");
  }
  if (!/FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) c/.test(block)) {
    out.push("history is not gated by the canonical same-company customer resolver");
  }
  if (!/JOIN mdata\.entity_reclassification_log l[\s\S]*?l\.entity_id = c\.id/.test(block)) {
    out.push("history rows are not joined through the scoped customer identity");
  }
  if (!/l\.operating_company_id = \$2::uuid OR l\.operating_company_id IS NULL/.test(block)) {
    out.push("history does not restrict non-legacy rows to the selected company");
  }
  if (!/\[params\.data\.id, companyId\]/.test(block)) {
    out.push("history SQL does not bind both customer and resolved company IDs");
  }
  if (/WHERE entity_table = 'mdata\.customers' AND entity_id = \$1/.test(block)) {
    out.push("unsafe entity_id-only history query is still present");
  }
  return out;
}

const live = fs.readFileSync(FILE, "utf8");
const liveProblems = problems(live);
if (liveProblems.length) {
  console.error("verify-customer-reclassification-history-scope FAIL:");
  for (const problem of liveProblems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (SELFTEST) {
  const mutations = [
    ["drop read rate limit", live.replace('rateLimit: { max: 120, timeWindow: "1 minute" }', 'rateLimit: { max: 0, timeWindow: "1 minute" }')],
    ["drop query validation", live.replace("historyQuerySchema.safeParse(req.query ?? {})", "historyQuerySchema.safeParse({})")],
    ["drop company resolver input", live.replace("query.data.operating_company_id", "undefined")],
    ["drop company context", live.replace("SELECT set_config('app.operating_company_id'", "SELECT set_config('app.unscoped_company_id'")],
    ["restore direct log read", live.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid) c", "FROM mdata.customers c")],
    ["drop scoped join", live.replace("l.entity_id = c.id", "l.entity_id = $1::uuid")],
    ["drop log company predicate", live.replace("AND (l.operating_company_id = $2::uuid OR l.operating_company_id IS NULL)", "")],
    ["drop company bind", live.replace("[params.data.id, companyId]", "[params.data.id]")],
  ];
  const inert = mutations.filter(([, source]) => problems(source).length === 0).map(([name]) => name);
  if (inert.length) {
    console.error(`verify-customer-reclassification-history-scope SELFTEST FAIL: inert mutations: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-customer-reclassification-history-scope SELFTEST PASS — ${mutations.length}/${mutations.length} scope/rate-limit mutations detected`);
  process.exit(0);
}

console.log("verify-customer-reclassification-history-scope PASS — customer history resolves company membership, gates through canonical customer identity, and preserves scoped legacy audit rows");
