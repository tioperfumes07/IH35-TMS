import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  cloneAsIsImportAndCommit,
  commitObRegister,
  computeCommitBlockers,
  computeObTotals,
  importObRegisterFromFixture,
  importObRegisterFromQbo,
  OB_OBE_RESIDUAL_TOLERANCE_CENTS,
  OB_REGISTER_PERIODS,
  ObRegisterError,
  setObSourceFinality,
} from "../opening-balance-register.service.js";

const { mockIsEnabled } = vi.hoisted(() => ({ mockIsEnabled: vi.fn() }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const MAKER = "aaaaaaaa-1111-4111-8111-111111111111";
const CHECKER = "bbbbbbbb-2222-4222-8222-222222222222";
const CASH = "cccccccc-3333-4333-8333-333333333333";
const EQUITY = "dddddddd-4444-4444-8444-444444444444";
const OBE = "eeeeeeee-5555-4555-8555-555555555555";

type StagedFixture = {
  id: string;
  account_id: string;
  account_name: string;
  account_type: string;
  amount_cents: number;
  qbo_snapshot_cents?: number | null;
  adjustment_cents?: number;
  created_by_user_id: string;
};

/**
 * Fake client that answers by SQL shape and RECORDS every write, so a test can assert not just the
 * refusal outcome but that catalogs.accounts was never touched — a refusal that still wrote would be
 * the exact defect this gate exists to prevent.
 *
 * NOTE: `isFinal` is accepted only so a test can prove the register's OWN finality row exists and is
 * still IGNORED by the commit gate (owner ruling 2026-07-29 — no finality gate). It is never read by
 * computeCommitBlockers.
 */
function fakeClient(opts: {
  companyCode?: string;
  staged?: StagedFixture[];
  isFinal?: boolean;
  mostRecentByAccount?: Record<string, { qbo_snapshot_cents: number | null; adjustment_cents: number }>;
}) {
  const staged = opts.staged ?? [];
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    writes,
    accountUpdates: () => writes.filter((w) => /UPDATE catalogs\.accounts/.test(w.sql)),
    auditEvents: () =>
      writes
        .filter((w) => /INSERT INTO accounting\.ob_register_audit_events/.test(w.sql))
        .map((w) => String(w.values[4])),
    query: async (sql: string, values: unknown[] = []) => {
      if (/FROM org\.companies/.test(sql)) {
        return { rows: [{ id: OPCO, code: opts.companyCode ?? "TRANSP" }] };
      }
      if (/FROM accounting\.ob_register_staging_lines/.test(sql) && /JOIN catalogs\.accounts/.test(sql)) {
        return {
          rows: staged.map((s) => ({
            id: s.id,
            account_id: s.account_id,
            account_number: null,
            account_name: s.account_name,
            account_type: s.account_type,
            amount_cents: String(s.amount_cents),
            qbo_snapshot_cents: s.qbo_snapshot_cents ?? null,
            adjustment_cents: String(s.adjustment_cents ?? s.amount_cents),
            source: "manual",
            source_account_label: null,
            qbo_account_id: null,
            status: "staged",
            note: null,
            created_by_user_id: s.created_by_user_id,
            updated_by_user_id: s.created_by_user_id,
            updated_at: "2026-07-28T00:00:00.000Z",
            posted_opening_balance_cents: null,
            posted_opening_balance_as_of: null,
          })),
        };
      }
      // loadMostRecentLine — no JOIN, just the two persistence columns for one account/period. Used to
      // prove "re-import refreshes the Snapshot only; a prior Adjustment persists".
      if (/SELECT qbo_snapshot_cents, adjustment_cents\s+FROM accounting\.ob_register_staging_lines/.test(sql)) {
        const accountId = String(values[2]);
        const prior = opts.mostRecentByAccount?.[accountId];
        return prior ? { rows: [{ qbo_snapshot_cents: prior.qbo_snapshot_cents, adjustment_cents: prior.adjustment_cents }] } : { rows: [] };
      }
      if (/FROM accounting\.ob_source_finality/.test(sql)) {
        return opts.isFinal
          ? {
              rows: [
                { is_final: true, set_by: MAKER, set_by_name: "Martin M", set_at: "2026-07-28T00:00:00.000Z", note: null },
              ],
            }
          : { rows: [] };
      }
      if (/FROM integrations\.qbo_connections/.test(sql)) {
        return { rows: [{ n: opts.companyCode === "USMCA" ? "0" : "1" }] };
      }
      if (/FROM catalogs\.accounts\s+WHERE operating_company_id/.test(sql)) {
        // importObRegisterFromFixture's account lookup — no accounts by default (tests that need a
        // match pass their own client or assert on `unmapped`).
        return { rows: [] };
      }
      writes.push({ sql, values });
      if (/RETURNING id/.test(sql)) return { rows: [{ id: "written" }] };
      return { rows: [] };
    },
  };
  return client;
}

/** A balanced, OBE-cleared register: Dr cash 100.00 / Cr equity 100.00. Hand-entered (no Snapshot). */
const BALANCED: StagedFixture[] = [
  { id: "line-cash", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 10_000, qbo_snapshot_cents: null, adjustment_cents: 10_000, created_by_user_id: MAKER },
  { id: "line-eq", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 10_000, qbo_snapshot_cents: null, adjustment_cents: 10_000, created_by_user_id: MAKER },
];

beforeEach(() => {
  mockIsEnabled.mockReset();
  mockIsEnabled.mockResolvedValue(true);
});

describe("OB-01 commit — owner ruling 2026-07-29: NO finality gate", () => {
  it("commits a balanced register even though no finality row exists at all", async () => {
    const client = fakeClient({ staged: BALANCED, isFinal: false });

    const result = await commitObRegister(client, OPCO, CHECKER);

    expect(result.committed).toBe(true);
    expect(result.as_of_date).toBe(OB_REGISTER_PERIODS.TRANSP.as_of_date);
    expect(client.accountUpdates()).toHaveLength(2);
    expect(client.auditEvents()).toContain("committed");
  });

  it("commits identically whether the (advisory) finality flag is true or false", async () => {
    const notFinal = await commitObRegister(fakeClient({ staged: BALANCED, isFinal: false }), OPCO, CHECKER);
    const final = await commitObRegister(fakeClient({ staged: BALANCED, isFinal: true }), OPCO, CHECKER);
    expect(notFinal.committed).toBe(true);
    expect(final.committed).toBe(true);
  });

  it("writes opening_balance_qbo_snapshot_cents and opening_balance_adjustment_cents on commit", async () => {
    const client = fakeClient({
      staged: [
        { id: "l1", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 12_000, qbo_snapshot_cents: 10_000, adjustment_cents: 2_000, created_by_user_id: MAKER },
        { id: "l2", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 12_000, qbo_snapshot_cents: 10_000, adjustment_cents: 2_000, created_by_user_id: MAKER },
      ],
    });
    await commitObRegister(client, OPCO, CHECKER);
    const [update] = client.accountUpdates();
    // UPDATE catalogs.accounts SET opening_balance_cents=$1, opening_balance_as_of=$2,
    // opening_balance_qbo_snapshot_cents=$3, opening_balance_adjustment_cents=$4 WHERE id=$5 ...
    expect(update!.values[0]).toBe(12_000); // amount_cents (Adjusted Opening)
    expect(update!.values[2]).toBe(10_000); // qbo_snapshot_cents
    expect(update!.values[3]).toBe(2_000); // adjustment_cents
  });

  it("refuses when the committer is also the maker (maker/checker separation) — unaffected by the ruling", async () => {
    const client = fakeClient({ staged: BALANCED, isFinal: true });

    const result = await commitObRegister(client, OPCO, MAKER);

    expect(result.committed).toBe(false);
    expect(result.blockers).toContain("maker_is_checker");
    expect(client.accountUpdates()).toHaveLength(0);
  });

  it("bypassMakerChecker (system clone-as-is path only) skips maker/checker but not other checks", async () => {
    // Same actor stages AND "commits" — would refuse under a human commit, but the system path passes
    // bypassMakerChecker because there is no second human by construction.
    const balancedByOneActor: StagedFixture[] = [
      { id: "l1", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 10_000, qbo_snapshot_cents: 10_000, adjustment_cents: 0, created_by_user_id: MAKER },
      { id: "l2", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 10_000, qbo_snapshot_cents: 10_000, adjustment_cents: 0, created_by_user_id: MAKER },
    ];
    const client = fakeClient({ staged: balancedByOneActor });
    const result = await commitObRegister(client, OPCO, MAKER, { bypassMakerChecker: true });
    expect(result.committed).toBe(true);
    expect(client.accountUpdates()).toHaveLength(2);
  });

  it("bypassMakerChecker still refuses an unbalanced register — it is not a rubber stamp", async () => {
    const client = fakeClient({
      staged: [
        { id: "l1", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 10_000, qbo_snapshot_cents: 10_000, adjustment_cents: 0, created_by_user_id: MAKER },
        { id: "l2", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 9_000, qbo_snapshot_cents: 9_000, adjustment_cents: 0, created_by_user_id: MAKER },
      ],
    });
    const result = await commitObRegister(client, OPCO, MAKER, { bypassMakerChecker: true });
    expect(result.committed).toBe(false);
    expect(result.blockers).toContain("unbalanced");
    expect(client.accountUpdates()).toHaveLength(0);
  });

  it("refuses an unbalanced register", async () => {
    const client = fakeClient({
      isFinal: true,
      staged: [
        { id: "l1", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 10_000, created_by_user_id: MAKER },
        { id: "l2", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 9_000, created_by_user_id: MAKER },
      ],
    });

    const result = await commitObRegister(client, OPCO, CHECKER);

    expect(result.committed).toBe(false);
    expect(result.blockers).toContain("unbalanced");
    expect(client.accountUpdates()).toHaveLength(0);
  });

  it("refuses while Opening Balance Equity still carries a residue", async () => {
    // Balances (Dr 100.00 = Cr 40.00 + 60.00) but OBE was never reclassed to Retained Earnings.
    const client = fakeClient({
      isFinal: true,
      staged: [
        { id: "l1", account_id: CASH, account_name: "Cash", account_type: "Asset", amount_cents: 10_000, created_by_user_id: MAKER },
        { id: "l2", account_id: EQUITY, account_name: "Retained Earnings", account_type: "Equity", amount_cents: 4_000, created_by_user_id: MAKER },
        { id: "l3", account_id: OBE, account_name: "Opening Balance Equity", account_type: "Equity", amount_cents: 6_000, created_by_user_id: MAKER },
      ],
    });

    const result = await commitObRegister(client, OPCO, CHECKER);

    expect(result.committed).toBe(false);
    expect(result.blockers).toContain("obe_not_reclassed");
    expect(client.accountUpdates()).toHaveLength(0);
  });

  it("setObSourceFinality still records the audited flip — it is advisory-only, not deleted", async () => {
    const client = fakeClient({ staged: BALANCED, isFinal: false });
    await setObSourceFinality(client, OPCO, MAKER, { is_final: true, note: "QBO cleanup complete" });
    expect(client.auditEvents()).toContain("finality_set");
    expect(client.writes.some((w) => /INSERT INTO accounting\.ob_source_finality/.test(w.sql))).toBe(true);
  });
});

describe("OB-01 totals use the existing signed-actual convention", () => {
  it("maps positive assets to debits and positive equity to credits", () => {
    const totals = computeObTotals([
      { account_type: "Asset", account_name: "Cash", amount_cents: 10_000 },
      { account_type: "Equity", account_name: "Retained Earnings", amount_cents: 10_000 },
    ]);
    expect(totals.total_debits_cents).toBe(10_000);
    expect(totals.total_credits_cents).toBe(10_000);
    expect(totals.is_balanced).toBe(true);
    expect(totals.obe_is_reclassed).toBe(true);
  });

  it("treats any OBE residue as a failure — the tolerance is exactly zero", () => {
    expect(OB_OBE_RESIDUAL_TOLERANCE_CENTS).toBe(0);
    const totals = computeObTotals([
      { account_type: "Equity", account_name: "Opening Balance Equity", amount_cents: 1 },
    ]);
    expect(totals.obe_is_reclassed).toBe(false);
  });

  it("flags a non-balance-sheet account type instead of silently dropping its amount", () => {
    const totals = computeObTotals([
      { account_type: "Expense", account_name: "Fuel", amount_cents: 500 },
    ]);
    expect(totals.unsupported_types).toEqual(["Fuel"]);
    const blockers = computeCommitBlockers({ totals, makers: [MAKER], checkerUserId: CHECKER });
    expect(blockers).toContain("non_balance_sheet_account_type");
  });

  it("reports every blocker at once so a reviewer fixes them in one pass — the removed finality blocker cannot appear", () => {
    const totals = computeObTotals([]);
    const blockers = computeCommitBlockers({ totals, makers: [], checkerUserId: CHECKER });
    expect(blockers).toEqual(["no_staged_lines"]);
  });

  it("checkerUserId: null (system path) never raises maker_is_checker", () => {
    const totals = computeObTotals([{ account_type: "Asset", account_name: "Cash", amount_cents: 1 }]);
    const blockers = computeCommitBlockers({ totals, makers: [MAKER], checkerUserId: null });
    expect(blockers).not.toContain("maker_is_checker");
  });
});

describe("OB-01 QBO import — re-import refreshes the Snapshot only", () => {
  it("refuses to import for USMCA — there is no QBO realm to pull from", async () => {
    const client = fakeClient({ companyCode: "USMCA" });
    await expect(importObRegisterFromQbo(client, OPCO, MAKER)).rejects.toBeInstanceOf(ObRegisterError);
    await expect(importObRegisterFromQbo(client, OPCO, MAKER)).rejects.toMatchObject({
      code: "manual_entry_only",
    });
  });

  it("pulls each entity's own as-of date, not one hardcoded date", () => {
    expect(OB_REGISTER_PERIODS.TRANSP.as_of_date).toBe("2026-03-31");
    expect(OB_REGISTER_PERIODS.TRK.as_of_date).toBe("2024-12-31");
    expect(OB_REGISTER_PERIODS.USMCA.import_source).toBe("manual_only");
  });

  it("stages the QBO balance sheet without writing catalogs.accounts", async () => {
    const client = fakeClient({ companyCode: "TRK" });
    const report = {
      Header: { ReportName: "BalanceSheet", ReportBasis: "Accrual", StartPeriod: "2024-12-31", EndPeriod: "2024-12-31", Currency: "USD" },
      Columns: { Column: [{ ColTitle: "", ColType: "Account" }, { ColTitle: "Total", ColType: "Money" }] },
      Rows: {
        Row: [
          {
            type: "Section",
            Rows: {
              Row: [{ type: "Data", ColData: [{ value: "Checking", id: "35" }, { value: "100.00" }] }],
            },
          },
        ],
      },
    };

    const result = await importObRegisterFromQbo(client, OPCO, MAKER, {
      qboCompanyContext: async () => ({ operatingCompanyId: OPCO, realmId: "realm-trk" }),
      qboReport: async (_ctx, _name, params) => {
        expect(params?.start_date).toBe("2024-12-31");
        expect(params?.end_date).toBe("2024-12-31");
        return report as never;
      },
    });

    expect(result.realm_id).toBe("realm-trk");
    expect(result.as_of_date).toBe("2024-12-31");
    expect(client.accountUpdates()).toHaveLength(0);
    expect(client.auditEvents()).toContain("import_staged");
  });
});

describe("OB-01 clone-as-is fixture import", () => {
  it("matches exact account names and reports unmapped names honestly — never invents a match", async () => {
    const client = fakeClient({});
    client.query = (async (sql: string, values: unknown[] = []) => {
      if (/FROM org\.companies/.test(sql)) return { rows: [{ id: OPCO, code: "TRANSP" }] };
      if (/FROM catalogs\.accounts\s+WHERE operating_company_id/.test(sql)) {
        return { rows: [{ id: CASH, account_name: "BOA-CHECKING-1135" }] };
      }
      if (/SELECT qbo_snapshot_cents, adjustment_cents/.test(sql)) return { rows: [] };
      client.writes.push({ sql, values });
      if (/RETURNING id/.test(sql)) return { rows: [{ id: "written" }] };
      return { rows: [] };
    }) as typeof client.query;

    const result = await importObRegisterFromFixture(client, OPCO, MAKER, [
      { qbo_account_name: "BOA-CHECKING-1135", qbo_snapshot_cents: 14_775_316 },
      { qbo_account_name: "Some Account That Does Not Exist", qbo_snapshot_cents: 100 },
    ]);

    expect(result.mapped_count).toBe(1);
    expect(result.staged_count).toBe(1);
    expect(result.unmapped).toEqual([
      { qbo_account_name: "Some Account That Does Not Exist", reason: expect.stringContaining("never invented") },
    ]);
  });

  it("refuses for a non-TRANSP entity — the fixture is TRANSP-only", async () => {
    const client = fakeClient({ companyCode: "USMCA" });
    await expect(importObRegisterFromFixture(client, OPCO, MAKER, [])).rejects.toMatchObject({
      code: "fixture_entity_mismatch",
    });
  });
});

describe("OB-01 clone-as-is import + commit (the owner-ordered system action)", () => {
  it("imports from the fixture (no QBO connection) and commits with bypassMakerChecker", async () => {
    const client = fakeClient({ companyCode: "TRANSP" });
    let accountsQueried = false;
    client.query = (async (sql: string, values: unknown[] = []) => {
      if (/FROM org\.companies/.test(sql)) return { rows: [{ id: OPCO, code: "TRANSP" }] };
      if (/FROM integrations\.qbo_connections/.test(sql)) return { rows: [{ n: "0" }] }; // no QBO connection
      if (/FROM catalogs\.accounts\s+WHERE operating_company_id/.test(sql)) {
        accountsQueried = true;
        return {
          rows: [
            { id: CASH, account_name: "Cash" },
            { id: EQUITY, account_name: "Retained Earnings" },
          ],
        };
      }
      if (/SELECT qbo_snapshot_cents, adjustment_cents/.test(sql)) return { rows: [] };
      if (/FROM accounting\.ob_register_staging_lines/.test(sql) && /JOIN catalogs\.accounts/.test(sql)) {
        return {
          rows: [
            {
              id: "l1", account_id: CASH, account_number: null, account_name: "Cash", account_type: "Asset",
              amount_cents: "10000", qbo_snapshot_cents: 10_000, adjustment_cents: "0", source: "qbo_import",
              source_account_label: "Cash", qbo_account_id: null, status: "staged", note: null,
              created_by_user_id: MAKER, updated_by_user_id: MAKER, updated_at: "2026-07-28T00:00:00.000Z",
              posted_opening_balance_cents: null, posted_opening_balance_as_of: null,
            },
            {
              id: "l2", account_id: EQUITY, account_number: null, account_name: "Retained Earnings", account_type: "Equity",
              amount_cents: "10000", qbo_snapshot_cents: 10_000, adjustment_cents: "0", source: "qbo_import",
              source_account_label: "Retained Earnings", qbo_account_id: null, status: "staged", note: null,
              created_by_user_id: MAKER, updated_by_user_id: MAKER, updated_at: "2026-07-28T00:00:00.000Z",
              posted_opening_balance_cents: null, posted_opening_balance_as_of: null,
            },
          ],
        };
      }
      if (/FROM accounting\.ob_source_finality/.test(sql)) return { rows: [] };
      client.writes.push({ sql, values });
      if (/RETURNING id/.test(sql)) return { rows: [{ id: "written" }] };
      return { rows: [] };
    }) as typeof client.query;

    const result = await cloneAsIsImportAndCommit(client, OPCO, MAKER);

    expect(accountsQueried).toBe(true);
    expect(result.import_source).toBe("fixture");
    expect(result.commit.committed).toBe(true);
    if (result.commit.committed) expect(result.commit.accounts_written).toBe(2);
  });

  it("refuses honestly for TRK/USMCA with neither a QBO connection nor a fixture", async () => {
    const client = fakeClient({ companyCode: "USMCA" });
    client.query = (async (sql: string) => {
      if (/FROM org\.companies/.test(sql)) return { rows: [{ id: OPCO, code: "USMCA" }] };
      if (/FROM integrations\.qbo_connections/.test(sql)) return { rows: [{ n: "0" }] };
      return { rows: [] };
    }) as typeof client.query;

    await expect(cloneAsIsImportAndCommit(client, OPCO, MAKER)).rejects.toMatchObject({
      code: "clone_as_is_no_source",
    });
  });
});
