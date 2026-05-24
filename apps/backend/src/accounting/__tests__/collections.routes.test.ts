import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";

const listCollectionTasksMock = vi.fn(async () => ({ tasks: [] }));
const getCollectionTaskMock = vi.fn(async () => null);
const logCollectionContactMock = vi.fn(async () => null);
const resolveCollectionTaskMock = vi.fn(async () => null);
const syncCollectionTasksMock = vi.fn(async () => ({ created: 0, updated: 0, resolved: 0, open_count: 0 }));

vi.mock("../collections.service.js", () => ({
  listCollectionTasks: (...args: unknown[]) => listCollectionTasksMock(...args),
  getCollectionTask: (...args: unknown[]) => getCollectionTaskMock(...args),
  logCollectionContact: (...args: unknown[]) => logCollectionContactMock(...args),
  resolveCollectionTask: (...args: unknown[]) => resolveCollectionTaskMock(...args),
  syncCollectionTasks: (...args: unknown[]) => syncCollectionTasksMock(...args),
}));

import { registerCollectionsRoutes } from "../collections.routes.js";

describe("collections.routes", () => {
  let app: FastifyInstance;
  const companyA = "11111111-1111-4111-8111-111111111111";
  const companyB = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    app = await createIntegrationApp(async (instance) => {
      await registerCollectionsRoutes(instance);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listCollectionTasksMock.mockClear();
    getCollectionTaskMock.mockClear();
    logCollectionContactMock.mockClear();
    resolveCollectionTaskMock.mockClear();
    syncCollectionTasksMock.mockClear();
  });

  it("requires auth on list endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/collections?operating_company_id=${companyA}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("validates list query contract", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounting/collections?operating_company_id=bad",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("passes company filter to service for tenant-scoped reads", async () => {
    listCollectionTasksMock.mockResolvedValueOnce({ tasks: [{ id: "task-a", operating_company_id: companyA }] });
    await app.inject({
      method: "GET",
      url: `/api/v1/accounting/collections?operating_company_id=${companyA}&bucket=31_60`,
      headers: testAuthHeaders(),
    });
    await app.inject({
      method: "GET",
      url: `/api/v1/accounting/collections?operating_company_id=${companyB}&bucket=31_60`,
      headers: testAuthHeaders(),
    });

    expect(listCollectionTasksMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operatingCompanyId: companyA, bucket: "31_60" })
    );
    expect(listCollectionTasksMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operatingCompanyId: companyB, bucket: "31_60" })
    );
  });

  it("returns 404 when task does not exist in company scope", async () => {
    getCollectionTaskMock.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/collections/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${companyA}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires company in manual sync body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/collections/sync",
      headers: { ...testAuthHeaders(), "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
