import { describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn();
const enqueueTmsAccountPushRequested = vi.fn();
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => appendCrudAudit(...a) }));
vi.mock("../../qbo/tms-account-push-chain.service.js", () => ({ enqueueTmsAccountPushRequested: (...a: unknown[]) => enqueueTmsAccountPushRequested(...a) }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRV = "49427973-e93e-4ea7-a2eb-eb9eefa7f331";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

describe("retireDriverSubAccountsWithoutPostings (443.53 #4)", () => {
  it("retires 0-posting accounts, keeps posted and locked ones untouched", async () => {
    const { retireDriverSubAccountsWithoutPostings } = await import("../driver-subaccount-retire.service.js");
    const rows = [
      { kind: "escrow", link_id: "e1", account_id: "a1", account_number: "2100-00-011", account_name: "Escrow", deactivated_at: null, is_locked: false, postings: 0, balance_cents: 0 },
      { kind: "advance", link_id: DRV, account_id: "a2", account_number: "1245-00-011", account_name: "Advance", deactivated_at: null, is_locked: false, postings: 0, balance_cents: 0 },
      { kind: "escrow", link_id: "e3", account_id: "a3", account_number: "2100-00-099", account_name: "Posted", deactivated_at: null, is_locked: false, postings: 2, balance_cents: 5000 },
      { kind: "advance", link_id: DRV, account_id: "a4", account_number: "1245-00-099", account_name: "Locked", deactivated_at: null, is_locked: true, postings: 0, balance_cents: 0 },
    ];
    const query = vi.fn().mockImplementation(async (sql: string) => (sql.includes("WITH l AS") ? { rows } : { rows: [] }));
    const out = await retireDriverSubAccountsWithoutPostings({ query } as never, { companyId: CO, driverId: DRV, actorUserId: ACTOR });
    expect(out.map((r) => r.outcome)).toEqual(["retired", "retired", "kept_has_postings", "kept_locked"]);
    const writes = query.mock.calls.map((c) => String(c[0])).filter((s) => /^\s*UPDATE/.test(s));
    expect(writes.filter((s) => s.includes("catalogs.accounts"))).toHaveLength(2);
    expect(writes.some((s) => s.includes("escrow_accounts SET status = 'closed'"))).toBe(true);
    expect(writes.some((s) => s.includes("driver_advance_accounts SET is_active = false"))).toBe(true);
    expect(query.mock.calls.some((c) => /DELETE/i.test(String(c[0])))).toBe(false);
    expect(appendCrudAudit).toHaveBeenCalledTimes(2);
    expect(enqueueTmsAccountPushRequested).toHaveBeenCalledTimes(2);
  });
});
