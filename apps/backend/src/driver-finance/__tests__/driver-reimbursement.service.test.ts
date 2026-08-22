import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────────────────────────────
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../observability/structured-logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../bulk/bulk-update.factory.js", () => ({ isOwnerOrAdmin: (role: string) => role === "Owner" || role === "Administrator" }));

const isEnabledMock = vi.fn();
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

// ACCT-F5687 moved this service onto postSourceTransactionInClientTx (atomic with the bank-cache
// decrement, same client) instead of postSourceTransaction — the mock below tracks the function the
// service actually calls now, not the one it used to call.
const postSourceTransactionMock = vi.fn();
vi.mock("../../accounting/posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: (...a: unknown[]) => postSourceTransactionMock(...a),
}));

// withCurrentUser(uuid, cb) => cb(mockClient). The SAME mock client is used across the two calls.
let currentClient: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_uuid: string, cb: (c: unknown) => unknown) => cb(currentClient),
}));

import { payDriverReimbursementImmediately, REIMBURSEMENT_GL_POSTING_FLAG } from "../driver-reimbursement.service.js";

const OC = "0c000000-0000-0000-0000-000000000001";
const REIMB = "16000000-0000-0000-0000-000000000001";
const USER = "05500000-0000-0000-0000-000000000001";

function makeClient(reimbRow: Record<string, unknown> | null) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  currentClient = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("SELECT") && sql.includes("FROM driver_finance.driver_reimbursements")) {
        return { rows: reimbRow ? [reimbRow] : [], rowCount: reimbRow ? 1 : 0 };
      }
      if (sql.includes("UPDATE") && sql.includes("driver_finance.driver_reimbursements") && sql.includes("RETURNING")) {
        return { rows: [{ posting_date: "2026-07-05" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { calls };
}

beforeEach(() => {
  isEnabledMock.mockReset();
  postSourceTransactionMock.mockReset();
});

describe("payDriverReimbursementImmediately — pays WITHOUT a settlement", () => {
  it("flag OFF: flips pending -> paid, records pay-out, no GL post, NO settlement touched", async () => {
    isEnabledMock.mockResolvedValue(false);
    const { calls } = makeClient({ id: REIMB, status: "pending", posting_date: null, journal_entry_id: null });

    const res = await payDriverReimbursementImmediately(USER, "Owner", OC, { reimbursement_id: REIMB });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.posted).toBe(false);
      expect(res.journalEntryId).toBeNull();
    }
    // Paid via an UPDATE to status='paid' — and NOTHING referenced a settlement.
    expect(calls.some((c) => c.sql.includes("SET") && c.sql.includes("status = 'paid'"))).toBe(true);
    expect(calls.every((c) => !c.sql.includes("driver_settlements"))).toBe(true);
    expect(postSourceTransactionMock).not.toHaveBeenCalled();
  });

  it("flag ON: posts a JE via the reimbursement source type and back-links it", async () => {
    isEnabledMock.mockResolvedValue(true);
    postSourceTransactionMock.mockResolvedValue({ journal_entry_id: "je-1" });
    makeClient({ id: REIMB, status: "pending", posting_date: null, journal_entry_id: null });

    const res = await payDriverReimbursementImmediately(USER, "Owner", OC, { reimbursement_id: REIMB });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.posted).toBe(true);
      expect(res.journalEntryId).toBe("je-1");
    }
    // postSourceTransactionInClientTx(client, input, actor) — the client is the mocked withCurrentUser
    // client (opaque here), so only the input/actor shape is asserted.
    expect(postSourceTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source_transaction_type: "driver_reimbursement", source_transaction_id: REIMB }),
      { userId: USER }
    );
  });

  it("idempotent: already-paid reimbursement returns ok without re-flipping", async () => {
    isEnabledMock.mockResolvedValue(false);
    const { calls } = makeClient({ id: REIMB, status: "paid", posting_date: "2026-07-01", journal_entry_id: null });

    const res = await payDriverReimbursementImmediately(USER, "Owner", OC, { reimbursement_id: REIMB });
    expect(res.ok).toBe(true);
    // No status flip UPDATE happened (already paid).
    expect(calls.some((c) => c.sql.includes("SET") && c.sql.includes("status = 'paid'"))).toBe(false);
  });

  it("not found => 404", async () => {
    isEnabledMock.mockResolvedValue(false);
    makeClient(null);
    const res = await payDriverReimbursementImmediately(USER, "Owner", OC, { reimbursement_id: REIMB });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(404);
  });

  it("back-dating (explicit posting_date) requires Owner/Admin", async () => {
    isEnabledMock.mockResolvedValue(false);
    makeClient({ id: REIMB, status: "pending", posting_date: null, journal_entry_id: null });
    const res = await payDriverReimbursementImmediately(USER, "Dispatcher", OC, { reimbursement_id: REIMB, posting_date: "2026-06-01" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(403);
  });

  it("exposes the per-entity OFF posting flag key", () => {
    expect(REIMBURSEMENT_GL_POSTING_FLAG).toBe("REIMBURSEMENT_GL_POSTING_ENABLED");
  });
});
