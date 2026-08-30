import { beforeEach, describe, expect, it, vi } from "vitest";

const withCurrentUserMock = vi.fn();
const appendCrudAuditMock = vi.fn(async () => undefined);
const enqueueOutboxEventMock = vi.fn(async () => undefined);
const enqueueOverrideNoticeMock = vi.fn(async () => undefined);
const assertDriverQualifiedForLoadMock = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUserMock(...(args as [unknown, unknown])),
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: appendCrudAuditMock,
}));
vi.mock("../../outbox/enqueue-outbox-event.js", () => ({
  enqueueOutboxEvent: enqueueOutboxEventMock,
}));
vi.mock("../../outbox/enqueue-override-notice.js", () => ({
  enqueueOverrideNotice: enqueueOverrideNoticeMock,
}));
vi.mock("../driver-qualification.service.js", () => ({
  assertDriverQualifiedForLoad: assertDriverQualifiedForLoadMock,
}));

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD = "11111111-1111-4111-8111-111111111111";
const FAKE_DRIVER = "99999999-9999-4999-8999-999999999999";
const REAL_DRIVER = "22222222-2222-4222-8222-222222222222";

type QueryLog = string[];

function makeClient(driverExists: boolean, log: QueryLog) {
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      log.push(normalized);
      if (normalized.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (normalized.startsWith("BEGIN") || normalized.startsWith("COMMIT") || normalized.startsWith("ROLLBACK")) {
        return { rows: [] };
      }
      if (normalized.includes("FROM org.companies") && normalized.includes("user_accessible_company_ids")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (normalized.includes("FROM mdata.loads") && normalized.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: LOAD,
              operating_company_id: OPCO,
              assigned_primary_driver_id: null,
              assigned_unit_id: null,
              assigned_secondary_driver_id: null,
              load_number: "L-20260809-0007",
              is_hazmat: false,
            },
          ],
        };
      }
      if (normalized.includes("FROM mdata.drivers") && normalized.includes("$1::uuid")) {
        return driverExists ? { rows: [{ id: REAL_DRIVER }] } : { rows: [] };
      }
      if (normalized.includes("UPDATE mdata.loads")) {
        return { rows: [{ id: LOAD }] };
      }
      if (normalized.includes("INSERT INTO dispatch.load_assignment_history")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }
      if (normalized.includes("SELECT id FROM identity.users")) {
        return { rows: [{ id: USER }] };
      }
      return { rows: [] };
    }),
  };
}

describe("manualReassignLoad driver-existence guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertDriverQualifiedForLoadMock.mockResolvedValue(null);
  });

  function useTransactionWrapper(client: ReturnType<typeof makeClient>) {
    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => {
      await client.query("BEGIN");
      try {
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  it("throws E_DRIVER_NOT_FOUND for a fake driver and never reaches UPDATE", async () => {
    const log: QueryLog = [];
    const client = makeClient(false, log);
    useTransactionWrapper(client);

    const { manualReassignLoad } = await import("../dispatch-refinements.service.js");
    await expect(
      manualReassignLoad(USER, {
        operating_company_id: OPCO,
        load_id: LOAD,
        new_driver_id: FAKE_DRIVER,
        reason_code: "TEST",
        requesting_user_role: "Owner",
      })
    ).rejects.toThrow("E_DRIVER_NOT_FOUND");

    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
    expect(log.some((s) => s.startsWith("ROLLBACK"))).toBe(true);
  });

  it("proceeds when the driver exists and is qualified", async () => {
    const log: QueryLog = [];
    const client = makeClient(true, log);
    useTransactionWrapper(client);

    const { manualReassignLoad } = await import("../dispatch-refinements.service.js");
    const result = await manualReassignLoad(USER, {
      operating_company_id: OPCO,
      load_id: LOAD,
      new_driver_id: REAL_DRIVER,
      reason_code: "TEST",
      requesting_user_role: "Owner",
    });

    expect(result).toMatchObject({ ok: true, load_id: LOAD });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(true);
    expect(log.some((s) => s.includes("driver_company_authorizations reassign_driver_dca"))).toBe(true);
    expect(log.some((s) => s.startsWith("COMMIT"))).toBe(true);
    expect(enqueueOutboxEventMock).toHaveBeenCalledWith(
      client,
      "load.assigned_to_driver",
      { aggregate_type: "load", aggregate_id: LOAD },
      expect.objectContaining({
        operating_company_id: OPCO,
        load_id: LOAD,
        driver_id: REAL_DRIVER,
      }),
    );
  });
});
