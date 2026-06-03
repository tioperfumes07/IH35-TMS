import { describe, expect, it, vi, beforeEach } from "vitest";

const { deliverMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
}));

vi.mock("../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

import {
  QBO_CUSTOMERS_PUSH_DEAD_LETTER_AFTER,
  QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN,
  canPushWithinRateLimit,
  claimQboCustomersPushBatch,
  pushSingleQboCustomer,
  recordQboCustomersPushAttempt,
  resetQboCustomersPushRateLimiterForTests,
  type QboCustomerPushRow,
} from "../qbo-customers-push.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ROW_ID = "00000000-0000-4000-8000-0000000000aa";

function baseRow(overrides: Partial<QboCustomerPushRow> = {}): QboCustomerPushRow {
  return {
    id: ROW_ID,
    operating_company_id: TENANT,
    qbo_id: null,
    display_name: "Local Customer",
    company_name: "Local Customer",
    primary_email: "billing@example.com",
    primary_phone: "555-0100",
    mc_number: "MC999",
    active: true,
    qbo_sync_token: null,
    payload_json: { source: "mdata.customers" },
    sync_status: "pushing",
    qbo_push_attempts: 0,
    ...overrides,
  };
}

function makeClient(state: {
  row?: QboCustomerPushRow;
  mirrorQboId?: string | null;
  mirrorSyncToken?: string | null;
}) {
  const row = state.row ?? baseRow();
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_customers")) return { rows: [] };
      if (sql.includes("UPDATE accounting.qbo_customers") && sql.includes("sync_status = 'synced'")) {
        row.sync_status = "synced";
        row.qbo_id = String(values?.[2] ?? "QBO-999");
        row.qbo_sync_token = (values?.[3] as string | null) ?? "1";
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_customers") && sql.includes("sync_status = 'failed'")) {
        row.sync_status = "failed";
        row.qbo_push_attempts = Number(values?.[2] ?? row.qbo_push_attempts + 1);
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_customers") && sql.includes("sync_status = 'unsynced'")) return { rows: [] };
      if (sql.includes("UPDATE mdata.qbo_customers")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_customers") && sql.includes("SELECT qbo_id")) {
        return {
          rows: [
            {
              qbo_id: state.mirrorQboId ?? "QBO-999",
              qbo_sync_token: state.mirrorSyncToken ?? "1",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO audit.row_changes")) return { rows: [] };
      if (sql.includes("UPDATE accounting.qbo_customers") && sql.includes("sync_status = 'pushing'")) {
        return { rows: [row] };
      }
      if (sql.includes("RETURNING")) return { rows: [row] };
      return { rows: [] };
    }),
  };
}

describe("qbo customers push scheduler", () => {
  beforeEach(() => {
    deliverMock.mockReset();
    resetQboCustomersPushRateLimiterForTests();
  });

  it("success path: unsynced row becomes synced after QBO create", async () => {
    deliverMock.mockResolvedValue({ message: "customer_created_QBO-999" });
    const row = baseRow({ sync_status: "unsynced", qbo_push_attempts: 0 });
    const client = makeClient({ row });

    const outcome = await pushSingleQboCustomer(client as never, row);

    expect(outcome).toBe("success");
    expect(row.sync_status).toBe("synced");
    expect(row.qbo_id).toBe("QBO-999");
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT,
        mirror_row_id: ROW_ID,
        entity: "customer",
        operation: "create",
      }),
      expect.any(Object)
    );
  });

  it("failure path: increments attempts and marks failed", async () => {
    deliverMock.mockRejectedValue(new Error("qbo_master_write_failed_status_422"));
    const row = baseRow({ sync_status: "pushing", qbo_push_attempts: 1 });
    const client = makeClient({ row, mirrorQboId: null });

    const outcome = await pushSingleQboCustomer(client as never, row);

    expect(outcome).toBe("failure");
    expect(row.sync_status).toBe("failed");
    expect(row.qbo_push_attempts).toBe(2);
  });

  it("dead-letter gate: rows at max attempts are not claimed", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("RETURNING")) return { rows: [] };
        return { rows: [] };
      }),
    };

    await claimQboCustomersPushBatch(client as never, 100);

    const claimSql = String(client.query.mock.calls.find((call) => String(call[0]).includes("FOR UPDATE SKIP LOCKED"))?.[0] ?? "");
    expect(claimSql).toContain("qbo_push_attempts < $2");
    expect(QBO_CUSTOMERS_PUSH_DEAD_LETTER_AFTER).toBe(5);
  });

  it("rate limit: blocks when 100 pushes occurred in the last minute", () => {
    resetQboCustomersPushRateLimiterForTests();
    const now = Date.now();
    for (let i = 0; i < QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN; i += 1) {
      recordQboCustomersPushAttempt(now);
    }
    expect(canPushWithinRateLimit(now)).toBe(false);
  });
});
