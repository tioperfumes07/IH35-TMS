#!/usr/bin/env node
/**
 * verify-customer-quality-events-company-scope.mjs  (CUST-F5995)
 *
 * Root cause: apps/backend/src/mdata/customer-quality-events.routes.ts's POST create resolved the
 * caller's DEFAULT company only (never accepted the operating_company_id the caller had actually
 * selected on Customer Detail), while PATCH void and PATCH update looked their target event up by
 * event_id + customer_id ALONE, with no company binding at all. Under Owner RLS
 * (org.user_accessible_company_ids() returns every entity for Owner sessions), that permitted
 * voiding/editing another company's quality event by naming its UUID, and silently misrouted create
 * after a company switch.
 *
 * This guard makes the regression impossible to re-ship: each of POST create, PATCH void, and PATCH
 * update must resolve operating_company_id through resolveOperatingCompanyId(client, authUser.uuid,
 * <the parsed query value>) — never a bare `resolveOperatingCompanyId(client, authUser.uuid)` with no
 * third argument — and PATCH void/update must additionally validate the customer belongs to that
 * resolved company via mdata.get_customer_same_company BEFORE the event lookup.
 *
 * Usage:
 *   node scripts/verify-customer-quality-events-company-scope.mjs            # scan
 *   node scripts/verify-customer-quality-events-company-scope.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/mdata/customer-quality-events.routes.ts";

const ROUTE_MARKERS = [
  { name: "POST create", marker: 'app.post("/api/v1/mdata/customers/:customer_id/quality-events"' },
  { name: "PATCH void", marker: 'app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id/void"' },
  { name: "PATCH update", marker: 'app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id"' },
];

const RESOLVES_SELECTED_COMPANY = /resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid,\s*parsedQuery\.data\.operating_company_id\s*\)/;
// The exact regression shape: resolving with NO third argument always falls back to the caller's
// default, silently ignoring any company the caller actually selected.
const RESOLVES_DEFAULT_ONLY = /resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid\s*\)/;
const VALIDATES_SAME_COMPANY_CUSTOMER = /get_customer_same_company/;

export function checkRoutesScopeByCompany(src) {
  const offenders = [];
  const markerIndexes = ROUTE_MARKERS.map((r) => ({ ...r, idx: src.indexOf(r.marker) }));
  for (const { name, marker, idx } of markerIndexes) {
    if (idx === -1) {
      offenders.push(`${ROUTES_FILE}: route marker not found — ${marker} (has this route moved or been renamed?)`);
      continue;
    }
    const nextIdx = Math.min(...markerIndexes.filter((m) => m.idx > idx).map((m) => m.idx), src.length);
    const slice = src.slice(idx, nextIdx);

    if (!RESOLVES_SELECTED_COMPANY.test(slice)) {
      offenders.push(
        `${ROUTES_FILE}: ${name} does not resolve operating_company_id from the parsed query — CUST-F5995 regression shape (silently ignores the caller's selected company)`
      );
    }
    if (RESOLVES_DEFAULT_ONLY.test(slice)) {
      offenders.push(
        `${ROUTES_FILE}: ${name} calls resolveOperatingCompanyId with no requested-company argument — always resolves the DEFAULT company, exactly the CUST-F5995 bug`
      );
    }
    if (name !== "POST create" && !VALIDATES_SAME_COMPANY_CUSTOMER.test(slice)) {
      offenders.push(
        `${ROUTES_FILE}: ${name} never validates the customer belongs to the resolved company via get_customer_same_company — event lookup has no company binding (cross-company mutation under Owner RLS)`
      );
    }
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkRoutesScopeByCompany(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    app.post("/api/v1/mdata/customers/:customer_id/quality-events", async (req, reply) => {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const companyId = await resolveOperatingCompanyId(client, authUser.uuid);
        if (!companyId) return { error: "mdata_customer_not_found" };
      });
    });
    app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id/void", async (req, reply) => {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        const currentRes = await client.query(
          \`SELECT id, event_type, event_date, voided_at FROM mdata.customer_quality_events WHERE id = $1 AND customer_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.customer_id]
        );
      });
    });
    app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id", async (req, reply) => {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const currentRes = await client.query(
          \`SELECT id FROM mdata.customer_quality_events WHERE id = $1 AND customer_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.customer_id]
        );
      });
    });
  `;
  const fixed = `
    app.post("/api/v1/mdata/customers/:customer_id/quality-events", async (req, reply) => {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch((e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        });
        if (!companyId) return { error: "mdata_customer_not_found" };
      });
    });
    app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id/void", async (req, reply) => {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch((e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        });
        if (!companyId) return { error: "customer_quality_event_not_found" };
        const customerRes = await client.query(
          \`SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1\`,
          [parsedParams.data.customer_id, companyId]
        );
        if (!customerRes.rows[0]) return { error: "customer_quality_event_not_found" };
        const currentRes = await client.query(
          \`SELECT id, event_type, event_date, voided_at FROM mdata.customer_quality_events WHERE id = $1 AND customer_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.customer_id]
        );
      });
    });
    app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id", async (req, reply) => {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch((e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        });
        if (!companyId) return null;
        const customerRes = await client.query(
          \`SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1\`,
          [parsedParams.data.customer_id, companyId]
        );
        if (!customerRes.rows[0]) return null;
        const currentRes = await client.query(
          \`SELECT id FROM mdata.customer_quality_events WHERE id = $1 AND customer_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.customer_id]
        );
      });
    });
  `;

  const buggyFails = checkRoutesScopeByCompany(buggy).length > 0;
  const fixedPasses = checkRoutesScopeByCompany(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:customer-quality-events-company-scope selftest OK");
    process.exit(0);
  }
  console.error("verify:customer-quality-events-company-scope selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:customer-quality-events-company-scope FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log(
    "verify:customer-quality-events-company-scope OK — POST create/PATCH void/PATCH update all resolve the caller's SELECTED company and validate same-company customer ownership before mutating"
  );
}
