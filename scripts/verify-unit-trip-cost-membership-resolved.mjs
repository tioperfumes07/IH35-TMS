#!/usr/bin/env node
/**
 * GUARD: FLEET-MONEY-F6113 — POST /api/v1/mdata/units/:id/trip-cost must resolve the caller's
 * company via resolveOperatingCompanyId BEFORE calling buildUnitAggregate, never trust the raw
 * query-string operating_company_id directly.
 *
 * ROOT CAUSE this freezes shut: buildUnitAggregate (unit-aggregate.service.ts) installs its
 * `operatingCompanyId` argument directly as the RLS GUC (`app.operating_company_id`) AND uses it
 * as an explicit equality filter across a dozen+ tables (loads, work orders, fuel logs, photos,
 * driver-vendor assignments) with no membership check of its own. unit-trip-cost.routes.ts passed
 * the raw client-supplied query.data.operating_company_id straight through — any authenticated
 * user could name ANY company's UUID and pull that company's unit cost-estimate data (fuel/driver-
 * pay/maintenance figures derived from that company's real loads/work-orders/fuel history). Two
 * sibling routes already fixed this exact class (units.routes.ts GET /:id — FLEET-F6111,
 * unit-pdf-export.routes.ts — FLEET-F6112) by calling resolveOperatingCompanyId first; this route
 * was the one left behind.
 *
 * Static-only (text-pattern) check against the real route file: resolveOperatingCompanyId must be
 * imported AND called with the query's operating_company_id, and its result (not the raw query
 * value) must be what reaches buildUnitAggregate.
 *
 * Run:  node scripts/verify-unit-trip-cost-membership-resolved.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_PATH = path.join(root, "apps/backend/src/mdata/unit-trip-cost.routes.ts");
const LABEL = "verify-unit-trip-cost-membership-resolved";

export function checkMembershipResolved(src) {
  const problems = [];
  if (!/import\s*\{\s*resolveOperatingCompanyId\s*\}\s*from\s*["']\.\.\/auth\/operating-company-scope\.js["']/.test(src)) {
    problems.push("resolveOperatingCompanyId is no longer imported from ../auth/operating-company-scope.js");
  }
  if (!/resolveOperatingCompanyId\(\s*client\s*,\s*authUser\.uuid\s*,\s*query\.data\.operating_company_id\s*\)/.test(src)) {
    problems.push("resolveOperatingCompanyId is no longer called with (client, authUser.uuid, query.data.operating_company_id)");
  }
  // The RAW query value must never reach buildUnitAggregate directly — only a resolved variable.
  if (/buildUnitAggregate\(\s*client\s*,\s*params\.data\.id\s*,\s*query\.data\.operating_company_id\s*\)/.test(src)) {
    problems.push("buildUnitAggregate is called with the RAW query.data.operating_company_id — the exact FLEET-MONEY-F6113 defect shape");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const aggregate = await buildUnitAggregate(client, params.data.id, query.data.operating_company_id);
      if (!aggregate) return null;
  `;
  if (checkMembershipResolved(bad).length !== 3) {
    failures.push(`the real pre-fix defect verbatim expected 3 problems, got ${checkMembershipResolved(bad).length}`);
  }

  const good = fs.readFileSync(ROUTE_PATH, "utf8");
  const goodProblems = checkMembershipResolved(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: import + call present, but the RAW value still reaches buildUnitAggregate
  // (e.g. a copy-paste that resolved scopedCompanyId but forgot to actually use it).
  const partial = `
    import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, query.data.operating_company_id);
      if (!scopedCompanyId) return null;
      const aggregate = await buildUnitAggregate(client, params.data.id, query.data.operating_company_id);
      if (!aggregate) return null;
  `;
  if (checkMembershipResolved(partial).length !== 1) {
    failures.push("a partial regression (resolved but the raw value is still what reaches buildUnitAggregate) was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (3/3), the real fixed file clears, a ` +
      `partial "resolved but unused" regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(ROUTE_PATH, "utf8");
const problems = checkMembershipResolved(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — POST /api/v1/mdata/units/:id/trip-cost resolves the caller's company via resolveOperatingCompanyId before touching buildUnitAggregate.`);
