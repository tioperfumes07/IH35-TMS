import { beforeEach, describe, expect, it, vi } from "vitest";

// LST-F414 — a fleet premium movement is the insurer's DOCUMENT (A/P is written only by its documents, ROUND 393.1):
// add = a bill, remove = a vendor credit. Never a raw journal line on ap_control.

const createBillMock = vi.fn();
const createVendorCreditMock = vi.fn();
const resolveRoleAccountMock = vi.fn();

vi.mock("../accounting/bills.service.js", () => ({
  createBill: (...args: unknown[]) => createBillMock(...args),
}));
vi.mock("../accounting/vendor-credits.service.js", () => ({
  createVendorCreditInClientTx: (...args: unknown[]) => createVendorCreditMock(...args),
}));
vi.mock("../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: (...args: unknown[]) => resolveRoleAccountMock(...args),
}));
vi.mock("../_helpers/scoped-company-context.js", () => ({
  setScopedCompanyContext: async () => {},
}));
vi.mock("../lib/company-business-date.js", () => ({
  companyBusinessDate: () => "2026-10-06",
}));

let policyRow: { vendor_id: string | null; policy_number: string | null; unit_code: string | null } | null;
const query = vi.fn(async (sql: string) => {
  if (sql.includes("FROM insurance.policy p")) return { rows: policyRow ? [policyRow] : [] };
  if (sql.includes("FROM accounting.journal_entry_postings")) return { rows: [{ id: "je-bill" }] };
  return { rows: [] };
});
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_u: string, fn: (c: { query: typeof query }) => Promise<unknown>) => fn({ query }),
}));

import { recordFleetPremiumJournalEntry } from "./policy-unit-fleet.service.js";

const OC = "11111111-1111-4111-8111-111111111111";
const POLICY_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const base = { actorUserId: "u1", actorRole: "Owner", operatingCompanyId: OC, policyId: POLICY_ID, assetId: ASSET_ID };

describe("recordFleetPremiumJournalEntry (LST-F414)", () => {
  beforeEach(() => {
    createBillMock.mockReset();
    createVendorCreditMock.mockReset();
    resolveRoleAccountMock.mockReset();
    query.mockClear();
    policyRow = { vendor_id: "insurer-vendor", policy_number: "POL-9", unit_code: "T-101" };
    resolveRoleAccountMock.mockImplementation(async (_c: unknown, _oc: string, role: string) =>
      role === "insurance_expense" ? "exp-acct" : "ap-acct"
    );
    createBillMock.mockResolvedValue({ id: "bill-1" });
    createVendorCreditMock.mockResolvedValue({ id: "vc-1", journal_entry_id: "je-credit" });
  });

  it("add: the additional premium is a bill from the insurer against insurance_expense", async () => {
    const je = await recordFleetPremiumJournalEntry({ ...base, direction: "add", amountCents: 12_345 });
    expect(je).toBe("je-bill");
    expect(createVendorCreditMock).not.toHaveBeenCalled();
    expect(createBillMock).toHaveBeenCalledTimes(1);
    const [input] = createBillMock.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({ vendorId: "insurer-vendor", coaAccountId: "exp-acct", amountCents: 12_345, billDate: "2026-10-06" });
    expect(String(input.memo)).toContain("unit T-101");
    expect(String(input.memo)).toContain("policy POL-9");
    expect(String(input.memo)).not.toMatch(UUID_RE);
    expect(resolveRoleAccountMock).not.toHaveBeenCalledWith(expect.anything(), OC, "ap_control");
  });

  it("remove: the pro-rata credit is the insurer's vendor credit against insurance_expense", async () => {
    const je = await recordFleetPremiumJournalEntry({ ...base, direction: "remove", amountCents: 6_000 });
    expect(je).toBe("je-credit");
    expect(createBillMock).not.toHaveBeenCalled();
    expect(createVendorCreditMock).toHaveBeenCalledTimes(1);
    const [, input] = createVendorCreditMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input).toMatchObject({ vendorId: "insurer-vendor", accountId: "exp-acct", amountCents: 6_000, issueDate: "2026-10-06" });
    expect(String(input.notes)).not.toMatch(UUID_RE);
  });

  it("refuses when the policy names no insurer vendor — no document, no plug", async () => {
    policyRow = { vendor_id: null, policy_number: "POL-9", unit_code: "T-101" };
    await expect(recordFleetPremiumJournalEntry({ ...base, direction: "add", amountCents: 100 })).rejects.toThrow(
      "E_FLEET_PREMIUM_INSURER_VENDOR_MISSING"
    );
    expect(createBillMock).not.toHaveBeenCalled();
  });

  it("posts nothing for a zero delta", async () => {
    expect(await recordFleetPremiumJournalEntry({ ...base, direction: "remove", amountCents: 0 })).toBeNull();
    expect(createVendorCreditMock).not.toHaveBeenCalled();
  });
});
