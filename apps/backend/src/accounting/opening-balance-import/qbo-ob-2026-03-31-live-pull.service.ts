// HOLD — QBO live OB preview pull as_of 2026-03-31 (BUILD-AND-HOLD, financial cluster, §1.4).
//
// READ-ONLY: fetches QBO BalanceSheet + TrialBalance for one operating company via the existing
// qboCompanyContext / qboReport client, parses with parseBalanceSheet / parseTrialBalance, and returns
// a reviewable JSON preview. NEVER calls createJournalEntry, never writes to accounting.* GL tables,
// never maps lines to catalogs.accounts. Owner/CPA review only — post is a separate HOLD PR.
//
// Behind OPENING_BALANCE_IMPORT_ENABLED (same flag as the static 12/31 preview; default OFF).
// Locked as_of: 2026-03-31 Accrual (docs/lockdown/00_LOCKED_DECISIONS.md §8.9).

import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  qboCompanyContext,
  qboReport,
  type QboApiContext,
  type QboReportResponse,
} from "../../integrations/qbo/qbo-client.js";
import {
  parseBalanceSheet,
  parseTrialBalance,
  type ParsedBalanceSheet,
  type ParsedTrialBalance,
} from "../../integrations/qbo/qbo-report-parser.js";
import { OPENING_BALANCE_IMPORT_FLAG } from "./opening-balance-import.service.js";

export const QBO_OB_LIVE_AS_OF = "2026-03-31";
export const QBO_OB_LIVE_ACCOUNTING_METHOD = "Accrual" as const;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** JSON-safe BS (bigint cents → decimal string). */
export type QboObLiveBalanceSheet = Omit<ParsedBalanceSheet, "lines"> & {
  lines: Array<{
    qbo_account_id: string;
    account_name: string;
    balance_cents: string;
  }>;
};

/** JSON-safe TB (bigint cents → decimal string). */
export type QboObLiveTrialBalance = Omit<ParsedTrialBalance, "lines"> & {
  lines: Array<{
    qbo_account_id: string;
    account_name: string;
    debit_cents: string;
    credit_cents: string;
  }>;
};

export type QboOb20260331LivePreview = {
  realm_id: string;
  as_of: string;
  balance_sheet: QboObLiveBalanceSheet | null;
  trial_balance: QboObLiveTrialBalance | null;
  pulled_at: string | null;
  flag_off: boolean;
};

export type QboObLivePullDeps = {
  qboCompanyContext?: (operatingCompanyId: string) => Promise<QboApiContext>;
  qboReport?: (
    ctx: QboApiContext,
    reportName: string,
    params?: Record<string, string>
  ) => Promise<QboReportResponse>;
};

function serializeBalanceSheet(parsed: ParsedBalanceSheet): QboObLiveBalanceSheet {
  return {
    reportBasis: parsed.reportBasis,
    startPeriod: parsed.startPeriod,
    endPeriod: parsed.endPeriod,
    currency: parsed.currency,
    skippedRowCount: parsed.skippedRowCount,
    lines: parsed.lines.map((l) => ({
      qbo_account_id: l.qbo_account_id,
      account_name: l.account_name,
      balance_cents: l.balance_cents.toString(),
    })),
  };
}

function serializeTrialBalance(parsed: ParsedTrialBalance): QboObLiveTrialBalance {
  return {
    reportBasis: parsed.reportBasis,
    startPeriod: parsed.startPeriod,
    endPeriod: parsed.endPeriod,
    currency: parsed.currency,
    skippedRowCount: parsed.skippedRowCount,
    lines: parsed.lines.map((l) => ({
      qbo_account_id: l.qbo_account_id,
      account_name: l.account_name,
      debit_cents: l.debit_cents.toString(),
      credit_cents: l.credit_cents.toString(),
    })),
  };
}

const reportParams: Record<string, string> = {
  start_date: QBO_OB_LIVE_AS_OF,
  end_date: QBO_OB_LIVE_AS_OF,
  accounting_method: QBO_OB_LIVE_ACCOUNTING_METHOD,
};

/**
 * Live QBO BS + TB preview for opening-balance ceremony as_of 2026-03-31 Accrual.
 * Flag OFF → empty payload (no QBO call). Flag ON → pull + parse only; no GL write.
 */
export async function pullQboOb20260331LivePreview(
  client: DbClient,
  operatingCompanyId: string,
  deps: QboObLivePullDeps = {}
): Promise<QboOb20260331LivePreview> {
  const flagOn = await isEnabled(client as never, OPENING_BALANCE_IMPORT_FLAG, {
    operating_company_id: operatingCompanyId,
  });

  if (!flagOn) {
    return {
      flag_off: true,
      realm_id: "",
      as_of: QBO_OB_LIVE_AS_OF,
      balance_sheet: null,
      trial_balance: null,
      pulled_at: null,
    };
  }

  const getCtx = deps.qboCompanyContext ?? qboCompanyContext;
  const getReport = deps.qboReport ?? qboReport;

  const ctx = await getCtx(operatingCompanyId);
  const [bsRaw, tbRaw] = await Promise.all([
    getReport(ctx, "BalanceSheet", reportParams),
    getReport(ctx, "TrialBalance", reportParams),
  ]);

  const balance_sheet = serializeBalanceSheet(parseBalanceSheet(bsRaw));
  const trial_balance = serializeTrialBalance(parseTrialBalance(tbRaw));

  return {
    flag_off: false,
    realm_id: ctx.realmId,
    as_of: QBO_OB_LIVE_AS_OF,
    balance_sheet,
    trial_balance,
    pulled_at: new Date().toISOString(),
  };
}
