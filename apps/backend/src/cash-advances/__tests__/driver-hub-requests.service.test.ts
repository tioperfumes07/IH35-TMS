import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../driver-finance/deductions.service.js", () => ({
  createSettlementDeduction: vi.fn(),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createSettlementDeduction } from "../../driver-finance/deductions.service.js";
import { approveHubCashAdvanceRequest, denyHubCashAdvanceRequest } from "../driver-hub-requests.service.js";

const OC = "oc000000-0000-0000-0000-000000000001";
const REQ_ID = "req00000-0000-0000-0000-000000000001";
const USER = "usr00000-0000-0000-0000-000000000001";
const DRIVER = "dr000000-0000-0000-0000-000000000001";

function futureIso() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
function pastIso() {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

function makeMockClient(opts: { lockRow?: Record<string, unknown> | null } = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, values });
      if (sql.includes("FOR UPDATE")) {
        const row = "lockRow" in opts ? opts.lockRow : undefined;
        return { rows: (row ? [row] : []) as T[], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("UPDATE driver_finance.cash_advance_requests")) {
        return { rows: [{ id: REQ_ID, status: sql.includes("'approved'") ? "approved" : "denied" }] as T[], rowCount: 1 };
      }
      if (sql.includes("FROM identity.users")) {
        return { rows: [{ email: "manager@example.com" }] as T[], rowCount: 1 };
      }
      // audit insert
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  return { client, calls };
}

const PENDING_ROW = {
  id: REQ_ID,
  driver_id: DRIVER,
  display_id: "CA-2026-0007",
  status: "pending",
  requested_amount_cents: "50000",
  expires_at: futureIso(),
  is_above_policy: false,
};

describe("approveHubCashAdvanceRequest", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
    vi.mocked(createSettlementDeduction).mockReset();
    vi.mocked(createSettlementDeduction).mockResolvedValue({
      id: "ded00000-0000-0000-0000-0000000000AA",
      operating_company_id: OC,
      driver_id: DRIVER,
      deduction_type: "cash_advance_repayment",
      amount_cents: 50000,
      reason: "Cash advance repayment — request CA-2026-0007",
      applied_to_settlement_id: null,
      created_by_user_id: USER,
      source_pending_id: null,
      created_at: "2026-06-07T12:00:00.000Z",
    });
  });

  it("happy path — creates deduction via service (cash_advance_repayment) and approves request", async () => {
    const { client, calls } = makeMockClient({ lockRow: { ...PENDING_ROW } });

    const result = await approveHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: { approval_notes: "ok to advance" },
    });

    expect(result.ok).toBe(true);
    expect(createSettlementDeduction).toHaveBeenCalledOnce();
    const dedArgs = vi.mocked(createSettlementDeduction).mock.calls[0]?.[1];
    expect(dedArgs?.sourceType).toBe("cash_advance_repayment");
    expect(dedArgs?.amountCents).toBe(50000);
    expect(dedArgs?.driverId).toBe(DRIVER);
    expect(dedArgs?.sourcePendingId).toBeUndefined();
    // No raw SQL deduction insert from this module.
    expect(calls.some((c) => c.sql.includes("INSERT INTO driver_finance.driver_settlement_deductions"))).toBe(false);
    // Status advanced to approved.
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.cash_advance_requests") && c.sql.includes("'approved'"))).toBe(true);
    expect(appendCrudAudit).toHaveBeenCalledOnce();
  });

  it("returns not_found when request row is missing", async () => {
    const { client } = makeMockClient({ lockRow: null });
    const result = await approveHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: {},
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("double-approve guard — returns not_approvable when already approved", async () => {
    const { client } = makeMockClient({ lockRow: { ...PENDING_ROW, status: "approved" } });
    const result = await approveHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: {},
    });
    expect(result).toEqual({ ok: false, error: "not_approvable" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("returns expired when the request has lapsed", async () => {
    const { client } = makeMockClient({ lockRow: { ...PENDING_ROW, expires_at: pastIso() } });
    const result = await approveHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: {},
    });
    expect(result).toEqual({ ok: false, error: "expired" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });
});

describe("denyHubCashAdvanceRequest", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
  });

  it("happy path — denies a pending request with a reason", async () => {
    const { client, calls } = makeMockClient({ lockRow: { ...PENDING_ROW } });
    const result = await denyHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: { denial_reason: "Outstanding balance too high" },
    });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.cash_advance_requests") && c.sql.includes("'denied'"))).toBe(true);
    expect(appendCrudAudit).toHaveBeenCalledOnce();
  });

  it("double-action guard — returns not_deniable when already denied", async () => {
    const { client } = makeMockClient({ lockRow: { ...PENDING_ROW, status: "denied" } });
    const result = await denyHubCashAdvanceRequest(client, {
      operatingCompanyId: OC,
      requestId: REQ_ID,
      actorUserId: USER,
      body: { denial_reason: "already handled" },
    });
    expect(result).toEqual({ ok: false, error: "not_deniable" });
  });
});
