// HOLD — QBO live OB preview pull as_of 2026-03-31 (BUILD-AND-HOLD, financial cluster, §1.4).
//
// READ-ONLY: fetches QBO BalanceSheet + TrialBalance for one operating company via the existing
// qboCompanyContext / qboReport client, parses with parseBalanceSheet / parseTrialBalance, then
// maps leaf QBO account ids → TMS via mdata.qbo_accounts.qbo_id = catalogs.accounts.qbo_account_id
// (entity-scoped), then assembles a REVIEWABLE balanced preview JE from mapped BS lines
// (signed-actual). NEVER calls createJournalEntry, never writes to accounting.* GL tables, never
// invents mappings for unmapped lines. Owner/CPA still posts by hand.
//
// Behind OPENING_BALANCE_IMPORT_ENABLED (same flag as the static 12/31 preview; default OFF).
// Locked as_of: 2026-03-31 Accrual (docs/lockdown/00_LOCKED_DECISIONS.md §8.9).
//
// OBE plug (cite, do not invent): docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md §3 —
// "Opening Balance Equity is the plug, mirroring QBO". Resolved only via existing account_mapping
// (name match). Retained-Earnings clearing is a *later* OBE→RE reclass
// (docs/specs/ACCOUNTING-ARCHITECTURE.md §4; permanent OBE ≈ 0) — NOT part of this opening JE.

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
import {
  OPENING_BALANCE_IMPORT_FLAG,
  signedCentsToDebitCredit,
} from "./opening-balance-import.service.js";

export const QBO_OB_LIVE_AS_OF = "2026-03-31";
export const QBO_OB_LIVE_ENTRY_DATE = "2026-03-31";
export const QBO_OB_LIVE_ACCOUNTING_METHOD = "Accrual" as const;
/** Canonical plug account label — must resolve via mapping; never invent a catalogs UUID. */
export const QBO_OB_OBE_ACCOUNT_LABEL = "Opening Balance Equity";

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
  /** catalogs.accounts.account_type — needed for signed-actual Dr/Cr on BS lines. */
  catalogs_account_type: string | null;
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

export type QboObJePreviewPosting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
  qbo_account_id: string | null;
  /** true when this line is the architecture OBE balancing plug (not a QBO BS leaf amount). */
  is_obe_plug?: boolean;
};

export type QboObJePreview = {
  operating_company_id: string;
  entry_date: string;
  memo: string;
  source: "manual";
  postings: QboObJePreviewPosting[];
};

export type QboObJeAssembleReason =
  | "unmapped_remain"
  | "non_bs_account_type"
  | "obe_plug_unmapped"
  | "empty_postings"
  | "cents_overflow";

/**
 * Preview JE assembly from mapped Balance Sheet lines.
 * RE clearing (OBE→Retained Earnings) is intentionally absent — later reclass per architecture.
 */
export type QboObJeAssembleResult = {
  je_preview: QboObJePreview | null;
  total_debits_cents: number;
  total_credits_cents: number;
  is_balanced: boolean;
  /** Explicit inverse of is_balanced when unmapped or plug cannot resolve — never claim balanced. */
  unbalanced: boolean;
  ready_to_post: boolean;
  obe_plug_applied_cents: number | null;
  refuse_reason: QboObJeAssembleReason | null;
  /** BS leaf lines that failed mapping (subset of account_mapping.unmapped). */
  bs_unmapped: QboObUnmappedAccount[];
};

export type QboOb20260331LivePreview = {
  realm_id: string;
  as_of: string;
  balance_sheet: QboObLiveBalanceSheet | null;
  trial_balance: QboObLiveTrialBalance | null;
  /** Null when flag OFF; otherwise id-based map (never guessed). */
  account_mapping: QboObAccountMapping | null;
  /** Null when flag OFF; otherwise assemble result (never posts). */
  je_assemble: QboObJeAssembleResult | null;
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
  catalogs_account_type: string | null;
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isObeAccountLabel(...labels: Array<string | null | undefined>): boolean {
  const target = normalizeLabel(QBO_OB_OBE_ACCOUNT_LABEL);
  return labels.some((l) => l != null && normalizeLabel(l) === target);
}

function centsStringToSafeNumber(cents: string): number | null {
  try {
    const n = BigInt(cents);
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) return null;
    return Number(n);
  } catch {
    return null;
  }
}

function toBsSignedType(
  accountType: string | null
): "Asset" | "Liability" | "Equity" | null {
  if (accountType === "Asset" || accountType === "Liability" || accountType === "Equity") {
    return accountType;
  }
  return null;
}

/**
 * Assemble a balanced preview JE from mapped Balance Sheet leaf lines (signed-actual).
 * Unmapped BS lines → refuse balanced. Imbalance with all mapped → OBE plug if OBE is mapped;
 * otherwise refuse (never invent OBE UUID). No RE clearing line (later reclass).
 */
export function assembleQboObJePreviewFromMappedBs(args: {
  operatingCompanyId: string;
  balanceSheet: QboObLiveBalanceSheet;
  accountMapping: QboObAccountMapping;
}): QboObJeAssembleResult {
  const { operatingCompanyId, balanceSheet, accountMapping } = args;
  const mappedByQboId = new Map(accountMapping.mapped.map((m) => [m.qbo_account_id, m]));
  const unmappedByQboId = new Map(accountMapping.unmapped.map((u) => [u.qbo_account_id, u]));

  const bs_unmapped: QboObUnmappedAccount[] = [];
  const memo = `Opening balance — as of ${QBO_OB_LIVE_AS_OF} (QBO Balance Sheet Accrual, signed-actual)`;
  const postings: QboObJePreviewPosting[] = [];

  for (const line of balanceSheet.lines) {
    const qboId = String(line.qbo_account_id ?? "").trim();
    if (!qboId) continue;

    const mapped = mappedByQboId.get(qboId);
    if (!mapped) {
      const u = unmappedByQboId.get(qboId);
      bs_unmapped.push(
        u ?? {
          qbo_account_id: qboId,
          report_account_name: line.account_name,
          reason: "no_mdata_mirror",
          mdata_qbo_accounts_id: null,
          mdata_name: null,
        }
      );
      continue;
    }

    const amountCents = centsStringToSafeNumber(line.balance_cents);
    if (amountCents === null) {
      return {
        je_preview: null,
        total_debits_cents: 0,
        total_credits_cents: 0,
        is_balanced: false,
        unbalanced: true,
        ready_to_post: false,
        obe_plug_applied_cents: null,
        refuse_reason: "cents_overflow",
        bs_unmapped,
      };
    }

    const bsType = toBsSignedType(mapped.catalogs_account_type);
    if (!bsType) {
      return {
        je_preview: null,
        total_debits_cents: 0,
        total_credits_cents: 0,
        is_balanced: false,
        unbalanced: true,
        ready_to_post: false,
        obe_plug_applied_cents: null,
        refuse_reason: "non_bs_account_type",
        bs_unmapped,
      };
    }

    const dc = signedCentsToDebitCredit(bsType, amountCents);
    if (!dc) continue; // zero — nothing to post

    postings.push({
      account_id: mapped.catalogs_account_id,
      debit_or_credit: dc.debit_or_credit,
      amount_cents: dc.amount_cents,
      description: `${memo} — ${mapped.catalogs_account_name ?? mapped.report_account_name}`,
      qbo_account_id: qboId,
    });
  }

  if (bs_unmapped.length > 0) {
    const totalDebits = postings
      .filter((p) => p.debit_or_credit === "debit")
      .reduce((s, p) => s + p.amount_cents, 0);
    const totalCredits = postings
      .filter((p) => p.debit_or_credit === "credit")
      .reduce((s, p) => s + p.amount_cents, 0);
    return {
      je_preview: null,
      total_debits_cents: totalDebits,
      total_credits_cents: totalCredits,
      is_balanced: false,
      unbalanced: true,
      ready_to_post: false,
      obe_plug_applied_cents: null,
      refuse_reason: "unmapped_remain",
      bs_unmapped,
    };
  }

  let totalDebits = postings
    .filter((p) => p.debit_or_credit === "debit")
    .reduce((s, p) => s + p.amount_cents, 0);
  let totalCredits = postings
    .filter((p) => p.debit_or_credit === "credit")
    .reduce((s, p) => s + p.amount_cents, 0);

  let obe_plug_applied_cents: number | null = null;

  if (totalDebits !== totalCredits) {
    const plugAbs = Math.abs(totalDebits - totalCredits);
    const obeMapped = accountMapping.mapped.find((m) =>
      isObeAccountLabel(m.catalogs_account_name, m.mdata_name, m.report_account_name)
    );
    if (!obeMapped) {
      return {
        je_preview: null,
        total_debits_cents: totalDebits,
        total_credits_cents: totalCredits,
        is_balanced: false,
        unbalanced: true,
        ready_to_post: false,
        obe_plug_applied_cents: null,
        refuse_reason: "obe_plug_unmapped",
        bs_unmapped,
      };
    }
    // Debits short → credit OBE; credits short → debit OBE (equity plug).
    const plugSide: "debit" | "credit" = totalDebits > totalCredits ? "credit" : "debit";
    postings.push({
      account_id: obeMapped.catalogs_account_id,
      debit_or_credit: plugSide,
      amount_cents: plugAbs,
      description: `${memo} — ${QBO_OB_OBE_ACCOUNT_LABEL} plug (balancing)`,
      qbo_account_id: obeMapped.qbo_account_id,
      is_obe_plug: true,
    });
    obe_plug_applied_cents = plugAbs;
    if (plugSide === "debit") totalDebits += plugAbs;
    else totalCredits += plugAbs;
  }

  const is_balanced = totalDebits === totalCredits && totalDebits > 0;
  if (!is_balanced) {
    return {
      je_preview: null,
      total_debits_cents: totalDebits,
      total_credits_cents: totalCredits,
      is_balanced: false,
      unbalanced: true,
      ready_to_post: false,
      obe_plug_applied_cents,
      refuse_reason: totalDebits === 0 && totalCredits === 0 ? "empty_postings" : "obe_plug_unmapped",
      bs_unmapped,
    };
  }

  return {
    je_preview: {
      operating_company_id: operatingCompanyId,
      entry_date: QBO_OB_LIVE_ENTRY_DATE,
      memo,
      source: "manual",
      postings,
    },
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    is_balanced: true,
    unbalanced: false,
    ready_to_post: true,
    obe_plug_applied_cents,
    refuse_reason: null,
    bs_unmapped,
  };
}

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
        ca.account_name AS catalogs_account_name,
        ca.account_type AS catalogs_account_type
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
      catalogs_account_type: join.catalogs_account_type,
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
 * Flag OFF → empty payload (no QBO call). Flag ON → pull + parse + mdata map + JE preview assemble;
 * no GL write / no createJournalEntry.
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
      je_assemble: null,
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
  const je_assemble = assembleQboObJePreviewFromMappedBs({
    operatingCompanyId,
    balanceSheet: balance_sheet,
    accountMapping: account_mapping,
  });

  return {
    flag_off: false,
    realm_id: ctx.realmId,
    as_of: QBO_OB_LIVE_AS_OF,
    balance_sheet,
    trial_balance,
    account_mapping,
    je_assemble,
    pulled_at: new Date().toISOString(),
  };
}
