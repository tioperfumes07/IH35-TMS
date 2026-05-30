import { beforeEach, describe, expect, it, vi } from "vitest";

const { withLuciaBypassMock } = vi.hoisted(() => ({
  withLuciaBypassMock: vi.fn(),
}));

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

describe("insurance payment reminder service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies due windows exactly", async () => {
    const { classifyDueWindow } = await import("./payment-reminder.service.js");
    const today = "2026-06-10";

    expect(classifyDueWindow("2026-06-17", today)).toBe("t7");
    expect(classifyDueWindow("2026-06-13", today)).toBe("t3");
    expect(classifyDueWindow("2026-06-11", today)).toBe("t1");
    expect(classifyDueWindow("2026-06-10", today)).toBe("due_today");
    expect(classifyDueWindow("2026-06-09", today)).toBe("overdue");
    expect(classifyDueWindow("2026-06-25", today)).toBe("future");
  });

  it("updates reminder status idempotently", async () => {
    const { sendReminders } = await import("./payment-reminder.service.js");
    const selectCalls: string[] = [];
    const updateCalls: string[] = [];
    let run = 0;

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      run += 1;
      const client = {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
          if (sql.includes("FROM insurance.payment_schedule")) {
            selectCalls.push(String(values?.[0] ?? ""));
            if (run === 1) {
              return {
                rows: [
                  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", due_date: "2026-06-17" },
                  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", due_date: "2026-06-13" },
                ],
              };
            }
            return { rows: [] };
          }
          if (sql.includes("UPDATE insurance.payment_schedule")) {
            updateCalls.push(String(values?.[0] ?? ""));
            return { rows: [{ id: String(values?.[0]) }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const first = await sendReminders("11111111-1111-4111-8111-111111111111", "2026-06-10");
    const second = await sendReminders("11111111-1111-4111-8111-111111111111", "2026-06-10");

    expect(first.reminded).toBe(2);
    expect(second.reminded).toBe(0);
    expect(updateCalls).toHaveLength(2);
    expect(selectCalls).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("keeps tenant isolation in query and updates", async () => {
    const { sendReminders } = await import("./payment-reminder.service.js");
    const tenantId = "22222222-2222-4222-8222-222222222222";
    const updateTenantArgs: string[] = [];
    let selectedTenant = "";

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
          if (sql.includes("FROM insurance.payment_schedule")) {
            selectedTenant = String(values?.[0] ?? "");
            return {
              rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", due_date: "2026-06-11" }],
            };
          }
          if (sql.includes("UPDATE insurance.payment_schedule")) {
            updateTenantArgs.push(String(values?.[1] ?? ""));
            return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    await sendReminders(tenantId, "2026-06-10");
    expect(selectedTenant).toBe(tenantId);
    expect(updateTenantArgs).toEqual([tenantId]);
  });
});
