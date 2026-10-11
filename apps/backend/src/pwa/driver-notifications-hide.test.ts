import { describe, expect, it, vi } from "vitest";
import { hideDriverPwaNotifications } from "./driver-notifications.js";

// Lead 443.42 #7: hiding keeps the row (history) — payload.hidden + read_at — and audits each one; nothing is deleted.
describe("hideDriverPwaNotifications", () => {
  it("updates (never deletes) and audits each hidden row", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/^\s*UPDATE pwa\.driver_notifications/.test(sql)) return { rows: [{ id: "n1" }, { id: "n2" }] };
      return { rows: [] };
    });
    const out = await hideDriverPwaNotifications({ query }, { operatingCompanyId: "co", ids: ["n1", "n2", "n3"], reason: "r", actorUserId: "u" });
    expect(out).toEqual(["n1", "n2"]);
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /DELETE/i.test(s))).toBe(false);
    expect(sqls[0]).toMatch(/'hidden', true/);
    expect(sqls[0]).toMatch(/read_at = coalesce\(read_at, now\(\)\)/);
    expect(query.mock.calls.filter((c) => /audit\.append_event/.test(String(c[0])) && JSON.stringify(c[1]).includes("pwa.driver_notification.hidden"))).toHaveLength(2);
  });
  it("no ids: no query", async () => {
    const query = vi.fn();
    expect(await hideDriverPwaNotifications({ query }, { operatingCompanyId: "co", ids: [], reason: "r", actorUserId: "u" })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
