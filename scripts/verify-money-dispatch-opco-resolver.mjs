#!/usr/bin/env node
// G2-2 static guard — money/dispatch routes must validate a CLIENT-SUPPLIED operating_company_id
// against the caller's membership before using it as tenant scope.
//
// The bug class: a money/dispatch route reads operating_company_id from the request (body/query/
// param) and binds it straight into `set_config('app.operating_company_id', …)` or a SQL
// `operating_company_id = $n` predicate WITHOUT first proving the caller is a member of that
// company. RLS on mdata.*/catalogs.* is role-scoped, NOT entity-scoped, so a caller could pass any
// company id and read/write another entity's (TRANSP ↔ TRK ↔ USMCA) money/dispatch data.
//
// The fix each route must route through ONE of the membership validators (all resolve the requested
// opco against the caller's accessible-company set and 403 on a cross-entity attempt):
//   • resolveOperatingCompanyId(client, userId, requested)  — auth/operating-company-scope.ts
//   • assertCompanyMembership(userId, operatingCompanyId)    — _helpers/company-membership-guard.ts
//   • withCompanyScope(...) / withCompany(...) / scoped(...) — shared wrappers that call one of the above
//
// This guard fails CI if a money/dispatch route handler binds a tenant-scope sink but its body
// contains none of those validators. Handlers whose opco is SYSTEM-DERIVED (looked up from the
// driver's / load's own row, never from the request) are not a cross-entity risk and are listed in
// SYSTEM_DERIVED_ALLOWLIST with the reason.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "apps/backend/src");

// Money/dispatch surface — where a leaked operating_company_id crosses entities on money/ops data.
const MONEY_DISPATCH =
  /\/(accounting|banking|driver-finance|settlements|payroll|payroll-integration|factoring|cash-advances|cash-flow|bill-payments|ap|profitability|liabilities|reconciliation|forecast|dispatch|qbo|qbo-sync|sync)\/|\/integrations\/qbo\/|\/mdata\/loads|\/mdata\/customer-financial|\/mdata\/customer-billing|\/catalogs\/accounting\//;

// A tenant-scope sink fed a value in the handler body.
const SINK =
  /set_config\(\s*['"]app\.operating_company_id|withOperatingCompanyScope\(|setOperatingCompanyScope\(|operating_company_id\s*=\s*\$\d/;

// Membership validators / safe wrappers that embed one.
const VALIDATOR = /assertCompanyMembership|resolveOperatingCompanyId|withCompanyScope|withCompany\b|\bscoped\s*\(/;

// Handlers whose operating_company_id is derived from the driver's / load's OWN row (a SELECT the
// caller can only reach for their assigned entity), never trusted from the request. Keyed by a
// stable route-path fragment in the handler head. NOT a client-supplied scope → not G2-2.
const SYSTEM_DERIVED_ALLOWLIST = [
  {
    file: "driver-finance/cash-advance-requests.routes.ts",
    fragment: "/api/v1/driver/cash-advance-requests",
    reason: "driver PWA: opco derived from the signed-in driver's own record (fetchDriverOperatingCompanyId), not the request",
  },
  {
    file: "dispatch/pod.routes.ts",
    fragment: "/api/v1/driver/loads/:loadId/stops/:stopId/pod",
    reason: "driver PWA: opco derived from the assigned load's row (mdata.loads), not the request",
  },
  {
    file: "dispatch/driver-pwa/dispatch-view.routes.ts",
    fragment: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document",
    reason: "driver PWA: opco derived from the assigned load's row (mdata.loads via the load_stops→loads join gated by assigned_primary/secondary_driver), not the request — set to satisfy documents.damage_photo_evidence RLS",
  },
  {
    file: "mdata/loads.routes.ts",
    // Precise (not just the bare route) so this cannot also match the /status, /stops, or /audit
    // siblings above/below it in the same file — each of those needs its own allowlist decision.
    fragment: '"/api/v1/mdata/loads/:id", { config',
    reason: "office load-fields PATCH: the load row is fetched via `operating_company_id IN (SELECT org.user_accessible_company_ids())` (membership gate) BEFORE any write, then the downstream hazmat-check and driver-assignment-gate queries scope on oldRow.operating_company_id — the row's own column, never a client-supplied value. Same shape as the /status sibling entry above.",
  },
];

function listRouteFiles() {
  const out = execSync(
    `grep -rlE "app\\.(get|post|put|patch|delete)\\(|fastify\\.(get|post|put|patch|delete)\\(" ${srcRoot} --include=*.ts`,
    { encoding: "utf8", maxBuffer: 1 << 28 }
  );
  return out
    .split("\n")
    .filter(
      (f) =>
        f &&
        !/\.test\.|__tests__|\.spec\./.test(f) &&
        /(\.routes\.ts|\/routes\.ts)$/.test(f) &&
        MONEY_DISPATCH.test(f)
    );
}

function extractHandlers(src) {
  const handlers = [];
  const re = /\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const from = m.index;
    const arrow = src.indexOf("=> {", from);
    if (arrow === -1) continue;
    const open = src.indexOf("{", arrow);
    let depth = 0;
    let end = open;
    for (; end < src.length; end++) {
      const c = src[end];
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    handlers.push({
      body: src.slice(open, end + 1),
      line: src.slice(0, from).split("\n").length,
      head: src.slice(from, src.indexOf("\n", from)).trim().slice(0, 100),
    });
  }
  return handlers;
}

function isViolation(body, rel, head) {
  if (!SINK.test(body) || VALIDATOR.test(body)) return false;
  const allow = SYSTEM_DERIVED_ALLOWLIST.find((a) => rel === a.file && head.includes(a.fragment));
  return !allow;
}

if (process.argv.includes("--selftest")) {
  const bad = `{ const q = schema.safeParse(req.query).data;
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [q.operating_company_id]); }`;
  const good = `{ const q = schema.safeParse(req.query).data;
    await assertCompanyMembership(user.uuid, q.operating_company_id);
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [q.operating_company_id]); }`;
  const errs = [];
  if (!isViolation(bad, "x.routes.ts", ".get(...)")) errs.push("negative case: unguarded sink was NOT flagged");
  if (isViolation(good, "x.routes.ts", ".get(...)")) errs.push("positive case: guarded sink WAS flagged");
  if (errs.length) {
    console.error("verify:money-dispatch-opco-resolver --selftest FAILED");
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify:money-dispatch-opco-resolver --selftest OK");
  process.exit(0);
}

const failures = [];
for (const file of listRouteFiles()) {
  const rel = path.relative(srcRoot, file);
  const src = fs.readFileSync(file, "utf8");
  for (const h of extractHandlers(src)) {
    if (isViolation(h.body, rel, h.head)) failures.push(`${rel}:${h.line}  ${h.head}`);
  }
}

if (failures.length > 0) {
  console.error("verify:money-dispatch-opco-resolver — FAILED");
  console.error(
    "\nThese money/dispatch route handlers bind a tenant-scope sink (set_config app.operating_company_id"
  );
  console.error(
    "or an operating_company_id = $n predicate) from a client-supplied value WITHOUT a membership check."
  );
  console.error(
    "Route the requested operating_company_id through resolveOperatingCompanyId(...) or"
  );
  console.error(
    "assertCompanyMembership(user.uuid, operating_company_id) before using it as scope (G2-2).\n"
  );
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nIf a handler's opco is SYSTEM-DERIVED (from the driver's/load's own row, never the request),"
  );
  console.error("add it to SYSTEM_DERIVED_ALLOWLIST in this script with a reason.");
  process.exit(1);
}

console.log("verify:money-dispatch-opco-resolver — OK (all money/dispatch scope sinks validate membership)");
