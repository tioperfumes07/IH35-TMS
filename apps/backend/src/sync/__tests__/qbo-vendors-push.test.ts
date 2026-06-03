import { describe, expect, it, vi, beforeEach } from "vitest";

const { deliverMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
}));

vi.mock("../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

import {
  QBO_VENDORS_PUSH_DEAD_LETTER_AFTER,
  claimQboVendorsPushBatch,
  pushSingleQboVendor,
  resetQboVendorsPushRateLimiterForTests,
  type QboVendorPushRow,
} from "../qbo-vendors-push.js";
import {
  QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN,
  canPushWithinMasterRateLimit,
  recordQboMasterPushAttempt,
  resetQboMasterPushRateLimiterForTests,
} from "../qbo-master-push-rate-limit.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ROW_ID = "00000000-0000-4000-8000-0000000000bb";

function baseRow(overrides: Partial<QboVendorPushRow> = {}): QboVendorPushRow {
  return {
    id: ROW_ID,
    operating_company_id: TENANT,
    qbo_id: null,
    display_name: "Local Vendor",
    company_name: "Local Vendor LLC",
    primary_email: "ap@example.com",
    primary_phone: "555-0200",
    active: true,
    qbo_sync_token: null,
    payload_json: { source: "accounting.qbo_vendors" },
    sync_status: "pushing",
    qbo_push_attempts: 0,
    eligible_1099: true,
    payment_terms_qbo_id: "3",
    default_ap_account_qbo_id: "33",
    ...overrides,
  };
}

function makeClient(state: {
  row?: QboVendorPushRow;
  mirrorQboId?: string | null;
  mirrorSyncToken?: string | null;
}) {
  const row = state.row ?? baseRow();
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_vendors")) return { rows: [] };
      if (sql.includes("UPDATE accounting.qbo_vendors") && sql.includes("sync_status = 'synced'")) {
        row.sync_status = "synced";
        row.qbo_id = String(values?.[2] ?? "QBO-V-999");
        row.qbo_sync_token = (values?.[3] as string | null) ?? "1";
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_vendors") && sql.includes("sync_status = 'failed'")) {
        row.sync_status = "failed";
        row.qbo_push_attempts = Number(values?.[2] ?? row.qbo_push_attempts + 1);
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_vendors") && sql.includes("sync_status = 'unsynced'")) return { rows: [] };
      if (sql.includes("UPDATE mdata.qbo_vendors")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_vendors") && sql.includes("SELECT qbo_id")) {
        return {
          rows: [
            {
              qbo_id: state.mirrorQboId ?? "QBO-V-999",
              qbo_sync_token: state.mirrorSyncToken ?? "1",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO audit.row_changes")) return { rows: [] };
      if (sql.includes("UPDATE accounting.qbo_vendors") && sql.includes("sync_status = 'pushing'")) {
        return { rows: [row] };
      }
      if (sql.includes("RETURNING")) return { rows: [row] };
      return { rows: [] };
    }),
  };
}

describe("qbo vendors push scheduler", () => {
  beforeEach(() => {
    deliverMock.mockReset();
    resetQboVendorsPushRateLimiterForTests();
  });

  it("success path: unsynced row becomes synced after QBO create with vendor fields mirrored", async () => {
    deliverMock.mockResolvedValue({ message: "vendor_created_QBO-V-999" });
    const row = baseRow({ sync_status: "unsynced", qbo_push_attempts: 0 });
    const client = makeClient({ row });

    const outcome = await pushSingleQboVendor(client as never, row);

    expect(outcome).toBe("success");
    expect(row.sync_status).toBe("synced");
    expect(row.qbo_id).toBe("QBO-V-999");
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: TENANT,
        mirror_row_id: ROW_ID,
        entity: "vendor",
        operation: "create",
      }),
      expect.any(Object)
    );
    const mirrorCall = client.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO mdata.qbo_vendors"));
    expect(String(mirrorCall?.[1]?.[9] ?? "")).toContain("Vendor1099");
  });

  it("failure path: increments attempts and marks failed", async () => {
    deliverMock.mockRejectedValue(new Error("qbo_master_write_failed_status_422"));
    const row = baseRow({ sync_status: "pushing", qbo_push_attempts: 1 });
    const client = makeClient({ row, mirrorQboId: null });

    const outcome = await pushSingleQboVendor(client as never, row);

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

    await claimQboVendorsPushBatch(client as never, 100);

    const claimSql = String(client.query.mock.calls.find((call) => String(call[0]).includes("FOR UPDATE SKIP LOCKED"))?.[0] ?? "");
    expect(claimSql).toContain("qbo_push_attempts < $2");
    expect(QBO_VENDORS_PUSH_DEAD_LETTER_AFTER).toBe(5);
  });
});

describe("qbo master push shared rate limit", () => {
  beforeEach(() => {
    resetQboMasterPushRateLimiterForTests();
  });

  it("shared budget: blocks when combined B8+B9 pushes hit 100/min", () => {
    const now = Date.now();
    for (let i = 0; i < QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN; i += 1) {
      recordQboMasterPushAttempt(now);
    }
    expect(canPushWithinMasterRateLimit(now)).toBe(false);
  });
});
