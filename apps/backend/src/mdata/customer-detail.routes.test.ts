import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerRoutes } from "./customers.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("mdata customer detail route", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/mdata/customers/:id/detail returns 200 for an existing customer", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&limit=1`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(listRes.statusCode).toBe(200);
    const customers = (listRes.json() as { customers?: Array<{ id: string }> }).customers ?? [];
    const customerId = customers[0]?.id;
    if (!customerId) return;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${customerId}/detail?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customer?: { id?: string } };
    expect(body.customer?.id).toBe(customerId);
  });

  it("GET /api/v1/mdata/customers/:id/detail returns 404 for unknown customers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/detail?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "mdata_customer_not_found" });
  });
});

describe("mdata customer detail route (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/mdata/customers/:id/detail rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/detail?operating_company_id=${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/mdata/customers/:id/detail does not 500 for unknown customers without DB fixtures", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/detail?operating_company_id=${randomUUID()}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    // A RANDOM operating_company_id is not a company this caller is a member of, so
    // resolveOperatingCompanyId now rejects it with 403 (G1-6 membership gate) BEFORE the
    // customer lookup. The genuine "unknown customer -> 404" path (with a real member opco) is
    // covered by the CI integration block above. Here we only assert the route is bootstrapped
    // and never 500s.
    expect([403, 404]).toContain(res.statusCode);
  });
});

// D1-4: sub-customer -> parent HARD link (parent_customer_id) forward-persist + reverse drill-through.
describeIntegration("mdata customer parent_customer_id link", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function createCustomer(body: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/v1/mdata/customers",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: companyId, customer_type: "broker", ...body },
    });
  }

  it("persists a sub-customer's parent and exposes it via reverse drill-through", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parentRes = await createCustomer({ name: `PARENT-${suffix}` });
    expect(parentRes.statusCode).toBe(201);
    const parentId = (parentRes.json() as { id: string }).id;

    const childRes = await createCustomer({ name: `SUB-${suffix}`, parent_customer_id: parentId });
    expect(childRes.statusCode).toBe(201);
    const childId = (childRes.json() as { id: string; parent_customer_id: string | null }).id;
    expect((childRes.json() as { parent_customer_id: string | null }).parent_customer_id).toBe(parentId);

    // Reverse: the parent's detail lists the sub-customer.
    const parentDetail = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${parentId}/detail?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(parentDetail.statusCode).toBe(200);
    const subs = (parentDetail.json() as { customer: { sub_customers?: Array<{ id: string }> } }).customer.sub_customers ?? [];
    expect(subs.some((s) => s.id === childId)).toBe(true);

    // Forward: the child's detail carries the parent's name.
    const childDetail = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${childId}/detail?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(childDetail.statusCode).toBe(200);
    expect((childDetail.json() as { customer: { parent_customer_name?: string } }).customer.parent_customer_name).toBe(`PARENT-${suffix}`);
  });

  it("rejects a self-parent and a parent that is itself a sub-customer", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parentId = (await createCustomer({ name: `P2-${suffix}` }).then((r) => r.json())).id as string;
    const subId = (await createCustomer({ name: `S2-${suffix}`, parent_customer_id: parentId }).then((r) => r.json())).id as string;

    // self-parent
    const selfRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${parentId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { parent_customer_id: parentId },
    });
    expect(selfRes.statusCode).toBe(400);
    expect((selfRes.json() as { error: string }).error).toBe("parent_customer_self");

    // parent-is-sub: a third customer cannot use the existing sub as its parent
    const grandRes = await createCustomer({ name: `G2-${suffix}`, parent_customer_id: subId });
    expect(grandRes.statusCode).toBe(400);
    expect((grandRes.json() as { error: string }).error).toBe("parent_customer_parent_is_sub");
  });

  it("rejects making a parent (with children) into a sub-customer", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parentId = (await createCustomer({ name: `P3-${suffix}` }).then((r) => r.json())).id as string;
    await createCustomer({ name: `S3-${suffix}`, parent_customer_id: parentId });
    const topId = (await createCustomer({ name: `T3-${suffix}` }).then((r) => r.json())).id as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${parentId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { parent_customer_id: topId },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("parent_customer_has_children");
  });
});
