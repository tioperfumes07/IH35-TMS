import { describe, expect, it, vi } from "vitest";

/**
 * ACCT-F5692 / OWNER DECISION B (2026-08-27 23:00 CT,
 * docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md) — Event 2 (bill) no longer requires
 * an approved dispatch.pod_documents row. That original gate (this file used to test it as a
 * REFUSAL) existed because dispatch.pod_documents was 0 rows system-wide, so Event 2 could never fire
 * for any open invoiced load — the correct-but-unreachable half of ACCT-F59's fix. Owner decision B:
 * the BILL/INVOICE creates the receivable (matching QBO/NetSuite/McLeod); POD gates
 * collection/factoring (submission-queue.service.ts's own has_approved_pod check is UNCHANGED), never
 * A/R recognition itself.
 *
 * Event 2's evidence requirement is NOT simply removed — it moves to a real, non-void, ISSUED invoice
 * for the load (sent/partial/paid/factored — never draft/proforma alone), gate string
 * `missing_issued_invoice`. This file proves: (1) Event 2 refuses with NO issued invoice even when an
 * approved POD exists (POD alone is no longer sufficient); (2) Event 2 posts once an issued invoice
 * exists, WITH or WITHOUT an approved POD; (3) Event 1 is unaffected by either check; (4)
 * hasApprovedPodEvidence remains exported for a future detector.
 *
 * Pure unit test — DB + role resolver + journal-entry writer mocked (same pattern as the sibling
 * factoring-posting/__tests__/poster-open-items-and-gates.test.ts).
 */

const {
  mockQuery,
  mockWithLuciaBypass,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
} = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));

const { postLoadRevenueLatch, hasApprovedPodEvidence } = await import("../poster.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const AR_ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNBILLED_ACCOUNT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Opts = {
  hasApprovedPod: boolean;
  hasIssuedInvoice: boolean;
  earnAmountCents?: number | null;
};

function installQueryMock({ hasApprovedPod, hasIssuedInvoice, earnAmountCents = 187550 }: Opts) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
    if (sql.includes("FROM mdata.loads")) {
      return {
        rows: [
          {
            id: LOAD_ID,
            status: "completed_docs_received",
            rate_total_cents: "0",
            display_id: "L-TEST-1",
            is_sample_data: false,
          },
        ],
      };
    }
    // loadLatchExists("bill") is checked before earnAmountCents; no active latch row yet for this
    // event in every scenario below.
    if (sql.includes("event = $3") && sql.includes("load_revenue_recognition_postings")) return { rows: [] };
    if (sql.includes("event = 'earn'") && sql.includes("load_revenue_recognition_postings")) {
      return earnAmountCents == null ? { rows: [] } : { rows: [{ amount_cents: String(earnAmountCents) }] };
    }
    if (sql.includes("linked_object_type") || sql.includes("transaction_source_links")) return { rows: [] };
    if (sql.includes("FROM dispatch.pod_documents")) {
      return hasApprovedPod ? { rows: [{ exists: true }] } : { rows: [] };
    }
    if (sql.includes("FROM accounting.invoices")) {
      return hasIssuedInvoice ? { rows: [{ id: "invoice-1" }] } : { rows: [] };
    }
    return { rows: [] };
  });
}

function post(targetStatus: string) {
  return postLoadRevenueLatch({
    operating_company_id: OPCO,
    load_id: LOAD_ID,
    target_status: targetStatus,
    entry_date_iso: "2026-08-21",
    actor_user_id: ACTOR,
  });
}

describe("OWNER DECISION B — revrec Event 2 gates on an ISSUED INVOICE, never POD", () => {
  it("REFUSES Event 2 (missing_issued_invoice) when NO issued invoice exists — even WITH an approved POD", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockResolveRoleAccount.mockReset();
    mockCreateJournalEntry.mockReset();
    installQueryMock({ hasApprovedPod: true, hasIssuedInvoice: false });

    const result = await post("completed_docs_received");

    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(result).toEqual({ posted: false, reason: "missing_issued_invoice" });
  });

  it("POSTS Event 2 once an issued invoice exists, with NO approved POD — the gate is a detector input now, not a blocker", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockResolveRoleAccount.mockReset();
    mockResolveRoleAccount.mockImplementation(async (_client: unknown, _opco: string, role: string) =>
      role === "ar_control" ? AR_ACCOUNT : UNBILLED_ACCOUNT
    );
    mockCreateJournalEntry.mockReset().mockResolvedValue({ id: "je-1" });
    installQueryMock({ hasApprovedPod: false, hasIssuedInvoice: true });

    const result = await post("completed_docs_received");

    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    expect(result.posted).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("still POSTS Event 2 when BOTH an issued invoice AND an approved POD exist — no regression on the previously-working case", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockResolveRoleAccount.mockReset();
    mockResolveRoleAccount.mockImplementation(async (_client: unknown, _opco: string, role: string) =>
      role === "ar_control" ? AR_ACCOUNT : UNBILLED_ACCOUNT
    );
    mockCreateJournalEntry.mockReset().mockResolvedValue({ id: "je-1" });
    installQueryMock({ hasApprovedPod: true, hasIssuedInvoice: true });

    const result = await post("completed_docs_received");

    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    expect(result.posted).toBe(true);
  });

  it("does NOT apply the issued-invoice check to Event 1 (earn) — evidence source is delivery departure", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockCreateJournalEntry.mockReset();
    mockQuery.mockReset();
    // Event 1 reads final active delivery departure, not invoices or POD — return a departure timestamp.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
      if (sql.includes("FROM mdata.loads")) {
        return {
          rows: [
            {
              id: LOAD_ID,
              status: "delivered_pending_docs",
              rate_total_cents: "187550",
              display_id: "L-TEST-1",
              is_sample_data: false,
            },
          ],
        };
      }
      if (sql.includes("event = $3") && sql.includes("load_revenue_recognition_postings")) return { rows: [] };
      if (sql.includes("linked_object_type") || sql.includes("transaction_source_links")) return { rows: [] };
      if (sql.includes("actual_departure_at")) return { rows: [{ actual_departure_at: "2026-08-20T10:00:00Z" }] };
      return { rows: [] };
    });
    mockResolveRoleAccount.mockReset().mockResolvedValue(UNBILLED_ACCOUNT);
    mockCreateJournalEntry.mockResolvedValue({ id: "je-2" });

    const result = await post("delivered_pending_docs");

    expect(result.posted).toBe(true);
    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
  });

  it("hasApprovedPodEvidence is still exported for a future detector to reuse (not deleted)", async () => {
    mockQuery.mockReset().mockResolvedValueOnce({ rows: [{ exists: true }] });
    const result = await hasApprovedPodEvidence({ query: mockQuery }, OPCO, LOAD_ID);
    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("dispatch.pod_documents"), [LOAD_ID, OPCO]);
  });
});
