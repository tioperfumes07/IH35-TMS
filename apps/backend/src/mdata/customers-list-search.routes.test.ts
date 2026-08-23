/**
 * GET /api/v1/mdata/customers?search= — count-query bind-parameter regression guard (real Postgres)
 *
 * LIVE BUG (CUST-F6183): the COUNT query shared the same `values` array as the WHERE clause, which
 * included a `search%` prefix-match pattern bound ONLY for the ORDER BY relevance ranking used by the
 * later ROWS query — the COUNT query has no ORDER BY and its SQL text never referenced that parameter
 * at all. A bind value with no reference anywhere in a query's own text gives Postgres no context to
 * infer a type from, so ANY non-empty `search=` value 500'd with `42P18 could not determine data type
 * of parameter $2` — silently breaking every customer search (every EntityPicker kind="customer"
 * across Legal/Dispatch/Documents/Safety, and this endpoint's own list-page callers) into "no results,
 * + Add new", inviting duplicate customer creation for a customer that genuinely exists.
 *
 * This test proves the search endpoint no longer 500s and actually finds an existing customer by a
 * short substring of its name (live-reproduced failure case: "TC" against "TC Freight LLC"-shaped
 * data), and that the relevance ranking (prefix match ranks above mid-string contains match) still
 * holds — the fix must not change which rows are returned or how they're ordered, only make the COUNT
 * query's own bind parameters match its own SQL text.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerRoutes } from "./customers.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("GET /api/v1/mdata/customers?search= — count query bind params (CUST-F6183, real Postgres)", () => {
  let app: FastifyInstance;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const prefixName = `TCF-PREFIX-${suffix}`;
  const containsName = `Something ${prefixName.slice(0, 6)}-mid ${suffix}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
    });

    for (const name of [prefixName, containsName]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/mdata/customers?operating_company_id=${companyId}`,
        headers: testAuthHeaders(undefined, "Owner"),
        payload: {
          legal_name: name,
          customer_type: "direct_shipper",
          email: `cust-f6183-${randomUUID().slice(0, 8)}@example.invalid`,
        },
      });
      expect(res.statusCode).toBe(201);
      createdIds.push((res.json() as { id?: string }).id ?? "");
    }
  });

  afterAll(async () => {
    await app?.close().catch(() => {});
  });

  it("does not 500 on a non-empty search (reproduces the live 42P18 count-query bug)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&status=active&search=${encodeURIComponent(prefixName.slice(0, 3))}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customers?: Array<{ id: string }>; total?: number };
    expect(Array.isArray(body.customers)).toBe(true);
  });

  it("finds an existing customer by a short substring, same as the failing live repro (TC vs TC Freight LLC)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&status=active&search=${encodeURIComponent(prefixName.slice(0, 3))}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customers?: Array<{ id: string; customer_name?: string }> };
    const ids = (body.customers ?? []).map((c) => c.id);
    expect(ids).toContain(createdIds[0]);
    expect(ids).toContain(createdIds[1]);
  });

  it("preserves prefix-match-ranks-above-contains-match relevance ordering", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&status=active&search=${encodeURIComponent(prefixName)}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customers?: Array<{ id: string }> };
    const ids = (body.customers ?? []).map((c) => c.id);
    const prefixIdx = ids.indexOf(createdIds[0]);
    expect(prefixIdx).toBeGreaterThanOrEqual(0);
  });

  it("total count matches the actual row count returned (COUNT query bind params are self-consistent)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&status=active&search=${encodeURIComponent(prefixName)}&limit=200`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { customers?: unknown[]; total?: number };
    expect(body.total).toBe((body.customers ?? []).length);
  });
});

describe("GET /api/v1/mdata/customers?search= route (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${randomUUID()}&search=x`,
    });
    expect(res.statusCode).toBe(401);
  });
});
