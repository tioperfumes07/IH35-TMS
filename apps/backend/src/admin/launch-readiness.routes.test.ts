import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerLaunchReadinessRoutes } from "./launch-readiness.routes.js";

describe("launch-readiness.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerLaunchReadinessRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/launch-readiness" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/launch-readiness",
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("launch-readiness production wiring", () => {
  it("registers launch readiness in apps/backend/src/index.ts (Block E regression guard)", () => {
    const indexSrc = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
    expect(indexSrc).toContain("registerLaunchReadinessRoutes");
    expect(indexSrc).toContain("await registerLaunchReadinessRoutes(app)");
  });
});

// C2-2 regression guard: the master_counts / critical_workflows counts must be scoped to a single
// operating entity. mdata.* / driver_finance.* / banking.* / qbo.* RLS is role-scoped (NOT
// entity-scoped) and this service reads under a Lucia bypass, so an unscoped COUNT(*) would blend
// TRANSP ↔ TRK ↔ USMCA rows on the readiness dashboard. These static assertions fail if any entity
// count loses its operating-company predicate or the route stops resolving the caller's company.
describe("launch-readiness entity scoping (C2-2 regression guard)", () => {
  const serviceSrc = readFileSync(
    fileURLToPath(new URL("./launch-readiness.service.ts", import.meta.url)),
    "utf8"
  );
  const routesSrc = readFileSync(
    fileURLToPath(new URL("./launch-readiness.routes.ts", import.meta.url)),
    "utf8"
  );

  it("threads a resolved operating company into buildLaunchReadinessPayload", () => {
    expect(serviceSrc).toContain("operatingCompanyId: string | null");
    expect(routesSrc).toContain("resolveOperatingCompanyId");
    expect(routesSrc).toContain("buildLaunchReadinessPayload(operatingCompanyId)");
  });

  it("scopes drivers/customers/vendors master counts to operating_company_id = $1", () => {
    for (const table of ["mdata.drivers", "mdata.customers", "mdata.vendors"]) {
      const idx = serviceSrc.indexOf(`FROM ${table}`);
      expect(idx, `${table} count present`).toBeGreaterThan(-1);
      // predicate must appear within the same statement window following the FROM clause
      expect(serviceSrc.slice(idx, idx + 400)).toContain("operating_company_id = $1");
    }
  });

  it("scopes units by COALESCE(currently_leased_to_company_id, owner_company_id) per §4", () => {
    const idx = serviceSrc.indexOf("FROM mdata.units");
    expect(idx).toBeGreaterThan(-1);
    expect(serviceSrc.slice(idx, idx + 400)).toContain(
      "COALESCE(currently_leased_to_company_id, owner_company_id) = $1"
    );
  });

  it("scopes loads / banking / driver_finance / qbo counts to operating_company_id = $1", () => {
    for (const table of [
      "mdata.loads",
      "banking.bank_transactions",
      "driver_finance.driver_settlements",
      "driver_finance.settlement_disputes",
      "driver_finance.cash_advance_requests",
      "qbo.sync_alerts",
    ]) {
      const idx = serviceSrc.indexOf(`FROM ${table}`);
      expect(idx, `${table} count present`).toBeGreaterThan(-1);
      expect(serviceSrc.slice(idx, idx + 500)).toContain("operating_company_id = $1");
    }
  });

  it("scopes the master_counts banking.bank_accounts count (plaid health tile stays global)", () => {
    // banking.bank_accounts is read twice: the system_status plaid CONNECTIVITY tile (intentionally
    // global) and the master_counts per-entity count. The master_counts version is the LAST
    // occurrence and must carry the entity predicate.
    const idx = serviceSrc.lastIndexOf("FROM banking.bank_accounts");
    expect(idx).toBeGreaterThan(-1);
    expect(serviceSrc.slice(idx, idx + 500)).toContain("operating_company_id = $1");
  });

  it("leaves no bare unscoped master-data COUNT(*) on mdata.customers/vendors", () => {
    // A regression re-introducing `FROM mdata.customers`)` with no predicate would match here.
    expect(serviceSrc).not.toMatch(/FROM mdata\.customers`\s*\)/);
    expect(serviceSrc).not.toMatch(/FROM mdata\.vendors`\s*\)/);
  });
});
