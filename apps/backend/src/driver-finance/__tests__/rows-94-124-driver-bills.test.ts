/**
 * Rows 94 + 124 (ACCT-F11065) — driver bills always carry a due date; practical-basis strays never post and can be voided;
 * live_load_number is never the load's own number. Each test fails on the pre-fix code.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const captured: { createBill: Array<Record<string, unknown>> } = { createBill: [] };
class StopAfterCreate extends Error {}

vi.mock("../../accounting/bills.service.js", async (orig) => {
  const real = await orig<typeof import("../../accounting/bills.service.js")>();
  return {
    ...real,
    createBillInClientTx: vi.fn(async (_c: unknown, input: Record<string, unknown>) => {
      captured.createBill.push(input);
      throw new StopAfterCreate("captured");
    }),
  };
});
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: vi.fn(async () => "acct-ap") }));
vi.mock("../../accounting/driver-vendor-link.service.js", () => ({
  resolveDriverVendorLink: vi.fn(async () => ({ vendorId: "vendor-1" })),
  DriverVendorMissingError: class extends Error {},
}));
vi.mock("../driver-pay-restate.service.js", () => ({
  releaseDriverPayAccrualInClientTx: vi.fn(async () => ({ driver_bill_id: "db-1", released: [{ accounting_bill_id: "ab-1", amount_cents: 324, reversal_journal_entry_id: "je-rev" }] })),
}));

import { pickDriverBillDueDate, resolveDriverBillDueDate } from "../driver-bill-due-date.js";
import { postSettlementApChainInClientTx } from "../settlement-ap-chain.service.js";
import { deliveryAccrualSkipReasonSql } from "../driver-pay-delivery-accrual.service.js";
import { voidStrayPracticalBasisDriverBill, StraySalariedBillVoidRefusedError } from "../void-stray-salaried-driver-bill.service.js";
import { liveLoadNumberForInsert } from "../../dispatch/live-load-number.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("row 94 / 124(a) — a driver bill's due date is its load's delivery date", () => {
  it("delivered evidence wins; projected next; bill date only when the load has no delivery stop", () => {
    expect(pickDriverBillDueDate({ due_date: "2026-08-19", basis: "delivered" }, "2026-08-21")).toEqual({ dueDate: "2026-08-19", basis: "delivered" });
    expect(pickDriverBillDueDate({ due_date: "2026-10-26", basis: "projected" }, "2026-10-23")).toEqual({ dueDate: "2026-10-26", basis: "projected" });
    expect(pickDriverBillDueDate(null, "2026-10-23")).toEqual({ dueDate: "2026-10-23", basis: "bill_date" });
    expect(() => pickDriverBillDueDate(null, "")).toThrow(/unresolvable/);
  });

  it("reads driver_finance.load_driver_pay_due — the rule the delivery accrual already uses", async () => {
    const sqls: string[] = [];
    const out = await resolveDriverBillDueDate({ query: async (sql: string) => { sqls.push(sql); return { rows: [{ due_date: "2026-10-24", basis: "delivered" }] as never[] }; } }, "load-1", "2026-10-23");
    expect(out.dueDate).toBe("2026-10-24");
    expect(sqls.join("\n")).toMatch(/driver_finance\.load_driver_pay_due/);
  });

  it("the settlement close (A/P chain) creates the salary / per-load bill WITH the load's delivery date as due date", async () => {
    captured.createBill = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/FROM driver_finance\.driver_bills db/.test(sql)) return { rows: [] };
        if (/FROM mdata\.loads l\s+WHERE l\.operating_company_id = \$1::uuid AND l\.soft_deleted_at IS NULL/.test(sql)) {
          return { rows: [{ load_id: "load-13530", load_number: "13530", span_start: "2026-08-18", span_end: "2026-08-19", unit_id: null }] };
        }
        if (/INSERT INTO driver_finance\.driver_settlement_gl_runs/.test(sql)) return { rows: [{ id: "run-1" }] };
        if (/load_driver_pay_due/.test(sql)) return { rows: [{ due_date: "2026-08-19", basis: "delivered" }] };
        return { rows: [] };
      }),
    };
    await expect(postSettlementApChainInClientTx(client as never, {
      operatingCompanyId: OPCO, settlementId: "set-p0069", driverId: "drv-rafael", label: "Settlement P-0069", billDate: "2026-08-21",
      actorUserId: "u1", driverPayAccountId: "acct-6890", grossCents: 30000,
      payItems: [{ kind: "pay", cents: 30000, accountId: "acct-6890", loadId: "load-13530", date: "2026-08-19", description: "salary" }],
      applications: [], netCents: 30000, payoutBankAccountId: null, leaveNetOpen: true,
    })).rejects.toBeInstanceOf(StopAfterCreate);
    expect(captured.createBill).toHaveLength(1);
    expect(captured.createBill[0].source).toBe("settlement_driver_bill");
    expect(captured.createBill[0].dueDate).toBe("2026-08-19");
  });

  it("the one bill INSERT refuses a driver bill with no due date (fail-closed, before any write)", async () => {
    const { createBillInClientTx: realCreateBill } = await vi.importActual<typeof import("../../accounting/bills.service.js")>("../../accounting/bills.service.js");
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    for (const source of ["settlement_driver_bill", "driver_pay_accrual"]) {
      await expect(realCreateBill(client as never, { operatingCompanyId: OPCO, source, vendorId: "v", billDate: "2026-10-23", amountCents: 100, coaAccountId: "a" } as never, "u1"))
        .rejects.toThrow("driver_bill_due_date_required");
    }
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("row 124(b) — a practical-miles stray never posts to A/P, and the posted ones can be voided", () => {
  it("the delivery accrual (engine + sweep share this SQL) skips a practical-basis bill by name", () => {
    expect(deliveryAccrualSkipReasonSql("db")).toMatch(/db\.miles_basis_type = 'practical' THEN 'practical_miles_basis'/);
  });

  const billRow = (over: Record<string, unknown> = {}) => ({ id: "db-1", status: "open", voided_at: null, settled_in_settlement_id: null, gross_amount_cents: "324", load_number: "13563", basis: "practical", ...over });
  const clientFor = (row: Record<string, unknown>, lines = "0") => ({
    query: vi.fn(async (sql: string) => {
      if (/FROM driver_finance\.driver_bills db/.test(sql)) return { rows: [row] };
      if (/FROM driver_finance\.settlement_lines/.test(sql)) return { rows: [{ n: lines }] };
      if (/UPDATE driver_finance\.driver_bills/.test(sql)) return { rows: [{ id: "db-1" }] };
      return { rows: [] };
    }),
  });
  const REASON = "Row 124(b): stray practical-miles per-load bill on salaried local driver Rafael";

  it("voids the accrued stray: A/P reversed through the existing engine, then the driver bill void-stamped, audited", async () => {
    const audit = vi.fn(async () => undefined);
    const c = clientFor(billRow());
    const out = await voidStrayPracticalBasisDriverBill(c as never, { operatingCompanyId: OPCO, driverBillId: "db-1", reason: REASON, actorUserId: "u1" }, audit);
    expect(out.reversed[0]).toEqual({ accounting_bill_id: "ab-1", amount_cents: 324, reversal_journal_entry_id: "je-rev" });
    expect(c.query.mock.calls.some(([s]) => /SET status = 'void'/.test(String(s)))).toBe(true);
    expect(audit).toHaveBeenCalledWith("driver_finance.driver_bill.voided_stray_practical_basis", expect.objectContaining({ load_number: "13563" }));
  });

  it("refuses: short-miles bill, settled bill, bill with live settlement lines, thin reason", async () => {
    const audit = vi.fn(async () => undefined);
    const run = (row: Record<string, unknown>, lines = "0", reason = REASON) =>
      voidStrayPracticalBasisDriverBill(clientFor(row, lines) as never, { operatingCompanyId: OPCO, driverBillId: "db-1", reason, actorUserId: "u1" }, audit);
    await expect(run(billRow({ basis: "short" }))).rejects.toBeInstanceOf(StraySalariedBillVoidRefusedError);
    await expect(run(billRow({ settled_in_settlement_id: "s1" }))).rejects.toThrow(/settled/);
    await expect(run(billRow(), "1")).rejects.toThrow(/settlement line/);
    await expect(run(billRow(), "0", "too short")).rejects.toThrow(/reason/);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("row 124(d) — live_load_number is never the load's own number", () => {
  it("a self-referential live number is stored NULL; a real AlwaysTrack number is kept", () => {
    expect(liveLoadNumberForInsert("13694", "13694")).toBeNull();
    expect(liveLoadNumberForInsert(" 13695 ", "13695")).toBeNull();
    expect(liveLoadNumberForInsert("L-20260830-0014", "13694")).toBe("L-20260830-0014");
    expect(liveLoadNumberForInsert("", "13694")).toBeNull();
    expect(liveLoadNumberForInsert(undefined, "13694")).toBeNull();
  });

  it("Book Load writes the normalized value; the Settlement Creator no longer copies load_number into it", () => {
    const book = readFileSync(path.join(here, "../../dispatch/book-load.service.ts"), "utf8");
    expect(book).toMatch(/liveLoadNumberForInsert\(input\.live_load_number, loadNumber\)/);
    expect(book).not.toMatch(/^\s*input\.live_load_number \?\? null,\s*$/m);
    const creator = readFileSync(path.join(here, "../settlement-creator-seed-loads.ts"), "utf8");
    expect(creator).not.toMatch(/live_load_number:\s*load\.load_number/);
  });
});
