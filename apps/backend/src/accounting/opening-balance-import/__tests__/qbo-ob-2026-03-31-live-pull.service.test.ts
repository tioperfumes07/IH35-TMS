import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QboApiContext, QboReportResponse } from "../../../integrations/qbo/qbo-client.js";
import {
  pullQboOb20260331LivePreview,
  mapQboObAccountsViaMdata,
  QBO_OB_LIVE_AS_OF,
  QBO_OB_LIVE_ACCOUNTING_METHOD,
  QBO_OB_ACCOUNT_MAP_STRATEGY,
} from "../qbo-ob-2026-03-31-live-pull.service.js";

const { mockIsEnabled } = vi.hoisted(() => ({ mockIsEnabled: vi.fn() }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const REALM = "123145885549599";
const MDATA_ID = "22222222-2222-4222-8222-222222222222";
const CATALOG_ID = "33333333-3333-4333-8333-333333333333";

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
      pulled_at: null,
    });
    expect(qboCompanyContext).not.toHaveBeenCalled();
    expect(qboReport).not.toHaveBeenCalled();
  });

  it("flag ON => pulls BS+TB and maps via mdata.qbo_accounts (unmapped surfaced)", async () => {
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
      },
    ]);
    expect(result.account_mapping?.unmapped).toEqual([
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
