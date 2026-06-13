import { describe, expect, it, vi } from "vitest";

// B6: the read-only cascade-preview + detection (shared with B5 approve) + timeline read.

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));
vi.mock("../../accounting/expense-category-map/resolver.service.js", () => ({ resolveAccountForCategory: mockResolve }));

const { detectCashAdvanceCascadeBranch, previewCashAdvanceCascade, getCashAdvanceRequestTimeline } = await import(
  "../cash-advance-requests.service.js"
);

const OC = "11111111-1111-4111-8111-111111111111";
const REQ = "33333333-3333-4333-8333-333333333333";
const DRIVER = "44444444-4444-4444-8444-444444444444";
const LOAD = "55555555-5555-4555-8555-555555555555";
const LOAD_BILL = "66666666-6666-4666-8666-666666666666";
const OPEN_BILL = "77777777-7777-4777-8777-777777777777";
const ACCT = "6a46bfea-4020-46ea-9f3c-99bab3cc06f5";

function makeClient(scn: { activeLoad?: boolean; loadBill?: boolean; openBill?: boolean }) {
  const sqls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes("FROM driver_finance.cash_advance_requests")) {
        return { rows: [{ driver_id: DRIVER, requested_amount_cents: "50000" }] };
      }
      if (sql.includes("FROM mdata.loads")) return { rows: scn.activeLoad ? [{ id: LOAD }] : [] };
      if (sql.includes("FROM driver_finance.driver_bills") && sql.includes("load_id = $3")) {
        return { rows: scn.loadBill ? [{ id: LOAD_BILL }] : [] };
      }
      if (sql.includes("FROM driver_finance.driver_bills")) return { rows: scn.openBill ? [{ id: OPEN_BILL }] : [] };
      if (sql.includes("FROM catalogs.accounts")) return { rows: [{ account_number: "QBO-149", account_name: "Driver Cash Advance" }] };
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

describe("detectCashAdvanceCascadeBranch (B5 logic, reused by B6)", () => {
  it("active load + open load-bill -> load_bill", async () => {
    const { client } = makeClient({ activeLoad: true, loadBill: true });
    const r = await detectCashAdvanceCascadeBranch(client, OC, DRIVER);
    expect(r).toMatchObject({ branch: "load_bill", activeLoadId: LOAD, linkedDriverBillId: LOAD_BILL });
  });
  it("no load but an open bill -> open_bill", async () => {
    const { client } = makeClient({ activeLoad: false, openBill: true });
    const r = await detectCashAdvanceCascadeBranch(client, OC, DRIVER);
    expect(r).toMatchObject({ branch: "open_bill", linkedDriverBillId: OPEN_BILL });
  });
  it("active load but NO open bill -> falls through to loan", async () => {
    const { client } = makeClient({ activeLoad: true, loadBill: false, openBill: false });
    const r = await detectCashAdvanceCascadeBranch(client, OC, DRIVER);
    expect(r.branch).toBe("loan");
    expect(r.linkedDriverBillId).toBe(null);
  });
});

describe("previewCashAdvanceCascade (B6 dry-run)", () => {
  it("returns branch + resolved GL account and writes NOTHING", async () => {
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ account_id: ACCT, posting_side: "debit" });
    const { client, sqls } = makeClient({ activeLoad: true, loadBill: true });
    const r = await previewCashAdvanceCascade(client, OC, REQ);
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.branch).toBe("load_bill");
      expect(r.linked_driver_bill_id).toBe(LOAD_BILL);
      expect(r.amount_cents).toBe(50000);
      expect(r.resolved_account).toMatchObject({ id: ACCT, account_number: "QBO-149", posting_side: "debit" });
    }
    // Pure read: no INSERT/UPDATE/DELETE issued.
    expect(sqls.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s))).toBe(false);
  });

  it("returns not_found when the request does not exist", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const r = await previewCashAdvanceCascade(client, OC, REQ);
    expect(r).toEqual({ error: "not_found" });
  });
});

describe("getCashAdvanceRequestTimeline (B6 read)", () => {
  it("sets the event_log scope and returns the timeline row", async () => {
    const sqls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes("views.driver_request_timeline")) {
          return { rows: [{ request_id: REQ, requested_at: "2026-05-25T08:00:00Z", seconds_requested_to_viewed: 25200 }] };
        }
        return { rows: [] };
      }),
    };
    const row = await getCashAdvanceRequestTimeline(client, OC, REQ);
    expect(sqls[0]).toContain("app.current_operating_company_id");
    expect(row).toMatchObject({ request_id: REQ, seconds_requested_to_viewed: 25200 });
  });
});
