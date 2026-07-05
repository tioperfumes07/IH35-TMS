import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Shared mocks ─────────────────────────────────────────────────────────────────
const assertTenantContextMock = vi.fn();
vi.mock("./_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: (...args: unknown[]) => assertTenantContextMock(...args),
}));

const dispatchDriverWebPushMock = vi.fn(async () => ({ sent: 1 }));
vi.mock("../notifications/web-push-dispatcher.js", () => ({
  dispatchDriverWebPush: (...args: unknown[]) => dispatchDriverWebPushMock(...args),
}));

const createNotificationMock = vi.fn(async () => ({ id: "n1" }));
const listCompanyNotifyUserIdsMock = vi.fn(async () => ["user-a", "user-b"]);
vi.mock("../notifications/notification.service.js", () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
  listCompanyNotifyUserIds: (...args: unknown[]) => listCompanyNotifyUserIdsMock(...args),
}));

// withLuciaBypass runs its callback with our fake client; each test swaps the query router in.
let queryRouter: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
vi.mock("../auth/db.js", () => ({
  withLuciaBypass: (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: (sql: string, values?: unknown[]) => queryRouter(sql, values) }),
}));

import { runDriverLeaveAdvanceReminderTick } from "./driver-leave-advance-reminder.cron.js";
import { runDriverLeavePendingEscalationTick } from "./driver-leave-pending-escalation.cron.js";
import { runDriverLeaveBalanceRolloverTick } from "./driver-leave-balance-rollover.cron.js";

const OC = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("driver-leave advance-reminder cron", () => {
  it("fires driver push + reviewer notifications + audit for a not-yet-reminded threshold", async () => {
    const inserts: string[] = [];
    queryRouter = async (sql) => {
      if (sql.includes("status = 'approved'")) {
        return {
          rows: [
            {
              leave_request_id: "req-1",
              operating_company_id: OC,
              driver_id: "drv-1",
              request_number: "DLS-2026-000001",
              leave_type: "vacation",
              effective_start_date: "2026-07-15",
              days_out: 7,
              driver_name: "Juan Perez",
            },
          ],
        };
      }
      if (sql.includes("event_type = 'leave_advance_reminder'")) return { rows: [] }; // not yet reminded
      if (sql.includes("INSERT INTO safety.driver_leave_audit_log")) {
        inserts.push(sql);
        return { rows: [] };
      }
      return { rows: [] };
    };

    const fired = await runDriverLeaveAdvanceReminderTick();
    expect(fired).toBe(1);
    expect(dispatchDriverWebPushMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(2); // one per reviewer
    expect(inserts).toHaveLength(1);
    expect(assertTenantContextMock).toHaveBeenCalledWith(OC, "safety.driver_leave_advance_reminder");
  });

  it("is idempotent — skips a threshold already marked in the audit ledger", async () => {
    queryRouter = async (sql) => {
      if (sql.includes("status = 'approved'")) {
        return {
          rows: [
            {
              leave_request_id: "req-1",
              operating_company_id: OC,
              driver_id: "drv-1",
              request_number: "DLS-2026-000001",
              leave_type: "vacation",
              effective_start_date: "2026-07-15",
              days_out: 7,
              driver_name: "Juan Perez",
            },
          ],
        };
      }
      if (sql.includes("event_type = 'leave_advance_reminder'")) return { rows: [{ "1": 1 }] }; // already reminded
      return { rows: [] };
    };

    const fired = await runDriverLeaveAdvanceReminderTick();
    expect(fired).toBe(0);
    expect(dispatchDriverWebPushMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});

describe("driver-leave pending-escalation cron", () => {
  it("escalates a stale pending request to reviewers once + writes audit", async () => {
    const inserts: string[] = [];
    queryRouter = async (sql) => {
      if (sql.includes("status = 'pending_review'")) {
        return {
          rows: [
            {
              leave_request_id: "req-2",
              operating_company_id: OC,
              request_number: "DLS-2026-000002",
              leave_type: "personal",
              start_date: "2026-08-01",
              days_pending: 6,
              driver_name: "Ana Lopez",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO safety.driver_leave_audit_log")) {
        inserts.push(sql);
        return { rows: [] };
      }
      return { rows: [] };
    };

    const fired = await runDriverLeavePendingEscalationTick();
    expect(fired).toBe(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(inserts).toHaveLength(1);
    expect(assertTenantContextMock).toHaveBeenCalledWith(OC, "safety.driver_leave_pending_escalation");
  });
});

describe("driver-leave balance-rollover cron", () => {
  it("rolls each company with a policy and emits a summary audit event", async () => {
    const rolloverInserts: Array<unknown[] | undefined> = [];
    queryRouter = async (sql, values) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ id: OC }] };
      if (sql.includes("FROM catalogs.leave_policies WHERE operating_company_id")) return { rows: [{ ok: true }] };
      if (sql.includes("INSERT INTO catalogs.driver_leave_balances")) {
        // Carryover math lives in this SQL; assert it references the cap + prior-year values.
        expect(sql).toContain("LEAST(p.carryover_vacation_days_max");
        expect(sql).toContain("GREATEST(0, prev.vacation_allocated - prev.vacation_used)");
        return { rows: [], rowCount: 3 };
      }
      if (sql.includes("INSERT INTO safety.driver_leave_audit_log")) {
        rolloverInserts.push(values);
        return { rows: [] };
      }
      return { rows: [] };
    };

    const rolled = await runDriverLeaveBalanceRolloverTick(2026);
    expect(rolled).toBe(3);
    expect(rolloverInserts).toHaveLength(1);
    expect(assertTenantContextMock).toHaveBeenCalledWith(OC, "safety.driver_leave_balance_rollover");
  });

  it("skips a company that has no leave policy row", async () => {
    queryRouter = async (sql) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ id: OC }] };
      if (sql.includes("FROM catalogs.leave_policies WHERE operating_company_id")) return { rows: [] };
      return { rows: [] };
    };

    const rolled = await runDriverLeaveBalanceRolloverTick(2026);
    expect(rolled).toBe(0);
  });
});
