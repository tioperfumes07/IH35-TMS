import { describe, expect, it, vi, beforeEach } from "vitest";

const { deliverMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
}));

vi.mock("../../qbo/push.service.js", () => ({
  deliverQboMasterEntityPush: deliverMock,
}));

import {
  QBO_ACCOUNTS_PUSH_DEAD_LETTER_AFTER,
  claimQboAccountsChildPushBatch,
  claimQboAccountsRootPushBatch,
  pushSingleQboAccount,
  resetQboAccountsPushRateLimiterForTests,
  type QboAccountPushRow,
} from "../qbo-accounts-push.js";
import {
  QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN,
  canPushWithinMasterRateLimit,
  recordQboMasterPushAttempt,
  resetQboMasterPushRateLimiterForTests,
} from "../qbo-master-push-rate-limit.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ROOT_ID = "00000000-0000-4000-8000-0000000000aa";
const CHILD_ID = "00000000-0000-4000-8000-0000000000bb";

function baseRow(overrides: Partial<QboAccountPushRow> = {}): QboAccountPushRow {
  return {
    id: ROOT_ID,
    operating_company_id: TENANT,
    qbo_id: null,
    name: "Operating Cash",
    full_qualified_name: "Operating Cash",
    account_type: "Bank",
    account_sub_type: "Checking",
    active: true,
    qbo_sync_token: null,
    payload_json: { source: "accounting.qbo_accounts" },
    sync_status: "pushing",
    qbo_push_attempts: 0,
    parent_id: null,
    parent_qbo_id: null,
    ...overrides,
  };
}

function makeClient(state: {
  row?: QboAccountPushRow;
  mirrorQboId?: string | null;
  mirrorSyncToken?: string | null;
}) {
  const row = state.row ?? baseRow();
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO mdata.qbo_accounts")) return { rows: [] };
      if (sql.includes("UPDATE accounting.qbo_accounts") && sql.includes("sync_status = 'synced'")) {
        row.sync_status = "synced";
        row.qbo_id = String(values?.[2] ?? "QBO-A-999");
        row.qbo_sync_token = (values?.[3] as string | null) ?? "1";
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_accounts") && sql.includes("sync_status = 'failed'")) {
        row.sync_status = "failed";
        row.qbo_push_attempts = Number(values?.[2] ?? row.qbo_push_attempts + 1);
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.qbo_accounts") && sql.includes("sync_status = 'unsynced'")) return { rows: [] };
      if (sql.includes("UPDATE mdata.qbo_accounts")) return { rows: [] };
      if (sql.includes("FROM mdata.qbo_accounts") && sql.includes("SELECT qbo_id")) {
        return {
          rows: [
            {
              qbo_id: state.mirrorQboId ?? "QBO-A-999",
              qbo_sync_token: state.mirrorSyncToken ?? "1",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO audit.row_changes")) return { rows: [] };
      if (sql.includes("parent_synced = true")) return { rows: [] };
      if (sql.includes("RETURNING")) return { rows: [row] };
      return { rows: [] };
    }),
  };
}

describe("qbo accounts push scheduler", () => {
  beforeEach(() => {
    deliverMock.mockReset();
    resetQboAccountsPushRateLimiterForTests();
  });

  it("root account pushes first, then child references parent qbo_id", async () => {
    deliverMock.mockResolvedValue({ message: "account_created_QBO-A-999" });

    const rootClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("parent_id IS NULL")) return { rows: [baseRow({ id: ROOT_ID, sync_status: "unsynced" })] };
        return { rows: [] };
      }),
    };
    const rootRows = await claimQboAccountsRootPushBatch(rootClient as never, 100);
    expect(rootRows).toHaveLength(1);
    expect(String(rootClient.query.mock.calls[0]?.[0] ?? "")).toContain("parent_id IS NULL");

    const rootRow = baseRow({ id: ROOT_ID, sync_status: "pushing" });
    const rootOutcome = await pushSingleQboAccount(makeClient({ row: rootRow }) as never, rootRow);
    expect(rootOutcome).toBe("success");

    const childClaimClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("parent.qbo_id IS NOT NULL")) {
          return {
            rows: [
              baseRow({
                id: CHILD_ID,
                name: "Sub Account",
                parent_id: ROOT_ID,
                parent_qbo_id: "QBO-A-999",
                sync_status: "unsynced",
              }),
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const childRows = await claimQboAccountsChildPushBatch(childClaimClient as never, 100);
    expect(childRows).toHaveLength(1);
    expect(childRows[0]?.parent_qbo_id).toBe("QBO-A-999");

    const childRow = childRows[0]!;
    const childPushClient = makeClient({ row: childRow });
    const childOutcome = await pushSingleQboAccount(childPushClient as never, childRow);
    expect(childOutcome).toBe("success");

    const mirrorCall = childPushClient.query.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO mdata.qbo_accounts")
    );
    expect(String(mirrorCall?.[1]?.[9] ?? "")).toContain("ParentRef");
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "account", operation: "create", mirror_row_id: CHILD_ID }),
      expect.any(Object)
    );
  });

  it("child push is blocked when parent is unsynced", async () => {
    const childRow = baseRow({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      parent_qbo_id: null,
      sync_status: "pushing",
    });
    const client = makeClient({ row: childRow });

    const outcome = await pushSingleQboAccount(client as never, childRow);

    expect(outcome).toBe("skipped");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("dead-letter gate: rows at max attempts are not claimed", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("RETURNING")) return { rows: [] };
        return { rows: [] };
      }),
    };

    await claimQboAccountsRootPushBatch(client as never, 100);

    const claimSql = String(client.query.mock.calls.find((call) => String(call[0]).includes("FOR UPDATE"))?.[0] ?? "");
    expect(claimSql).toContain("qbo_push_attempts < $2");
    expect(QBO_ACCOUNTS_PUSH_DEAD_LETTER_AFTER).toBe(5);
  });
});

describe("qbo master push shared rate limit across B8+B9+B10", () => {
  beforeEach(() => {
    resetQboMasterPushRateLimiterForTests();
  });

  it("shared budget: blocks when combined customers+vendors+accounts pushes hit 100/min", () => {
    const now = Date.now();
    for (let i = 0; i < QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN; i += 1) {
      recordQboMasterPushAttempt(now);
    }
    expect(canPushWithinMasterRateLimit(now)).toBe(false);
  });
});
