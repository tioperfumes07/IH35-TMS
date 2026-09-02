/**
 * GET /api/v1/mdata/locations?search= — customer-name match (GO-24, owner direct instruction
 * 2026-09-02).
 *
 * Owner: "Search ILIKE is name/code/address/city -- not customer." A location scoped to a
 * customer's own terminal/warehouse (linked_customer_id) was findable only by typing the
 * LOCATION's own name/code/address/city -- never the customer's name, which is the operator's
 * actual mental model when booking a load against a customer facility. Fixed via a correlated
 * EXISTS against mdata.customers on the existing search predicate -- no second route, no new
 * table (GO-23 row 4b: "Add customer to the existing search predicate if missing. Do not add a
 * second route.").
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerRoutes } from "./customers.routes.js";
import { registerLocationRoutes } from "./locations.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("GET /api/v1/mdata/locations?search= — customer-name match (GO-24, real Postgres)", () => {
  let app: FastifyInstance;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const customerName = `GO24-CUSTOMER-${suffix}`;
  let customerId: string;
  let locationId: string;
  // A second, unrelated location whose OWN name/code/address/city never mentions the customer --
  // proves the customer-name search does not accidentally widen into a match-everything scan.
  let unrelatedLocationId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
      await registerLocationRoutes(a);
    });

    const custRes = await app.inject({
      method: "POST",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        legal_name: customerName,
        customer_type: "direct_shipper",
        email: `go24-${randomUUID().slice(0, 8)}@example.invalid`,
      },
    });
    expect(custRes.statusCode).toBe(201);
    customerId = (custRes.json() as { id?: string }).id ?? "";

    const locRes = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/locations",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        name: `Dock ${randomUUID().slice(0, 8)}`,
        location_type: "customer_warehouse",
        linked_customer_id: customerId,
        operating_company_id: companyId,
        city: "Laredo",
        state: "TX",
      },
    });
    expect(locRes.statusCode).toBe(201);
    locationId = (locRes.json() as { id?: string }).id ?? "";

    const unrelatedRes = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/locations",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        name: `Yard ${randomUUID().slice(0, 8)}`,
        location_type: "yard",
        operating_company_id: companyId,
        city: "Denton",
        state: "TX",
      },
    });
    expect(unrelatedRes.statusCode).toBe(201);
    unrelatedLocationId = (unrelatedRes.json() as { id?: string }).id ?? "";
  });

  afterAll(async () => {
    await app?.close().catch(() => {});
  });

  it("finds the location by the LINKED CUSTOMER's name, not just the location's own name/code/address/city", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/locations?operating_company_id=${companyId}&search=${encodeURIComponent(customerName)}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { locations?: Array<{ id: string }> };
    const ids = (body.locations ?? []).map((l) => l.id);
    expect(ids).toContain(locationId);
    expect(ids).not.toContain(unrelatedLocationId);
  });

  it("still finds a location by its own name/city (regression -- the pre-existing predicate is untouched, only OR-extended)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/locations?operating_company_id=${companyId}&search=${encodeURIComponent("Denton")}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { locations?: Array<{ id: string }> };
    const ids = (body.locations ?? []).map((l) => l.id);
    expect(ids).toContain(unrelatedLocationId);
    expect(ids).not.toContain(locationId);
  });
});

describe("GET /api/v1/mdata/locations?search= route (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerLocationRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/locations?operating_company_id=${randomUUID()}&search=x`,
    });
    expect(res.statusCode).toBe(401);
  });
});
