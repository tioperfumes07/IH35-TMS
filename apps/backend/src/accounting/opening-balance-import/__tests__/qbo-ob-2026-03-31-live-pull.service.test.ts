import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QboApiContext, QboReportResponse } from "../../../integrations/qbo/qbo-client.js";
import {
  pullQboOb20260331LivePreview,
  QBO_OB_LIVE_AS_OF,
  QBO_OB_LIVE_ACCOUNTING_METHOD,
} from "../qbo-ob-2026-03-31-live-pull.service.js";

const { mockIsEnabled } = vi.hoisted(() => ({ mockIsEnabled: vi.fn() }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const REALM = "123145885549599";

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
    ],
  },
};

function client() {
  return { query: vi.fn(async () => ({ rows: [] })) };
}

describe("pullQboOb20260331LivePreview", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
  });

  it("flag OFF => flag_off empty response, never calls QBO", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const qboCompanyContext = vi.fn();
    const qboReport = vi.fn();

    const result = await pullQboOb20260331LivePreview(client() as never, OPCO, {
      qboCompanyContext,
      qboReport,
    });

    expect(result).toEqual({
      flag_off: true,
      realm_id: "",
      as_of: QBO_OB_LIVE_AS_OF,
      balance_sheet: null,
      trial_balance: null,
      pulled_at: null,
    });
    expect(qboCompanyContext).not.toHaveBeenCalled();
    expect(qboReport).not.toHaveBeenCalled();
  });

  it("flag ON => pulls BalanceSheet + TrialBalance Accrual as_of 2026-03-31 and parses", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const qboCompanyContext = vi.fn(async () => CTX);
    const qboReport = vi.fn(async (_ctx: QboApiContext, reportName: string) => {
      if (reportName === "BalanceSheet") return BS_RAW;
      if (reportName === "TrialBalance") return TB_RAW;
      throw new Error(`unexpected report ${reportName}`);
    });

    const result = await pullQboOb20260331LivePreview(client() as never, OPCO, {
      qboCompanyContext,
      qboReport,
    });

    expect(result.flag_off).toBe(false);
    expect(result.realm_id).toBe(REALM);
    expect(result.as_of).toBe("2026-03-31");
    expect(result.pulled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.balance_sheet?.lines).toEqual([
      { qbo_account_id: "35", account_name: "Checking", balance_cents: "135055" },
    ]);
    expect(result.trial_balance?.lines).toEqual([
      {
        qbo_account_id: "35",
        account_name: "Checking",
        debit_cents: "135055",
        credit_cents: "0",
      },
    ]);

    expect(qboCompanyContext).toHaveBeenCalledWith(OPCO);
    expect(qboReport).toHaveBeenCalledTimes(2);
    expect(qboReport).toHaveBeenCalledWith(CTX, "BalanceSheet", {
      start_date: "2026-03-31",
      end_date: "2026-03-31",
      accounting_method: QBO_OB_LIVE_ACCOUNTING_METHOD,
    });
    expect(qboReport).toHaveBeenCalledWith(CTX, "TrialBalance", {
      start_date: "2026-03-31",
      end_date: "2026-03-31",
      accounting_method: QBO_OB_LIVE_ACCOUNTING_METHOD,
    });
  });

  it("never imports journal-entry writers (preview-only contract)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serviceSrc = fs.readFileSync(path.join(here, "../qbo-ob-2026-03-31-live-pull.service.ts"), "utf8");
    const routesSrc = fs.readFileSync(path.join(here, "../qbo-ob-2026-03-31-live-pull.routes.ts"), "utf8");
    // Forbid import/call sites; file-header comments may name the forbidden API.
    expect(serviceSrc).not.toMatch(/import\s+.*createJournalEntry|from\s+["'][^"']*journal-entr/);
    expect(routesSrc).not.toMatch(/import\s+.*createJournalEntry|from\s+["'][^"']*journal-entr/);
    expect(serviceSrc).not.toMatch(/\bcreateJournalEntry\s*\(/);
    expect(routesSrc).not.toMatch(/\bcreateJournalEntry\s*\(/);
  });
});
