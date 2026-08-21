import { describe, expect, it, vi } from "vitest";

/**
 * ACCT-F5692 — Event 2 (bill, target status `completed_docs_received`) must refuse to post DR A/R /
 * CR Unbilled Revenue unless an approved dispatch.pod_documents row exists for the load. Live-verified
 * on prod 2026-08-21: dispatch.pod_documents was 0 rows system-wide while 3 USMCA loads already carried
 * a posted `bill` JE, one of them real money (load L-20260806-0008, is_sample_data=false, $1,875.50).
 *
 * Pure unit test — DB + role resolver + journal-entry writer mocked (same pattern as the sibling
 * factoring-posting/__tests__/poster-open-items-and-gates.test.ts). The point is behavioural: prove
 * the gate refuses without an approved POD, prove it posts NOTHING while refusing, and prove it does
 * not over-block Event 1 (earn) or a bill event that DOES have an approved POD.
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

const { postLoadRevenueLatch } = await import("../poster.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const AR_ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNBILLED_ACCOUNT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Opts = {
  targetStatus: string;
  hasApprovedPod: boolean;
  earnAmountCents?: number | null;
};

function installQueryMock({ targetStatus, hasApprovedPod, earnAmountCents = 187550 }: Opts) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
    if (sql.includes("FROM mdata.loads")) {
      return {
        rows: [
          { id: LOAD_ID, status: targetStatus, rate_total_cents: "0", display_id: "L-TEST-1", is_sample_data: false },
        ],
      };
    }
    // loadLatchExists("bill") is checked before earnAmountCents/hasApprovedPodEvidence; no active
    // latch row yet for this event in every scenario below.
    if (sql.includes("event = $3") && sql.includes("load_revenue_recognition_postings")) return { rows: [] };
    if (sql.includes("event = 'earn'") && sql.includes("load_revenue_recognition_postings")) {
      return earnAmountCents == null ? { rows: [] } : { rows: [{ amount_cents: String(earnAmountCents) }] };
    }
    if (sql.includes("linked_object_type") || sql.includes("transaction_source_links")) return { rows: [] };
    if (sql.includes("FROM dispatch.pod_documents")) {
      return hasApprovedPod ? { rows: [{ exists: true }] } : { rows: [] };
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

describe("ACCT-F5692 revrec Event 2 POD evidence gate", () => {
  it("REFUSES with missing_pod_evidence when no approved POD exists, and posts nothing", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockCreateJournalEntry.mockReset();
    installQueryMock({ targetStatus: "completed_docs_received", hasApprovedPod: false });

    const result = await post("completed_docs_received");

    expect(result).toEqual({ posted: false, reason: "missing_pod_evidence" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("POSTS Event 2 when an approved POD exists", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockResolveRoleAccount.mockReset();
    mockResolveRoleAccount.mockImplementation(async (_client: unknown, _opco: string, role: string) =>
      role === "ar_control" ? AR_ACCOUNT : UNBILLED_ACCOUNT
    );
    mockCreateJournalEntry.mockReset().mockResolvedValue({ id: "je-1" });
    installQueryMock({ targetStatus: "completed_docs_received", hasApprovedPod: true });

    const result = await post("completed_docs_received");

    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    expect(result.posted).toBe(true);
  });

  it("does NOT apply the POD gate to Event 1 (earn) — evidence source is delivery departure, not POD", async () => {
    mockIsEnabled.mockReset().mockResolvedValue(true);
    mockCreateJournalEntry.mockReset();
    installQueryMock({ targetStatus: "delivered_pending_docs", hasApprovedPod: false });
    // Event 1 reads final active delivery departure, not the POD table — return a departure timestamp.
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
});
