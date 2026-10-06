import { beforeEach, describe, expect, it, vi } from "vitest";

const createVendorCreditMock = vi.fn();
const resolveRoleAccountOptionalMock = vi.fn();

vi.mock("../accounting/vendor-credits.service.js", () => ({
  createVendorCreditInClientTx: (...args: unknown[]) => createVendorCreditMock(...args),
}));

vi.mock("../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: (...args: unknown[]) => resolveRoleAccountOptionalMock(...args),
}));

import { postPendingRefundObligations, recordPendingRefundObligation } from "./refund-obligation.service.js";

const OC = "11111111-1111-4111-8111-111111111111";
const POLICY_ID = "22222222-2222-4222-8222-222222222222";

describe("recordPendingRefundObligation", () => {
  it("inserts a new obligation (created=true)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO insurance.refund_obligation")) return { rows: [{ id: "new-oblig" }] };
      return { rows: [] };
    });
    const res = await recordPendingRefundObligation({ query }, {
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      amountCents: 50000,
      deterministicMemo: "memo-x",
      entryDate: "2026-07-01",
    });
    expect(res).toEqual({ id: "new-oblig", created: true });
  });

  it("is idempotent on conflict (returns existing, created=false)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO insurance.refund_obligation")) return { rows: [] }; // ON CONFLICT DO NOTHING
      if (sql.includes("SELECT id::text")) return { rows: [{ id: "existing-oblig" }] };
      return { rows: [] };
    });
    const res = await recordPendingRefundObligation({ query }, {
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      amountCents: 50000,
      deterministicMemo: "memo-x",
      entryDate: "2026-07-01",
    });
    expect(res).toEqual({ id: "existing-oblig", created: false });
  });
});

function drainClient(opts: { pending: Array<Record<string, unknown>>; existingJe?: string | null }) {
  const updates: unknown[][] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM insurance.refund_obligation") && sql.includes("status = 'pending'")) {
      return { rows: opts.pending };
    }
    if (sql.includes("FROM accounting.journal_entries")) {
      return { rows: opts.existingJe ? [{ id: opts.existingJe }] : [] };
    }
    if (sql.includes("UPDATE insurance.refund_obligation")) {
      updates.push(values ?? []);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { query, updates };
}

describe("postPendingRefundObligations", () => {
  beforeEach(() => {
    createVendorCreditMock.mockReset();
    resolveRoleAccountOptionalMock.mockReset();
    createVendorCreditMock.mockResolvedValue({ id: "vc-new", journal_entry_id: "je-new" });
  });

  const pendingRow = {
    id: "oblig-1",
    amount_cents: 75000,
    debit_role: "ap_control",
    credit_role: "insurance_expense",
    deterministic_memo: "memo-1",
    entry_date: "2026-07-01",
    vendor_id: "insurer-vendor",
  };

  it("issues the insurer's vendor credit when the credit role resolves, then marks obligation posted (LST-F414)", async () => {
    resolveRoleAccountOptionalMock.mockImplementation(async (_c, _oc, role: string) =>
      role === "insurance_expense" ? "exp-acct" : null
    );
    const client = drainClient({ pending: [pendingRow] });
    const res = await postPendingRefundObligations(client, { operatingCompanyId: OC, userId: "u1", role: "Owner" });

    // A/P is written only by its documents (ROUND 393.1): Dr A/P / Cr insurance_expense through a vendor credit.
    expect(createVendorCreditMock).toHaveBeenCalledTimes(1);
    const [, creditInput] = createVendorCreditMock.mock.calls[0] as [
      unknown,
      { vendorId: string; accountId: string; amountCents: number; notes: string; issueDate: string }
    ];
    expect(creditInput).toMatchObject({ vendorId: "insurer-vendor", accountId: "exp-acct", amountCents: 75000, notes: "memo-1", issueDate: "2026-07-01" });
    expect(res.posted).toEqual([
      { obligation_id: "oblig-1", journal_entry_id: "je-new", amount_cents: 75000, reused: false },
    ]);
    expect(res.still_pending).toHaveLength(0);
    expect(client.updates).toHaveLength(1);
  });

  it("leaves obligation pending when the policy names no insurer vendor", async () => {
    resolveRoleAccountOptionalMock.mockResolvedValue("exp-acct");
    const client = drainClient({ pending: [{ ...pendingRow, vendor_id: null }] });
    const res = await postPendingRefundObligations(client, { operatingCompanyId: OC, userId: "u1", role: "Owner" });

    expect(createVendorCreditMock).not.toHaveBeenCalled();
    expect(res.still_pending).toEqual([{ obligation_id: "oblig-1", reason: "insurer_vendor_missing" }]);
    expect(client.updates).toHaveLength(0);
  });

  it("reuses an existing posted JE (dedupe by memo) — never double-posts", async () => {
    resolveRoleAccountOptionalMock.mockResolvedValue("acct");
    const client = drainClient({ pending: [pendingRow], existingJe: "je-prior" });
    const res = await postPendingRefundObligations(client, { operatingCompanyId: OC, userId: "u1", role: "Owner" });

    expect(createVendorCreditMock).not.toHaveBeenCalled();
    expect(res.posted[0]).toMatchObject({ journal_entry_id: "je-prior", reused: true });
  });

  it("leaves obligation pending when roles are still unmapped", async () => {
    resolveRoleAccountOptionalMock.mockResolvedValue(null);
    const client = drainClient({ pending: [pendingRow] });
    const res = await postPendingRefundObligations(client, { operatingCompanyId: OC, userId: "u1", role: "Owner" });

    expect(createVendorCreditMock).not.toHaveBeenCalled();
    expect(res.posted).toHaveLength(0);
    expect(res.still_pending).toEqual([{ obligation_id: "oblig-1", reason: "coa_role_mapping_not_found" }]);
    expect(client.updates).toHaveLength(0);
  });
});
