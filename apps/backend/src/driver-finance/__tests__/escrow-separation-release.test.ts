import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  queryMock: vi.fn(),
  isEnabledMock: vi.fn(),
  releaseEscrowOnClientMock: vi.fn(),
  appendCrudAuditMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mocked.queryMock }) => Promise<unknown>) =>
    fn({ query: mocked.queryMock }),
}));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: mocked.isEnabledMock }));
vi.mock("../../accounting/escrow/service.js", () => ({ releaseEscrowOnClient: mocked.releaseEscrowOnClientMock }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocked.appendCrudAuditMock }));

import { releaseDriverEscrowSeparation } from "../escrow-separation.service.js";

const SEPARATION_ROW = {
  id: "sep00000-0000-0000-0000-000000000001",
  operating_company_id: "oc000000-0000-0000-0000-000000000001",
  driver_id: "dr000000-0000-0000-0000-000000000001",
  escrow_account_id: "esc00000-0000-0000-0000-000000000001",
  separation_date: "2026-01-01",
  eligible_release_date: "2026-04-01",
  escrow_balance_at_separation_cents: 50000,
  outstanding_damage_claims_cents: null,
  released_amount_cents: null,
  retained_for_damages_cents: null,
  status: "pending",
  released_posting_id: null,
  released_at: null,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function mockQueryImplementation(opts: {
  separation?: Record<string, unknown> | null;
  balanceCents?: number;
  outstandingDamageCents?: number;
  /** ACCT-F5657 — driver_finance.escrow_balances' own current balance for this driver. Defaults to
   * mirroring balanceCents so existing tests (written before the driver-facing sync fix) keep exercising
   * the same happy path unchanged; the dedicated split-brain test below overrides this to 0/missing. */
  driverFinanceBalanceCents?: number | null;
}) {
  mocked.queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM driver_finance.driver_escrow_separations") && sql.includes("FOR UPDATE")) {
      const row = opts.separation === undefined ? SEPARATION_ROW : opts.separation;
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("FROM accounting.escrow_accounts")) {
      return { rows: [{ balance_cents: opts.balanceCents ?? 50000 }] };
    }
    if (sql.includes("FROM driver_finance.driver_settlement_deductions")) {
      return { rows: [{ total: opts.outstandingDamageCents ?? 0 }] };
    }
    // ACCT-F5657 — ESC-SEPARATION-SPLIT's driver-facing decrement + ledger append.
    if (sql.includes("UPDATE driver_finance.escrow_balances")) {
      const dfBalance = opts.driverFinanceBalanceCents === undefined ? (opts.balanceCents ?? 50000) : opts.driverFinanceBalanceCents;
      if (dfBalance === null) return { rows: [] }; // simulates WHERE current_balance_cents >= $3 failing
      return { rows: [{ id: "dfbal-1", current_balance_cents: dfBalance }] };
    }
    if (sql.includes("INSERT INTO driver_finance.escrow_ledger")) {
      return { rows: [] };
    }
    if (sql.includes("UPDATE driver_finance.driver_escrow_separations")) {
      return {
        rows: [
          {
            ...SEPARATION_ROW,
            status: "released",
            released_at: "2026-04-01T00:00:00.000Z",
          },
        ],
      };
    }
    return { rows: [] };
  });
}

describe("releaseDriverEscrowSeparation (BLOCK-02)", () => {
  beforeEach(() => {
    mocked.queryMock.mockReset();
    mocked.isEnabledMock.mockReset();
    mocked.releaseEscrowOnClientMock.mockReset();
    mocked.appendCrudAuditMock.mockClear();
  });

  it("is Owner-only", async () => {
    await expect(
      releaseDriverEscrowSeparation(
        { operating_company_id: "oc-1", separation_id: "sep-1" },
        { userId: "user-1", role: "Accountant" }
      )
    ).rejects.toThrow("E_OWNER_ONLY");
    expect(mocked.queryMock).not.toHaveBeenCalled();
  });

  it("no-ops (skipped_flag_off) when the return flag is OFF — zero writes", async () => {
    mocked.isEnabledMock.mockResolvedValue(false);
    mockQueryImplementation({});
    const result = await releaseDriverEscrowSeparation(
      { operating_company_id: "oc-1", separation_id: "sep-1" },
      { userId: "user-1", role: "Owner" }
    );
    expect(result).toEqual({ result: "skipped_flag_off" });
    expect(mocked.releaseEscrowOnClientMock).not.toHaveBeenCalled();
  });

  it("refuses release before the 90-day eligible_release_date", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mockQueryImplementation({ separation: { ...SEPARATION_ROW, eligible_release_date: "2099-01-01" } });
    const result = await releaseDriverEscrowSeparation(
      { operating_company_id: "oc-1", separation_id: "sep-1" },
      { userId: "user-1", role: "Owner" }
    );
    expect(result).toMatchObject({ result: "not_eligible" });
    expect(mocked.releaseEscrowOnClientMock).not.toHaveBeenCalled();
  });

  it("releases the full balance to the driver when there are no outstanding damage claims", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.releaseEscrowOnClientMock.mockResolvedValue({ posting: { id: "posting-1" }, balance_cents: 0 });
    mockQueryImplementation({ balanceCents: 50000, outstandingDamageCents: 0 });

    const result = await releaseDriverEscrowSeparation(
      { operating_company_id: "oc-1", separation_id: "sep-1" },
      { userId: "user-1", role: "Owner" }
    );

    expect(result).toMatchObject({ result: "released", net_release_cents: 50000, retained_for_damages_cents: 0 });
    // ACCT-F5644 — releaseEscrowOnClient's FIRST argument must be this same function's own client
    // (the one already holding the FOR UPDATE lock on the separation row), never a second connection.
    expect(mocked.releaseEscrowOnClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: mocked.queryMock }),
      expect.objectContaining({ amount_cents: 50000, source_type: "manual", source_id: SEPARATION_ROW.id }),
      { userId: "user-1", role: "Owner" }
    );
  });

  it("nets outstanding damage claims before releasing, and does NOT call releaseEscrow for a fully-absorbed balance", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mockQueryImplementation({ balanceCents: 20000, outstandingDamageCents: 50000 });

    const result = await releaseDriverEscrowSeparation(
      { operating_company_id: "oc-1", separation_id: "sep-1" },
      { userId: "user-1", role: "Owner" }
    );

    expect(result).toMatchObject({ result: "released", net_release_cents: 0, retained_for_damages_cents: 20000 });
    expect(mocked.releaseEscrowOnClientMock).not.toHaveBeenCalled();
  });

  it("ACCT-F5657: decrements driver_finance.escrow_balances and appends the escrow_ledger row in the same transaction as the release", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.releaseEscrowOnClientMock.mockResolvedValue({ posting: { id: "posting-1" }, balance_cents: 0 });
    mockQueryImplementation({ balanceCents: 50000, outstandingDamageCents: 0, driverFinanceBalanceCents: 50000 });

    const result = await releaseDriverEscrowSeparation(
      { operating_company_id: "oc-1", separation_id: "sep-1" },
      { userId: "user-1", role: "Owner" }
    );

    expect(result).toMatchObject({ result: "released", net_release_cents: 50000 });
    const decrementCall = mocked.queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE driver_finance.escrow_balances")
    );
    expect(decrementCall).toBeDefined();
    expect(decrementCall?.[1]).toEqual(["oc-1", SEPARATION_ROW.driver_id, 50000]);
    const ledgerCall = mocked.queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO driver_finance.escrow_ledger")
    );
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall?.[1]).toEqual(
      expect.arrayContaining(["oc-1", SEPARATION_ROW.driver_id, "dfbal-1", 50000, 50000])
    );
  });

  it("ACCT-F5657: refuses a split-brain release when driver_finance.escrow_balances is missing or insufficient, even though accounting already posted", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mocked.releaseEscrowOnClientMock.mockResolvedValue({ posting: { id: "posting-1" }, balance_cents: 0 });
    mockQueryImplementation({ balanceCents: 50000, outstandingDamageCents: 0, driverFinanceBalanceCents: null });

    await expect(
      releaseDriverEscrowSeparation(
        { operating_company_id: "oc-1", separation_id: "sep-1" },
        { userId: "user-1", role: "Owner" }
      )
    ).rejects.toThrow("E_ESCROW_BALANCES_MISSING");
    // The accounting-side release already ran on this same (mocked) client before the guard fired --
    // that is expected and safe, since throwing here rolls back the WHOLE transaction atomically
    // (this is a unit test of the query sequence, not a transaction-rollback test; the real DB
    // transaction guarantee is what makes this refusal safe in production).
    expect(mocked.releaseEscrowOnClientMock).toHaveBeenCalled();
  });

  it("rejects re-release of an already-resolved separation", async () => {
    mocked.isEnabledMock.mockResolvedValue(true);
    mockQueryImplementation({ separation: { ...SEPARATION_ROW, status: "released" } });
    await expect(
      releaseDriverEscrowSeparation(
        { operating_company_id: "oc-1", separation_id: "sep-1" },
        { userId: "user-1", role: "Owner" }
      )
    ).rejects.toThrow("E_ALREADY_RESOLVED");
  });
});
