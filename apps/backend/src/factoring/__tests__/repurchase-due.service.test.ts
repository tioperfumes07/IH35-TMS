import { describe, expect, it, vi } from "vitest";
import {
  RepurchaseDueDecisionError,
  decideRepurchaseDue,
  registerRepurchaseDueEvents,
} from "../repurchase-due.service.js";
import { runFactoringDefaultInterestCronTick } from "../../cron/factoring-default-interest-accrual.cron.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const EVT = "0199a000-0000-7000-8000-000000000001";
const OWNER = "0199a000-0000-7000-8000-0000000000aa";

const WRITES_MONEY = /journal_entr|INSERT INTO accounting\.(bills|bill_payments|payments|invoice_payments)|UPDATE accounting\.invoices/i;

function client(rowsFor: (sql: string) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string) => rowsFor(sql));
  return { query };
}

describe("repurchase-due — day 95 asks, never recourses", () => {
  it("register inserts events and re-asks due extensions; writes no money", async () => {
    const c = client((sql) => (sql.includes("INSERT INTO") ? { rows: [], rowCount: 2 } : { rows: [], rowCount: 1 }));
    const res = await registerRepurchaseDueEvents(c, OPCO, "2026-10-02");
    expect(res).toEqual({ registered: 2, reasked: 1 });
    const sqls = c.query.mock.calls.map((x) => String(x[0]));
    expect(sqls.some((s) => s.includes("INSERT INTO accounting.factoring_repurchase_due_events"))).toBe(true);
    expect(sqls.some((s) => s.includes("ON CONFLICT (purchase_line_id) DO NOTHING"))).toBe(true);
    expect(sqls.some((s) => WRITES_MONEY.test(s))).toBe(false);
    // Day 95 from purchase date is passed, not hardcoded in SQL.
    expect(c.query.mock.calls[0][1]).toEqual([OPCO, "2026-10-02", 95]);
  });

  it("extend needs a later date", async () => {
    const c = client(() => ({ rows: [{ state: "awaiting_owner", due_date: "2026-10-01" }] }));
    await expect(
      decideRepurchaseDue(c, { operating_company_id: OPCO, event_id: EVT, decision: "extend", extended_to: "2026-09-30", actor_user_id: OWNER })
    ).rejects.toThrow(RepurchaseDueDecisionError);
  });

  it("a decided event cannot be decided again", async () => {
    const c = client(() => ({ rows: [{ state: "repurchase_confirmed", due_date: "2026-10-01" }] }));
    await expect(
      decideRepurchaseDue(c, { operating_company_id: OPCO, event_id: EVT, decision: "mark_collected", actor_user_id: OWNER })
    ).rejects.toThrow("repurchase_due_event_already_decided");
  });

  it("confirm repurchase records the decision only — no journal entry, bill or payment", async () => {
    const c = client((sql) =>
      sql.includes("FOR UPDATE")
        ? { rows: [{ state: "awaiting_owner", due_date: "2026-10-01" }] }
        : { rows: [{ id: EVT, state: "repurchase_confirmed" }] }
    );
    const res = await decideRepurchaseDue(c, { operating_company_id: OPCO, event_id: EVT, decision: "confirm_repurchase", actor_user_id: OWNER });
    expect(res).toEqual({ id: EVT, state: "repurchase_confirmed" });
    expect(c.query).toHaveBeenCalledTimes(2);
    expect(c.query.mock.calls.some((x) => WRITES_MONEY.test(String(x[0])))).toBe(false);
  });

  it("the nightly cron only registers events, per company", async () => {
    const registerImpl = vi.fn(async () => ({ registered: 1, reasked: 0 }));
    const withLuciaBypassImpl = vi.fn(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn(async () => ({ rows: [{ operating_company_id: OPCO }] })) })
    );
    const res = await runFactoringDefaultInterestCronTick({
      withLuciaBypassImpl: withLuciaBypassImpl as never,
      registerImpl,
      asOfDateIso: "2026-10-02",
    });
    expect(registerImpl).toHaveBeenCalledWith(expect.anything(), OPCO, "2026-10-02");
    expect(res).toEqual({ company_count: 1, repurchase_due_registered: 1, repurchase_due_reasked: 0 });
  });
});
