import { beforeEach, describe, expect, it, vi } from "vitest";

const createBillMock = vi.fn();
const voidBillMock = vi.fn();
const captureMessageMock = vi.fn();

vi.mock("../../accounting/bills.service.js", () => ({
  createBill: (...args: unknown[]) => createBillMock(...args),
  voidBill: (...args: unknown[]) => voidBillMock(...args),
}));

vi.mock("@sentry/node", () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));

import { createPolicyBillSchedule } from "../policy-bill-schedule.service.js";

const OC = "22222222-2222-4222-8222-222222222222";
const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const VENDOR = "33333333-3333-4333-8333-333333333333";

type PolicyOverrides = Partial<{
  vendor_id: string | null;
  total_premium_cents: number;
  down_payment_cents: number;
  installment_count: number;
  due_day: number | null;
  effective_date: string;
}>;

function makeClient(opts: { policy?: PolicyOverrides; existingBilled?: number; vendorResolvable?: boolean } = {}) {
  const policy = {
    id: POLICY_ID,
    operating_company_id: OC,
    vendor_id: VENDOR,
    insurer_name: "Acme",
    policy_number: "POL-1",
    effective_date: "2026-01-15",
    installment_count: 4,
    due_day: 15,
    total_premium_cents: 120000,
    down_payment_cents: 20000,
    ...opts.policy,
  };
  const existingBilled = opts.existingBilled ?? 0;
  const vendorResolvable = opts.vendorResolvable ?? true;
  let scheduleId = 0;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM insurance.policy")) return { rows: [policy] };
    if (sql.includes("FROM insurance.payment_schedule") && sql.includes("bill_uuid IS NOT NULL")) {
      return { rows: [{ count: String(existingBilled) }] };
    }
    if (sql.includes("FROM mdata.vendors")) return { rows: vendorResolvable ? [{ id: VENDOR }] : [] };
    if (sql.includes("INSERT INTO insurance.payment_schedule")) {
      scheduleId += 1;
      return { rows: [{ id: `sched-${scheduleId}` }] };
    }
    return { rows: [] };
  });
  return { query };
}

describe("createPolicyBillSchedule (forward-fix)", () => {
  beforeEach(() => {
    createBillMock.mockReset();
    voidBillMock.mockReset();
    captureMessageMock.mockReset();
    let n = 0;
    createBillMock.mockImplementation(async () => {
      n += 1;
      return { id: `bill-${n}` };
    });
    voidBillMock.mockResolvedValue({ ok: true });
  });

  it("bills the down payment first + N installments, balancing to the total premium", async () => {
    const client = makeClient();
    const result = await createPolicyBillSchedule(POLICY_ID, "user-1", client);

    expect(result.skipped).toBe(false);
    expect(createBillMock).toHaveBeenCalledTimes(5); // 1 down payment + 4 installments
    const calls = createBillMock.mock.calls.map((c) => c[0] as { billNumber: string; amountCents: number });
    expect(calls[0].billNumber).toBe("INS-POL-1-DP");
    expect(calls[0].amountCents).toBe(20000);
    const total = calls.reduce((s, c) => s + c.amountCents, 0);
    expect(total).toBe(120000); // down + installments === total premium
    expect(result.billUuids).toEqual(["bill-1", "bill-2", "bill-3", "bill-4", "bill-5"]);
  });

  it("replay-skips with no createBill calls when the policy already has billed rows", async () => {
    const result = await createPolicyBillSchedule(POLICY_ID, "user-1", makeClient({ existingBilled: 5 }));
    expect(result.skipped).toBe(true);
    expect(createBillMock).not.toHaveBeenCalled();
  });

  it("pre-flight rejects an unresolvable vendor before any bill is created", async () => {
    await expect(
      createPolicyBillSchedule(POLICY_ID, "user-1", makeClient({ vendorResolvable: false }))
    ).rejects.toThrow("insurance_vendor_not_resolvable");
    expect(createBillMock).not.toHaveBeenCalled();
  });

  it("pre-flight rejects insane amounts (down payment exceeds total) before billing", async () => {
    await expect(
      createPolicyBillSchedule(
        POLICY_ID,
        "user-1",
        makeClient({ policy: { total_premium_cents: 10000, down_payment_cents: 50000 } })
      )
    ).rejects.toThrow("insurance_amounts_invalid_down_exceeds_total");
    expect(createBillMock).not.toHaveBeenCalled();
  });

  it("voids already-committed bills and rethrows when a later createBill fails", async () => {
    let n = 0;
    createBillMock.mockImplementation(async () => {
      n += 1;
      if (n === 3) throw new Error("createBill_boom");
      return { id: `bill-${n}` };
    });
    await expect(createPolicyBillSchedule(POLICY_ID, "user-1", makeClient())).rejects.toThrow("createBill_boom");
    // bills 1 and 2 were committed before the failure -> both voided
    expect(voidBillMock).toHaveBeenCalledTimes(2);
    expect(voidBillMock.mock.calls.map((c) => c[1])).toEqual(["bill-1", "bill-2"]);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("raises a CRITICAL Sentry alert listing orphans when a committed bill cannot be voided", async () => {
    let n = 0;
    createBillMock.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error("createBill_boom");
      return { id: `bill-${n}` };
    });
    voidBillMock.mockRejectedValue(new Error("void_failed"));

    await expect(createPolicyBillSchedule(POLICY_ID, "user-1", makeClient())).rejects.toThrow("createBill_boom");
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [message, opts] = captureMessageMock.mock.calls[0] as [string, { level: string; extra: { orphaned_bill_ids: string[] } }];
    expect(message).toContain("bill-1");
    expect(opts.level).toBe("fatal");
    expect(opts.extra.orphaned_bill_ids).toEqual(["bill-1"]);
  });
});
