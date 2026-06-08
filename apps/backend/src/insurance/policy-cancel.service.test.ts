import { beforeEach, describe, expect, it, vi } from "vitest";

const createJournalEntryMock = vi.fn();
const resolveRoleAccountOptionalMock = vi.fn();
const appendCrudAuditMock = vi.fn(async () => {});
const recordObligationMock = vi.fn(async () => ({ id: "oblig-1", created: true }));

vi.mock("./refund-obligation.service.js", () => ({
  recordPendingRefundObligation: (...args: unknown[]) => recordObligationMock(...args),
}));

vi.mock("../accounting/journal-entries.service.js", () => ({
  createJournalEntry: (...args: unknown[]) => createJournalEntryMock(...args),
}));

vi.mock("../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: (...args: unknown[]) => resolveRoleAccountOptionalMock(...args),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAuditMock(...args),
}));

let queryMock: ReturnType<typeof vi.fn>;
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

import { cancelInsurancePolicy, computeUnearnedPremiumCents } from "./policy-cancel.service.js";

const OC = "11111111-1111-4111-8111-111111111111";
const POLICY_ID = "22222222-2222-4222-8222-222222222222";
const AP_ACCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXP_ACCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type PolicyOverrides = Partial<{
  status: string;
  total_premium_cents: number;
  effective_date: string;
  expiry_date: string;
}>;

function buildQueryMock(opts: {
  policy?: PolicyOverrides | null;
  existingRefundJeId?: string | null;
  cancelledScheduleRows?: number;
} = {}) {
  const policy =
    opts.policy === null
      ? null
      : {
          id: POLICY_ID,
          status: "active",
          policy_number: "POL-9",
          insurer_name: "Acme Insurance",
          total_premium_cents: 1_200_000,
          effective_date: "2026-01-01",
          expiry_date: "2027-01-01",
          cancelled_on: null,
          cancel_reason: null,
          ...opts.policy,
        };
  const cancelledRows = Array.from({ length: opts.cancelledScheduleRows ?? 2 }, (_, i) => ({ id: `sched-${i}` }));

  return vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
    if (sql.includes("FROM accounting.journal_entries")) {
      return { rows: opts.existingRefundJeId ? [{ id: opts.existingRefundJeId }] : [] };
    }
    if (sql.includes("UPDATE insurance.policy")) {
      return policy ? { rows: [{ ...policy, status: "cancelled" }] } : { rows: [] };
    }
    if (sql.includes("FROM insurance.policy")) {
      return { rows: policy ? [policy] : [] };
    }
    if (sql.includes("UPDATE insurance.payment_schedule")) {
      return { rows: cancelledRows };
    }
    return { rows: [] };
  });
}

describe("computeUnearnedPremiumCents", () => {
  it("returns the full premium when cancelled on the effective date", () => {
    expect(computeUnearnedPremiumCents(1_200_000, "2026-01-01", "2027-01-01", "2026-01-01")).toBe(1_200_000);
  });

  it("pro-rates to roughly half at the midpoint", () => {
    // 2026 is not a leap year: 365 days; midpoint ~ 2026-07-02 (182 days elapsed -> 183 remaining).
    const unearned = computeUnearnedPremiumCents(1_200_000, "2026-01-01", "2027-01-01", "2026-07-02");
    expect(unearned).toBeGreaterThan(580_000);
    expect(unearned).toBeLessThan(620_000);
  });

  it("returns 0 when cancelled on/after expiry", () => {
    expect(computeUnearnedPremiumCents(1_200_000, "2026-01-01", "2027-01-01", "2027-01-01")).toBe(0);
    expect(computeUnearnedPremiumCents(1_200_000, "2026-01-01", "2027-01-01", "2030-01-01")).toBe(0);
  });

  it("returns 0 for a zero premium or degenerate window", () => {
    expect(computeUnearnedPremiumCents(0, "2026-01-01", "2027-01-01", "2026-06-01")).toBe(0);
    expect(computeUnearnedPremiumCents(1_200_000, "2026-01-01", "2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("cancelInsurancePolicy", () => {
  beforeEach(() => {
    createJournalEntryMock.mockReset();
    resolveRoleAccountOptionalMock.mockReset();
    appendCrudAuditMock.mockClear();
    recordObligationMock.mockClear();
    recordObligationMock.mockResolvedValue({ id: "oblig-1", created: true });
    createJournalEntryMock.mockResolvedValue({ id: "je-1" });
    resolveRoleAccountOptionalMock.mockImplementation(async (_c: unknown, _oc: string, role: string) =>
      role === "ap_control" ? AP_ACCT : role === "expense_default" ? EXP_ACCT : null
    );
  });

  it("cancels, stops future unissued schedule rows, and posts a balanced refund JE", async () => {
    queryMock = buildQueryMock({ policy: { effective_date: "2026-01-01", expiry_date: "2027-01-01" }, cancelledScheduleRows: 3 });
    const result = await cancelInsurancePolicy({
      userId: "user-1",
      role: "Accountant",
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      cancelledOn: "2026-07-01",
      cancelReason: "non-payment",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.cancelled_schedule_count).toBe(3);
    expect(result.unearned_premium_cents).toBeGreaterThan(0);
    expect(result.refund).not.toBeNull();
    expect(result.refund?.reused).toBe(false);

    expect(createJournalEntryMock).toHaveBeenCalledTimes(1);
    const [jeInput] = createJournalEntryMock.mock.calls[0] as [
      { source: string; postings: Array<{ debit_or_credit: string; amount_cents: number; account_id: string }> }
    ];
    expect(jeInput.source).toBe("auto");
    expect(jeInput.postings).toHaveLength(2);
    const debit = jeInput.postings.find((p) => p.debit_or_credit === "debit");
    const credit = jeInput.postings.find((p) => p.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(AP_ACCT);
    expect(credit?.account_id).toBe(EXP_ACCT);
    expect(debit?.amount_cents).toBe(credit?.amount_cents);
    expect(debit?.amount_cents).toBe(result.unearned_premium_cents);
  });

  it("is a no-op for an already-cancelled policy (no JE posted)", async () => {
    queryMock = buildQueryMock({ policy: { status: "cancelled" } });
    const result = await cancelInsurancePolicy({
      userId: "user-1",
      role: "Owner",
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      cancelledOn: "2026-07-01",
      cancelReason: "duplicate",
    });

    expect(result.kind).toBe("already_cancelled");
    expect(createJournalEntryMock).not.toHaveBeenCalled();
    expect(appendCrudAuditMock).not.toHaveBeenCalled();
  });

  it("reuses an existing refund JE (idempotent) instead of double-posting", async () => {
    queryMock = buildQueryMock({ existingRefundJeId: "je-prior" });
    const result = await cancelInsurancePolicy({
      userId: "user-1",
      role: "Manager",
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      cancelledOn: "2026-07-01",
      cancelReason: "rewrite",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.refund?.reused).toBe(true);
    expect(result.refund?.journal_entry_id).toBe("je-prior");
    expect(createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("returns policy_not_found when the policy does not exist", async () => {
    queryMock = buildQueryMock({ policy: null });
    const result = await cancelInsurancePolicy({
      userId: "user-1",
      role: "Owner",
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      cancelledOn: "2026-07-01",
      cancelReason: "x",
    });
    expect(result.kind).toBe("policy_not_found");
    expect(createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("still cancels + records a durable obligation + CRITICAL audit when COA roles are unmapped", async () => {
    queryMock = buildQueryMock({});
    resolveRoleAccountOptionalMock.mockResolvedValue(null);
    const result = await cancelInsurancePolicy({
      userId: "user-1",
      role: "Owner",
      operatingCompanyId: OC,
      policyId: POLICY_ID,
      cancelledOn: "2026-07-01",
      cancelReason: "no coa",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.refund).toBeNull();
    expect(result.refund_skipped_reason).toBe("coa_role_mapping_not_found");
    expect(createJournalEntryMock).not.toHaveBeenCalled();

    // Durable obligation recorded (secondary signal kept in response).
    expect(recordObligationMock).toHaveBeenCalledTimes(1);
    expect(result.refund_obligation_id).toBe("oblig-1");

    // CRITICAL audit event emitted (not a silent skip).
    const criticalCall = appendCrudAuditMock.mock.calls.find(
      (c) => c[2] === "insurance.policy.refund_pending_coa_unmapped"
    );
    expect(criticalCall).toBeTruthy();
    expect(criticalCall?.[4]).toBe("critical");
  });
});
