import { describe, expect, it, vi } from "vitest";

// B3: disburse + posting_date edit. Pure unit test — DB, engine, audit, role helper mocked.

const { mockQuery, mockWithCurrentUser, mockPost, mockAudit } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
      fn({ query })
    ),
    mockPost: vi.fn(),
    mockAudit: vi.fn(),
  };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ postSourceTransaction: mockPost }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));
// Mirror the real isOwnerOrAdmin predicate (Owner/Administrator) for test isolation.
vi.mock("../../bulk/bulk-update.factory.js", () => ({
  isOwnerOrAdmin: (role: string) => role === "Owner" || role === "Administrator",
}));

const { disburseDriverAdvanceCore, editDriverAdvancePostingDate } = await import("../cash-advance-disburse.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const ADV = "44444444-4444-4444-8444-444444444444";
const CREDIT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function installApproved() {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("SELECT") && sql.includes("driver_advances")) {
      return { rows: [{ id: ADV, disbursement_status: "approved", posting_date: null }] };
    }
    if (sql.includes("UPDATE")) return { rows: [{ posting_date: "2026-05-25" }] };
    return { rows: [] };
  });
}

describe("disburseDriverAdvanceCore (B3)", () => {
  it("B5: back-dating (explicit posting_date) by a non-owner/admin is 403 and never posts", async () => {
    mockPost.mockReset();
    mockAudit.mockReset();
    const r = await disburseDriverAdvanceCore(ACTOR, "Driver", OPCO, { advance_id: ADV, posting_date: "2026-05-25" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(403);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("B5: a non-owner approver CAN disburse at the default date (no posting_date) -> posts", async () => {
    mockWithCurrentUser.mockClear();
    mockAudit.mockReset();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ result: "posted", source_transaction_type: "driver_advance" });
    installApproved();
    const r = await disburseDriverAdvanceCore(ACTOR, "Dispatcher", OPCO, { advance_id: ADV });
    expect(r.ok).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });

  it("Fork 7: a second disburse (already disbursed) is 409 and never double-posts", async () => {
    mockWithCurrentUser.mockClear();
    mockAudit.mockReset();
    mockPost.mockReset();
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT") && sql.includes("driver_advances")) {
        return { rows: [{ id: ADV, disbursement_status: "disbursed", posting_date: "2026-05-25" }] };
      }
      return { rows: [] };
    });
    const r = await disburseDriverAdvanceCore(ACTOR, "Owner", OPCO, { advance_id: ADV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(409);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("disburses with a back-dated posting_date, audits old/new, then posts via the driver_advance source", async () => {
    mockWithCurrentUser.mockClear();
    mockAudit.mockReset();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ result: "posted", source_transaction_type: "driver_advance" });
    installApproved();

    const r = await disburseDriverAdvanceCore(ACTOR, "Owner", OPCO, {
      advance_id: ADV,
      posting_date: "2026-05-25",
      credit_account_id: CREDIT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.postingDate).toBe("2026-05-25");

    // posting_date set is audited with old/new.
    const auditPayload = mockAudit.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(auditPayload.posting_date_old).toBe(null);
    expect(auditPayload.posting_date_new).toBe("2026-05-25");

    // posted via the engine using the driver_advance source + passed credit account.
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        source_transaction_type: "driver_advance",
        source_transaction_id: ADV,
        credit_account_id: CREDIT,
      }),
      { userId: ACTOR }
    );
  });
});

describe("editDriverAdvancePostingDate (B3)", () => {
  it("is locked (409) once the advance is disbursed (no silent book divergence)", async () => {
    mockWithCurrentUser.mockClear();
    mockAudit.mockReset();
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT")) return { rows: [{ disbursement_status: "disbursed", posting_date: "2026-05-25" }] };
      return { rows: [] };
    });

    const r = await editDriverAdvancePostingDate(ACTOR, "Owner", OPCO, { advance_id: ADV, posting_date: "2026-06-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(409);
  });

  it("returns 403 for a non-owner/admin", async () => {
    const r = await editDriverAdvancePostingDate(ACTOR, "Dispatcher", OPCO, {
      advance_id: ADV,
      posting_date: "2026-06-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(403);
  });
});
