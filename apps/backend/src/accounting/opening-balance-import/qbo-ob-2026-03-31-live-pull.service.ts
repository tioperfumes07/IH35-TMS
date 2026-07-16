// HOLD — QBO live OB preview pull as_of 2026-03-31 (BUILD-AND-HOLD, financial cluster, §1.4).
//
// READ-ONLY: fetches QBO BalanceSheet + TrialBalance for one operating company via the existing
// qboCompanyContext / qboReport client, parses with parseBalanceSheet / parseTrialBalance, then
// maps leaf QBO account ids → TMS via mdata.qbo_accounts.qbo_id = catalogs.accounts.qbo_account_id
// (entity-scoped). NEVER calls createJournalEntry, never writes to accounting.* GL tables, never
// invents mappings for unmapped lines. Owner/CPA review only — JE assemble/post is a later HOLD PR.
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

/** Canonical join used by chart-of-accounts-reconciler — do not invent alternate keys. */
export const QBO_OB_ACCOUNT_MAP_STRATEGY =
  "mdata.qbo_accounts.qbo_id = catalogs.accounts.qbo_account_id (operating_company_id scoped)" as const;

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

export type QboObAccountMapReason = "no_mdata_mirror" | "no_catalogs_account";

export type QboObMappedAccount = {
  qbo_account_id: string;
  report_account_name: string;
  mdata_qbo_accounts_id: string;
  mdata_name: string | null;
  catalogs_account_id: string;
  catalogs_account_number: string | null;
  catalogs_account_name: string | null;
};

export type QboObUnmappedAccount = {
  qbo_account_id: string;
  report_account_name: string;
  reason: QboObAccountMapReason;
  mdata_qbo_accounts_id: string | null;
  mdata_name: string | null;
};

export type QboObAccountMapping = {
  strategy: typeof QBO_OB_ACCOUNT_MAP_STRATEGY;
  mapped: QboObMappedAccount[];
  unmapped: QboObUnmappedAccount[];
  counts: {
    unique_qbo_account_ids: number;
    mapped: number;
    unmapped: number;
  };
};

export type QboOb20260331LivePreview = {
  realm_id: string;
  as_of: string;
  balance_sheet: QboObLiveBalanceSheet | null;
  trial_balance: QboObLiveTrialBalance | null;
  /** Null when flag OFF; otherwise id-based map (never guessed). */
  account_mapping: QboObAccountMapping | null;
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

type ReportLineRef = { qbo_account_id: string; account_name: string };

type MirrorJoinRow = {
  qbo_account_id: string;
  mdata_qbo_accounts_id: string | null;
  mdata_name: string | null;
  catalogs_account_id: string | null;
  catalogs_account_number: string | null;
  catalogs_account_name: string | null;
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

function collectUniqueReportAccounts(
  balanceSheet: QboObLiveBalanceSheet,
  trialBalance: QboObLiveTrialBalance
): ReportLineRef[] {
  const byId = new Map<string, string>();
  for (const line of [...balanceSheet.lines, ...trialBalance.lines]) {
    const id = String(line.qbo_account_id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, String(line.account_name ?? ""));
  }
  return [...byId.entries()].map(([qbo_account_id, account_name]) => ({
    qbo_account_id,
    account_name,
  }));
}

/**
 * Map report leaf QBO ids → TMS catalogs.accounts via canonical mdata mirror.
 * Unmapped lines are surfaced with an explicit reason — never invented.
 */
export async function mapQboObAccountsViaMdata(
  client: DbClient,
  operatingCompanyId: string,
  reportAccounts: ReportLineRef[]
): Promise<QboObAccountMapping> {
  if (reportAccounts.length === 0) {
    return {
      strategy: QBO_OB_ACCOUNT_MAP_STRATEGY,
      mapped: [],
      unmapped: [],
      counts: { unique_qbo_account_ids: 0, mapped: 0, unmapped: 0 },
    };
  }

  const qboIds = reportAccounts.map((a) => a.qbo_account_id);
  const res = await client.query<MirrorJoinRow>(
    `
      SELECT
        qa.qbo_id::text AS qbo_account_id,
        qa.id::text AS mdata_qbo_accounts_id,
        qa.name AS mdata_name,
        ca.id::text AS catalogs_account_id,
        ca.account_number AS catalogs_account_number,
        ca.account_name AS catalogs_account_name
      FROM mdata.qbo_accounts qa
      LEFT JOIN catalogs.accounts ca
        ON ca.qbo_account_id = qa.qbo_id
       AND ca.operating_company_id = qa.operating_company_id
       AND ca.deactivated_at IS NULL
      WHERE qa.operating_company_id = $1::uuid
        AND qa.qbo_id = ANY($2::text[])
    `,
    [operatingCompanyId, qboIds]
  );

  const byQboId = new Map<string, MirrorJoinRow>();
  for (const row of res.rows) {
    const id = String(row.qbo_account_id ?? "").trim();
    if (!id) continue;
    // Prefer first active catalogs hit; query already filters deactivated_at IS NULL.
    if (!byQboId.has(id)) byQboId.set(id, row);
  }

  const mapped: QboObMappedAccount[] = [];
  const unmapped: QboObUnmappedAccount[] = [];

  for (const ref of reportAccounts) {
    const join = byQboId.get(ref.qbo_account_id);
    if (!join?.mdata_qbo_accounts_id) {
      unmapped.push({
        qbo_account_id: ref.qbo_account_id,
        report_account_name: ref.account_name,
        reason: "no_mdata_mirror",
        mdata_qbo_accounts_id: null,
        mdata_name: null,
      });
      continue;
    }
    if (!join.catalogs_account_id) {
      unmapped.push({
        qbo_account_id: ref.qbo_account_id,
        report_account_name: ref.account_name,
        reason: "no_catalogs_account",
        mdata_qbo_accounts_id: join.mdata_qbo_accounts_id,
        mdata_name: join.mdata_name,
      });
      continue;
    }
    mapped.push({
      qbo_account_id: ref.qbo_account_id,
      report_account_name: ref.account_name,
      mdata_qbo_accounts_id: join.mdata_qbo_accounts_id,
      mdata_name: join.mdata_name,
      catalogs_account_id: join.catalogs_account_id,
      catalogs_account_number: join.catalogs_account_number,
      catalogs_account_name: join.catalogs_account_name,
    });
  }

  return {
    strategy: QBO_OB_ACCOUNT_MAP_STRATEGY,
    mapped,
    unmapped,
    counts: {
      unique_qbo_account_ids: reportAccounts.length,
      mapped: mapped.length,
      unmapped: unmapped.length,
    },
  };
}

const reportParams: Record<string, string> = {
  start_date: QBO_OB_LIVE_AS_OF,
  end_date: QBO_OB_LIVE_AS_OF,
  accounting_method: QBO_OB_LIVE_ACCOUNTING_METHOD,
};

/**
 * Live QBO BS + TB preview for opening-balance ceremony as_of 2026-03-31 Accrual.
 * Flag OFF → empty payload (no QBO call). Flag ON → pull + parse + mdata map; no GL write.
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
      account_mapping: null,
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
  const account_mapping = await mapQboObAccountsViaMdata(
    client,
    operatingCompanyId,
    collectUniqueReportAccounts(balance_sheet, trial_balance)
  );

  return {
    flag_off: false,
    realm_id: ctx.realmId,
    as_of: QBO_OB_LIVE_AS_OF,
    balance_sheet,
    trial_balance,
    account_mapping,
    pulled_at: new Date().toISOString(),
  };
}
