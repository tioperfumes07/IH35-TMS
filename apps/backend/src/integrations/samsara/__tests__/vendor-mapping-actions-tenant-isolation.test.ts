import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSamsaraVendorMappingActionsRoutes } from "../vendor-mapping-actions.routes.js";
const { mockQuery, mockWithCompanyScope } = vi.hoisted(() => {
  const query = vi.fn();
  const withCompanyScope = vi.fn(async (_userId: string, _companyId: string, fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  );
  return { mockQuery: query, mockWithCompanyScope: withCompanyScope };
});

vi.mock("../../../accounting/shared.js", () => ({
  currentAuthUser: () => ({ uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479", role: "Owner" }),
  validationError: (reply: { code: (status: number) => { send: (payload: unknown) => unknown } }) =>
    reply.code(400).send({ error: "validation_error" }),
  withCompanyScope: mockWithCompanyScope,
}));

describe("vendor-mapping-actions.routes tenant isolation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCompanyScope.mockClear();
    app = Fastify({ logger: false });
    await registerSamsaraVendorMappingActionsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("refuses POST when payload tenant != caller tenant", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/vendor-mapping/link",
      headers: { "content-type": "application/json" },
      payload: {
        operating_company_id: "22222222-2222-4222-8222-222222222222",
        samsara_driver_id: "samsara-driver-2",
        vendor_id: "33333333-3333-4333-8333-333333333333",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "forbidden" });
  });

  // P23-QBO-VENDOR-MAPPING-USES-MIRROR-ID: link now resolves the canonical mdata.vendors row FIRST
  // (this test's 2nd mocked query) before touching the mdata.qbo_vendors mirror (3rd query) -- one
  // extra query in the sequence vs. the pre-fix version, same downstream write/audit shape.
  it("accepts matching tenant payload and writes audit row", async () => {
    const vendorUuid = "44444444-4444-4444-8444-444444444444";
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: vendorUuid, qbo_vendor_id: "QBO-V-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "vendor-1", qbo_id: "QBO-V-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ driver_id: "driver-1", qbo_vendor_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/vendor-mapping/link",
      headers: { "content-type": "application/json" },
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        samsara_driver_id: "samsara-driver-1",
        vendor_id: vendorUuid,
      },
    });

    expect(res.statusCode).toBe(200);
    const callWithAuditWrite = mockQuery.mock.calls.find((call) => String(call[0]).includes("audit.append_event"));
    expect(callWithAuditWrite).toBeTruthy();
    expect(JSON.parse(String(callWithAuditWrite?.[1]?.[2]))).toMatchObject({
      action: "link",
      driver_id: "driver-1",
      vendor_id: "vendor-1",
      actor_user_uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });
  });
});
