import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QboApiContext, QboReportResponse } from "../../../integrations/qbo/qbo-client.js";
import {
  pullQboOb20260331LivePreview,
  mapQboObAccountsViaMdata,
  assembleQboObJePreviewFromMappedBs,
  QBO_OB_LIVE_AS_OF,
  QBO_OB_LIVE_ENTRY_DATE,
  QBO_OB_LIVE_ACCOUNTING_METHOD,
  QBO_OB_ACCOUNT_MAP_STRATEGY,
  QBO_OB_OBE_ACCOUNT_LABEL,
  type QboObAccountMapping,
  type QboObLiveBalanceSheet,
} from "../qbo-ob-2026-03-31-live-pull.service.js";

const { mockIsEnabled } = vi.hoisted(() => ({ mockIsEnabled: vi.fn() }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const REALM = "123145885549599";
const MDATA_ID = "22222222-2222-4222-8222-222222222222";
const CATALOG_ID = "33333333-3333-4333-8333-333333333333";
const OBE_CATALOG_ID = "44444444-4444-4444-8444-444444444444";
const LIAB_CATALOG_ID = "55555555-5555-4555-8555-555555555555";

const CTX: QboApiContext = { operatingCompanyId: OPCO, realmId: REALM };

const BS_RAW: QboReportResponse = {
  Header: {
    ReportName: "BalanceSheet",
    ReportBasis: "Accrual",
    StartPeriod: "2026-03-31",
    EndPeriod: "2026-03-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account" },
      { ColTitle: "Total", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Data",
        ColData: [{ value: "Checking", id: "35" }, { value: "1,350.55" }],
      },
      {
        type: "Data",
        ColData: [{ value: "Mystery", id: "99" }, { value: "10.00" }],
      },
    ],
  },
};

const TB_RAW: QboReportResponse = {
  Header: {
    ReportName: "TrialBalance",
    ReportBasis: "Accrual",
    StartPeriod: "2026-03-31",
    EndPeriod: "2026-03-31",
    Currency: "USD",
  },
  Columns: {
    Column: [
      { ColTitle: "Account", ColType: "Account" },
      { ColTitle: "Debit", ColType: "Money" },
      { ColTitle: "Credit", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Data",
        ColData: [{ value: "Checking", id: "35" }, { value: "1,350.55" }, { value: "" }],
      },
      {
        type: "Data",
        ColData: [{ value: "Mystery", id: "99" }, { value: "10.00" }, { value: "" }],
      },
    ],
  },
};

function clientWithMapRows(rows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM mdata.qbo_accounts")) return { rows };
      return { rows: [] };
    }),
  };
}

describe("pullQboOb20260331LivePreview", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
  });

  it("flag OFF => flag_off empty response, never calls QBO", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const qboCompanyContext = vi.fn();
    const qboReport = vi.fn();

    const result = await pullQboOb20260331LivePreview(clientWithMapRows([]) as never, OPCO, {
      qboCompanyContext,
      qboReport,
    });

    expect(result).toEqual({
      flag_off: true,
      realm_id: "",
      as_of: QBO_OB_LIVE_AS_OF,
      balance_sheet: null,
      trial_balance: null,
      account_mapping: null,
      je_assemble: null,
      pulled_at: null,
    });
    expect(qboCompanyContext).not.toHaveBeenCalled();
    expect(qboReport).not.toHaveBeenCalled();
  });

  it("flag ON => pulls BS+TB, maps via mdata, refuses balanced JE when unmapped remain", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const qboCompanyContext = vi.fn(async () => CTX);
    const qboReport = vi.fn(async (_ctx: QboApiContext, reportName: string) => {
      if (reportName === "BalanceSheet") return BS_RAW;
      if (reportName === "TrialBalance") return TB_RAW;
      throw new Error(`unexpected report ${reportName}`);
    });
    const db = clientWithMapRows([
      {
        qbo_account_id: "35",
        mdata_qbo_accounts_id: MDATA_ID,
        mdata_name: "Checking",
        catalogs_account_id: CATALOG_ID,
        catalogs_account_number: "1000",
        catalogs_account_name: "Checking",
        catalogs_account_type: "Asset",
      },
    ]);

    const result = await pullQboOb20260331LivePreview(db as never, OPCO, {
      qboCompanyContext,
      qboReport,
    });

    expect(result.flag_off).toBe(false);
    expect(result.realm_id).toBe(REALM);
    expect(result.as_of).toBe("2026-03-31");
    expect(result.pulled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.balance_sheet?.lines).toEqual([
      { qbo_account_id: "35", account_name: "Checking", balance_cents: "135055" },
      { qbo_account_id: "99", account_name: "Mystery", balance_cents: "1000" },
    ]);
    expect(result.account_mapping?.strategy).toBe(QBO_OB_ACCOUNT_MAP_STRATEGY);
    expect(result.account_mapping?.counts).toEqual({
      unique_qbo_account_ids: 2,
      mapped: 1,
      unmapped: 1,
    });
    expect(result.account_mapping?.mapped).toEqual([
      {
        qbo_account_id: "35",
        report_account_name: "Checking",
        mdata_qbo_accounts_id: MDATA_ID,
        mdata_name: "Checking",
        catalogs_account_id: CATALOG_ID,
        catalogs_account_number: "1000",
        catalogs_account_name: "Checking",
        catalogs_account_type: "Asset",
      },
    ]);
    expect(result.je_assemble?.is_balanced).toBe(false);
    expect(result.je_assemble?.unbalanced).toBe(true);
    expect(result.je_assemble?.ready_to_post).toBe(false);
    expect(result.je_assemble?.je_preview).toBeNull();
    expect(result.je_assemble?.refuse_reason).toBe("unmapped_remain");
    expect(result.je_assemble?.bs_unmapped).toEqual([
      {
        qbo_account_id: "99",
        report_account_name: "Mystery",
        reason: "no_mdata_mirror",
        mdata_qbo_accounts_id: null,
        mdata_name: null,
      },
    ]);

    expect(qboCompanyContext).toHaveBeenCalledWith(OPCO);
    expect(qboReport).toHaveBeenCalledTimes(2);
    expect(qboReport).toHaveBeenCalledWith(CTX, "BalanceSheet", {
      start_date: "2026-03-31",
      end_date: "2026-03-31",
      accounting_method: QBO_OB_LIVE_ACCOUNTING_METHOD,
    });
    expect(db.query).toHaveBeenCalled();
    const [sql, values] = db.query.mock.calls[0]!;
    expect(sql).toContain("FROM mdata.qbo_accounts");
    expect(sql).toContain("ca.account_type AS catalogs_account_type");
    expect(sql).toContain("ca.qbo_account_id = qa.qbo_id");
    expect(values).toEqual([OPCO, ["35", "99"]]);
  });

  it("never imports journal-entry writers (preview-only contract)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serviceSrc = fs.readFileSync(path.join(here, "../qbo-ob-2026-03-31-live-pull.service.ts"), "utf8");
    const routesSrc = fs.readFileSync(path.join(here, "../qbo-ob-2026-03-31-live-pull.routes.ts"), "utf8");
    expect(serviceSrc).not.toMatch(/import\s+.*createJournalEntry|from\s+["'][^"']*journal-entr/);
    expect(routesSrc).not.toMatch(/import\s+.*createJournalEntry|from\s+["'][^"']*journal-entr/);
    expect(serviceSrc).not.toMatch(/\bcreateJournalEntry\s*\(/);
    expect(routesSrc).not.toMatch(/\bcreateJournalEntry\s*\(/);
  });
});

describe("mapQboObAccountsViaMdata", () => {
  it("surfaces no_catalogs_account when mirror exists without catalogs row", async () => {
    const db = clientWithMapRows([
      {
        qbo_account_id: "35",
        mdata_qbo_accounts_id: MDATA_ID,
        mdata_name: "Checking",
        catalogs_account_id: null,
        catalogs_account_number: null,
        catalogs_account_name: null,
        catalogs_account_type: null,
      },
    ]);

    const result = await mapQboObAccountsViaMdata(db as never, OPCO, [
      { qbo_account_id: "35", account_name: "Checking" },
    ]);

    expect(result.mapped).toEqual([]);
    expect(result.unmapped).toEqual([
      {
        qbo_account_id: "35",
        report_account_name: "Checking",
        reason: "no_catalogs_account",
        mdata_qbo_accounts_id: MDATA_ID,
        mdata_name: "Checking",
      },
    ]);
  });
});

describe("assembleQboObJePreviewFromMappedBs", () => {
  const checkingMapped = {
    qbo_account_id: "35",
    report_account_name: "Checking",
    mdata_qbo_accounts_id: MDATA_ID,
    mdata_name: "Checking",
    catalogs_account_id: CATALOG_ID,
    catalogs_account_number: "1000",
    catalogs_account_name: "Checking",
    catalogs_account_type: "Asset",
  };
  const apMapped = {
    qbo_account_id: "47",
    report_account_name: "A/P",
    mdata_qbo_accounts_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    mdata_name: "A/P",
    catalogs_account_id: LIAB_CATALOG_ID,
    catalogs_account_number: "2000",
    catalogs_account_name: "A/P (A/P)",
    catalogs_account_type: "Liability",
  };
  const obeMapped = {
    qbo_account_id: "300",
    report_account_name: QBO_OB_OBE_ACCOUNT_LABEL,
    mdata_qbo_accounts_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    mdata_name: QBO_OB_OBE_ACCOUNT_LABEL,
    catalogs_account_id: OBE_CATALOG_ID,
    catalogs_account_number: "3000",
    catalogs_account_name: QBO_OB_OBE_ACCOUNT_LABEL,
    catalogs_account_type: "Equity",
  };

  function mapping(mapped: typeof checkingMapped[]): QboObAccountMapping {
    return {
      strategy: QBO_OB_ACCOUNT_MAP_STRATEGY,
      mapped,
      unmapped: [],
      counts: { unique_qbo_account_ids: mapped.length, mapped: mapped.length, unmapped: 0 },
    };
  }

  it("all BS lines mapped + naturally balanced => je_preview ready_to_post (no OBE plug)", () => {
    const balanceSheet: QboObLiveBalanceSheet = {
      reportBasis: "Accrual",
      startPeriod: QBO_OB_LIVE_AS_OF,
      endPeriod: QBO_OB_LIVE_AS_OF,
      currency: "USD",
      skippedRowCount: 0,
      lines: [
        { qbo_account_id: "35", account_name: "Checking", balance_cents: "10000" },
        { qbo_account_id: "47", account_name: "A/P", balance_cents: "10000" },
      ],
    };

    const result = assembleQboObJePreviewFromMappedBs({
      operatingCompanyId: OPCO,
      balanceSheet,
      accountMapping: mapping([checkingMapped, apMapped]),
    });

    expect(result.unbalanced).toBe(false);
    expect(result.is_balanced).toBe(true);
    expect(result.ready_to_post).toBe(true);
    expect(result.obe_plug_applied_cents).toBeNull();
    expect(result.je_preview?.entry_date).toBe(QBO_OB_LIVE_ENTRY_DATE);
    expect(result.je_preview?.source).toBe("manual");
    expect(result.total_debits_cents).toBe(10000);
    expect(result.total_credits_cents).toBe(10000);
    expect(result.je_preview?.postings).toHaveLength(2);
    expect(result.je_preview?.postings.every((p) => !p.is_obe_plug)).toBe(true);
  });

  it("imbalance with OBE mapped => applies OBE plug and balances (cite cutover §3)", () => {
    // Asset 150, Liability 100 → need Equity credit plug 50 via OBE
    const balanceSheet: QboObLiveBalanceSheet = {
      reportBasis: "Accrual",
      startPeriod: QBO_OB_LIVE_AS_OF,
      endPeriod: QBO_OB_LIVE_AS_OF,
      currency: "USD",
      skippedRowCount: 0,
      lines: [
        { qbo_account_id: "35", account_name: "Checking", balance_cents: "15000" },
        { qbo_account_id: "47", account_name: "A/P", balance_cents: "10000" },
        { qbo_account_id: "300", account_name: QBO_OB_OBE_ACCOUNT_LABEL, balance_cents: "0" },
      ],
    };

    const result = assembleQboObJePreviewFromMappedBs({
      operatingCompanyId: OPCO,
      balanceSheet,
      accountMapping: mapping([checkingMapped, apMapped, obeMapped]),
    });

    expect(result.is_balanced).toBe(true);
    expect(result.unbalanced).toBe(false);
    expect(result.ready_to_post).toBe(true);
    expect(result.obe_plug_applied_cents).toBe(5000);
    const plug = result.je_preview?.postings.find((p) => p.is_obe_plug);
    expect(plug).toBeDefined();
    expect(plug!.account_id).toBe(OBE_CATALOG_ID);
    expect(plug!.debit_or_credit).toBe("credit");
    expect(plug!.amount_cents).toBe(5000);
    expect(plug!.qbo_account_id).toBe("300");
    expect(plug!.is_obe_plug).toBe(true);
    expect(plug!.description).toContain("Opening Balance Equity plug");
    expect(result.total_debits_cents).toBe(result.total_credits_cents);
  });

  it("imbalance without OBE mapped => unbalanced + obe_plug_unmapped (never invent account)", () => {
    const balanceSheet: QboObLiveBalanceSheet = {
      reportBasis: "Accrual",
      startPeriod: QBO_OB_LIVE_AS_OF,
      endPeriod: QBO_OB_LIVE_AS_OF,
      currency: "USD",
      skippedRowCount: 0,
      lines: [
        { qbo_account_id: "35", account_name: "Checking", balance_cents: "15000" },
        { qbo_account_id: "47", account_name: "A/P", balance_cents: "10000" },
      ],
    };

    const result = assembleQboObJePreviewFromMappedBs({
      operatingCompanyId: OPCO,
      balanceSheet,
      accountMapping: mapping([checkingMapped, apMapped]),
    });

    expect(result.je_preview).toBeNull();
    expect(result.is_balanced).toBe(false);
    expect(result.unbalanced).toBe(true);
    expect(result.ready_to_post).toBe(false);
    expect(result.refuse_reason).toBe("obe_plug_unmapped");
    expect(result.obe_plug_applied_cents).toBeNull();
  });

  it("unmapped BS line => refuse balanced even if other lines would balance", () => {
    const balanceSheet: QboObLiveBalanceSheet = {
      reportBasis: "Accrual",
      startPeriod: QBO_OB_LIVE_AS_OF,
      endPeriod: QBO_OB_LIVE_AS_OF,
      currency: "USD",
      skippedRowCount: 0,
      lines: [
        { qbo_account_id: "35", account_name: "Checking", balance_cents: "10000" },
        { qbo_account_id: "47", account_name: "A/P", balance_cents: "10000" },
        { qbo_account_id: "99", account_name: "Mystery", balance_cents: "0" },
      ],
    };
    const accountMapping: QboObAccountMapping = {
      strategy: QBO_OB_ACCOUNT_MAP_STRATEGY,
      mapped: [checkingMapped, apMapped],
      unmapped: [
        {
          qbo_account_id: "99",
          report_account_name: "Mystery",
          reason: "no_mdata_mirror",
          mdata_qbo_accounts_id: null,
          mdata_name: null,
        },
      ],
      counts: { unique_qbo_account_ids: 3, mapped: 2, unmapped: 1 },
    };

    const result = assembleQboObJePreviewFromMappedBs({
      operatingCompanyId: OPCO,
      balanceSheet,
      accountMapping,
    });

    expect(result.je_preview).toBeNull();
    expect(result.unbalanced).toBe(true);
    expect(result.refuse_reason).toBe("unmapped_remain");
    expect(result.bs_unmapped).toHaveLength(1);
  });

  it("non-BS catalogs account_type on BS line => refuse (no invented signed-actual rule)", () => {
    const incomeMapped = {
      ...checkingMapped,
      catalogs_account_type: "Income",
      catalogs_account_name: "Sales",
    };
    const balanceSheet: QboObLiveBalanceSheet = {
      reportBasis: "Accrual",
      startPeriod: QBO_OB_LIVE_AS_OF,
      endPeriod: QBO_OB_LIVE_AS_OF,
      currency: "USD",
      skippedRowCount: 0,
      lines: [{ qbo_account_id: "35", account_name: "Sales", balance_cents: "10000" }],
    };

    const result = assembleQboObJePreviewFromMappedBs({
      operatingCompanyId: OPCO,
      balanceSheet,
      accountMapping: mapping([incomeMapped]),
    });

    expect(result.je_preview).toBeNull();
    expect(result.refuse_reason).toBe("non_bs_account_type");
    expect(result.unbalanced).toBe(true);
  });
});
