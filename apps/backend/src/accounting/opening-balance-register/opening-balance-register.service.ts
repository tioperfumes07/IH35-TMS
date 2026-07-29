// OB-01 — Opening Balance Register: import → staging → owner review → data-gated commit.
//
// WHY THIS EXISTS: catalogs.accounts has carried opening_balance_cents / opening_balance_as_of for
// months, and on prod (2026-07-28) every one of the 1,233 active accounts across TRANSP/TRK/USMCA
// has a NULL/zero opening balance and no as-of date. The two opening-balance code paths that exist
// (opening-balance-import.service.ts, qbo-ob-2026-03-31-live-pull.service.ts) are read-only previews
// that assemble a JE and stop — nothing can persist a reviewed balance, nothing audits who changed
// one, and nothing can refuse the write while the QBO source period is still being cleaned up.
//
// GL MATH: none is written here. Debit/credit derivation reuses signedCentsToDebitCredit from
// opening-balance-import.service.ts (the CPA-locked signed-actual convention). QBO account mapping
// reuses mapQboObAccountsViaMdata from qbo-ob-2026-03-31-live-pull.service.ts. This module assembles
// a JE PREVIEW only — it never calls createJournalEntry and writes nothing to accounting.journal_*.
//
// PARALLEL BOOKS: QBO is read-only. This module issues QBO *report* GETs and nothing else. There is
// no write-back of any kind, and no posting flag is read or flipped.
//
// THE DATA GATE (the control this block is really about): committing opening balances writes
// catalogs.accounts and is not something you undo. Importing and staging are safe and may run at any
// time; the commit hard-refuses unless accounting.ob_source_finality says the accountant has marked
// that entity/period's QBO cleanup FINAL. There is no owner override that lets a commit through
// without that flag — a "dry-run" commit is not a thing, it is either final or it is refused.

import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  qboCompanyContext,
  qboReport,
  type QboApiContext,
  type QboReportResponse,
} from "../../integrations/qbo/qbo-client.js";
import { parseBalanceSheet } from "../../integrations/qbo/qbo-report-parser.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  OPENING_BALANCE_IMPORT_FLAG,
  signedCentsToDebitCredit,
} from "./../opening-balance-import/opening-balance-import.service.js";
import { mapQboObAccountsViaMdata } from "./../opening-balance-import/qbo-ob-2026-03-31-live-pull.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Companies are resolved by CODE, never by hardcoded UUID (locked invariant). */
export type ObRegisterImportSource = "qbo" | "manual_only";

export type ObRegisterPeriodSpec = {
  as_of_date: string;
  import_source: ObRegisterImportSource;
  /** Why this entity/date — cited, not invented. */
  basis: string;
};

/**
 * Per-entity opening-balance period.
 *
 * TRANSP 2026-03-31 — the locked cutover basis (docs/lockdown/00_LOCKED_DECISIONS.md §8.9: opening
 *   balances as-of 03/31/2026, cutover 04/01/2026). Same as-of the existing live QBO preview pulls.
 * TRK 2024-12-31 — the balance sheet the TRANSP static importer already transcribes for that entity
 *   (docs/OPENING-BALANCES-TRANSP-2024-12-31.md / transp-2024-12-31-source.ts).
 * USMCA — manual entry only: prod has ZERO rows in integrations.qbo_connections for USMCA
 *   (verified 2026-07-28), so there is no QBO realm to pull from. Refusing the import is the honest
 *   behaviour; the register still accepts hand-entered balances for the same cutover date.
 */
export const OB_REGISTER_PERIODS: Readonly<Record<string, ObRegisterPeriodSpec>> = {
  TRANSP: {
    as_of_date: "2026-03-31",
    import_source: "qbo",
    basis: "Locked cutover basis (00_LOCKED_DECISIONS §8.9) — OB as-of 03/31/2026, cutover 04/01/2026",
  },
  TRK: {
    as_of_date: "2024-12-31",
    import_source: "qbo",
    basis: "QBO 12/31/2024 balance sheet — the entity's opening basis (OPENING-BALANCES-TRANSP-2024-12-31.md)",
  },
  USMCA: {
    as_of_date: "2026-03-31",
    import_source: "manual_only",
    basis: "No QBO connection exists for USMCA — owner-entered opening balances only",
  },
};

export const QBO_OB_ACCOUNTING_METHOD = "Accrual" as const;

/**
 * "OBE nets to ~0" is implemented as EXACTLY zero.
 *
 * Opening Balance Equity is a temporary plug that QuickBooks expects to be reclassed to Retained
 * Earnings before the books are considered clean (docs/specs/ACCOUNTING-ARCHITECTURE.md §4 —
 * permanent OBE ≈ 0). Any non-zero residue means the source period was committed mid-cleanup. A
 * materiality tolerance here would be an invented threshold the owner has never set, so the stricter
 * reading wins: a single cent of residual OBE refuses the commit and names the amount to reclass.
 */
export const OB_OBE_RESIDUAL_TOLERANCE_CENTS = 0;

const OBE_LABELS = ["opening balance equity"];
const RETAINED_EARNINGS_LABELS = ["retained earnings"];

function normalizeLabel(label: string | null | undefined): string {
  return String(label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesAnyLabel(name: string | null | undefined, labels: readonly string[]): boolean {
  const n = normalizeLabel(name);
  return labels.some((l) => normalizeLabel(l) === n);
}

export type ObRegisterLine = {
  id: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  amount_cents: number;
  source: "manual" | "qbo_import";
  source_account_label: string | null;
  qbo_account_id: string | null;
  status: "staged" | "committed" | "superseded";
  note: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  updated_at: string | null;
  /** Live value already on catalogs.accounts — lets the reviewer see what a commit would replace. */
  posted_opening_balance_cents: number | null;
  posted_opening_balance_as_of: string | null;
  debit_or_credit: "debit" | "credit" | null;
};

export type ObRegisterFinality = {
  is_final: boolean;
  as_of_date: string;
  set_by_user_id: string | null;
  set_by_name: string | null;
  set_at: string | null;
  note: string | null;
};

export type ObCommitRefuseReason =
  | "source_not_final"
  | "no_staged_lines"
  | "maker_is_checker"
  | "unbalanced"
  | "obe_not_reclassed"
  | "non_balance_sheet_account_type";

export type ObRegisterTotals = {
  total_debits_cents: number;
  total_credits_cents: number;
  is_balanced: boolean;
  obe_residual_cents: number;
  retained_earnings_cents: number;
  obe_is_reclassed: boolean;
  staged_line_count: number;
  non_zero_line_count: number;
};

export type ObJePreviewPosting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

export type ObRegisterView = {
  operating_company_id: string;
  company_code: string;
  as_of_date: string;
  import_source: ObRegisterImportSource;
  period_basis: string;
  qbo_import_flag_on: boolean;
  qbo_connection_present: boolean;
  finality: ObRegisterFinality;
  lines: ObRegisterLine[];
  totals: ObRegisterTotals;
  /** Assembled from the EXISTING signed-actual helper. Preview only — nothing is ever posted. */
  je_preview: { entry_date: string; memo: string; postings: ObJePreviewPosting[] } | null;
  /** Empty when a commit would be accepted right now. */
  commit_blockers: ObCommitRefuseReason[];
  makers: string[];
};

export class ObRegisterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ObRegisterError";
  }
}

type CompanyRow = { id: string; code: string };

export async function resolveObRegisterPeriod(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ company: CompanyRow; period: ObRegisterPeriodSpec }> {
  const res = await client.query<CompanyRow>(
    `SELECT id::text, code FROM org.companies WHERE id = $1::uuid`,
    [operatingCompanyId]
  );
  const company = res.rows[0];
  if (!company) {
    throw new ObRegisterError("unknown_company", "operating company not found", 404);
  }
  const period = OB_REGISTER_PERIODS[company.code];
  if (!period) {
    throw new ObRegisterError(
      "no_opening_balance_period",
      `no opening-balance period is defined for entity ${company.code}`,
      409,
      { company_code: company.code }
    );
  }
  return { company, period };
}

async function insertAuditEvent(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    asOfDate: string;
    stagingLineId?: string | null;
    accountId?: string | null;
    eventType:
      | "import_staged"
      | "line_edited"
      | "line_created"
      | "finality_set"
      | "commit_refused"
      | "committed";
    actorUserId: string;
    before?: unknown;
    after?: unknown;
    detail?: string;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO accounting.ob_register_audit_events (
        operating_company_id, as_of_date, staging_line_id, account_id,
        event_type, actor_user_id, before_json, after_json, detail
      )
      VALUES ($1::uuid, $2::date, $3::uuid, $4::uuid, $5, $6::uuid, $7::jsonb, $8::jsonb, $9)
    `,
    [
      args.operatingCompanyId,
      args.asOfDate,
      args.stagingLineId ?? null,
      args.accountId ?? null,
      args.eventType,
      args.actorUserId,
      args.before === undefined ? null : JSON.stringify(args.before),
      args.after === undefined ? null : JSON.stringify(args.after),
      args.detail ?? null,
    ]
  );

  // The register's own WORM table is the detailed trail; the spine is where the rest of the system
  // reads audit from, so every register mutation lands in both, in the same transaction.
  await appendCrudAudit(
    client,
    args.actorUserId,
    `accounting.opening_balance_register.${args.eventType}`,
    {
      resource_type: "accounting.ob_register_staging_lines",
      resource_id: args.stagingLineId ?? null,
      operating_company_id: args.operatingCompanyId,
      as_of_date: args.asOfDate,
      account_id: args.accountId ?? null,
      detail: args.detail ?? null,
      after: args.after ?? null,
    },
    args.eventType === "commit_refused" ? "warning" : "info",
    "OB-01-OPENING-BALANCE-REGISTER"
  );
}

type StagedRow = {
  id: string;
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  amount_cents: string | number;
  source: "manual" | "qbo_import";
  source_account_label: string | null;
  qbo_account_id: string | null;
  status: "staged" | "committed" | "superseded";
  note: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  updated_at: string | null;
  posted_opening_balance_cents: string | number | null;
  posted_opening_balance_as_of: string | null;
};

async function loadStagedRows(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string
): Promise<StagedRow[]> {
  const res = await client.query<StagedRow>(
    `
      SELECT
        l.id::text,
        l.account_id::text,
        a.account_number,
        a.account_name,
        a.account_type,
        l.amount_cents,
        l.source,
        l.source_account_label,
        l.qbo_account_id,
        l.status,
        l.note,
        l.created_by_user_id::text,
        l.updated_by_user_id::text,
        l.updated_at,
        a.opening_balance_cents AS posted_opening_balance_cents,
        a.opening_balance_as_of AS posted_opening_balance_as_of
      FROM accounting.ob_register_staging_lines l
      JOIN catalogs.accounts a ON a.id = l.account_id
      WHERE l.operating_company_id = $1::uuid
        AND l.as_of_date = $2::date
        AND l.status = 'staged'
      ORDER BY a.account_number NULLS LAST, a.account_name
    `,
    [operatingCompanyId, asOfDate]
  );
  return res.rows;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

/**
 * Compute totals from staged lines using the EXISTING signed-actual convention. No new GL math:
 * signedCentsToDebitCredit is imported, not reimplemented.
 */
export function computeObTotals(
  lines: Array<{ account_type: string | null; account_name: string; amount_cents: number }>
): ObRegisterTotals & { unsupported_types: string[] } {
  let debits = 0;
  let credits = 0;
  let obeResidual = 0;
  let retainedEarnings = 0;
  let nonZero = 0;
  const unsupported: string[] = [];

  for (const line of lines) {
    if (line.amount_cents !== 0) nonZero += 1;
    if (matchesAnyLabel(line.account_name, OBE_LABELS)) obeResidual += line.amount_cents;
    if (matchesAnyLabel(line.account_name, RETAINED_EARNINGS_LABELS)) retainedEarnings += line.amount_cents;

    const type = line.account_type;
    if (type !== "Asset" && type !== "Liability" && type !== "Equity") {
      if (line.amount_cents !== 0) unsupported.push(line.account_name);
      continue;
    }
    const dc = signedCentsToDebitCredit(type, line.amount_cents);
    if (!dc) continue;
    if (dc.debit_or_credit === "debit") debits += dc.amount_cents;
    else credits += dc.amount_cents;
  }

  return {
    total_debits_cents: debits,
    total_credits_cents: credits,
    is_balanced: debits === credits && debits > 0,
    obe_residual_cents: obeResidual,
    retained_earnings_cents: retainedEarnings,
    obe_is_reclassed: Math.abs(obeResidual) <= OB_OBE_RESIDUAL_TOLERANCE_CENTS,
    staged_line_count: lines.length,
    non_zero_line_count: nonZero,
    unsupported_types: unsupported,
  };
}

/**
 * Every reason a commit would be refused, in the order a reviewer should fix them.
 * `source_not_final` is first because it is the gate that cannot be argued with.
 */
export function computeCommitBlockers(args: {
  isFinal: boolean;
  totals: ObRegisterTotals & { unsupported_types: string[] };
  makers: string[];
  checkerUserId: string | null;
}): ObCommitRefuseReason[] {
  const blockers: ObCommitRefuseReason[] = [];
  if (!args.isFinal) blockers.push("source_not_final");
  if (args.totals.staged_line_count === 0) blockers.push("no_staged_lines");
  if (args.checkerUserId && args.makers.length > 0 && args.makers.includes(args.checkerUserId)) {
    blockers.push("maker_is_checker");
  }
  if (args.totals.unsupported_types.length > 0) blockers.push("non_balance_sheet_account_type");
  if (args.totals.staged_line_count > 0 && !args.totals.is_balanced) blockers.push("unbalanced");
  if (!args.totals.obe_is_reclassed) blockers.push("obe_not_reclassed");
  return blockers;
}

async function loadFinality(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string
): Promise<ObRegisterFinality> {
  const res = await client.query<{
    is_final: boolean;
    set_by: string | null;
    set_by_name: string | null;
    set_at: string | null;
    note: string | null;
  }>(
    `
      SELECT f.is_final,
             f.set_by::text,
             nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS set_by_name,
             f.set_at,
             f.note
      FROM accounting.ob_source_finality f
      LEFT JOIN identity.users u ON u.id = f.set_by
      WHERE f.operating_company_id = $1::uuid
        AND f.as_of_date = $2::date
      LIMIT 1
    `,
    [operatingCompanyId, asOfDate]
  );
  const row = res.rows[0];
  return {
    is_final: Boolean(row?.is_final),
    as_of_date: asOfDate,
    set_by_user_id: row?.set_by ?? null,
    set_by_name: row?.set_by_name ?? null,
    set_at: row?.set_at ?? null,
    note: row?.note ?? null,
  };
}

async function qboConnectionPresent(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  const res = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
      FROM integrations.qbo_connections
      WHERE operating_company_id = $1::uuid
        AND revoked_at IS NULL
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.n ?? 0) > 0;
}

function toViewLines(rows: StagedRow[]): ObRegisterLine[] {
  return rows.map((r) => {
    const amount = toNumber(r.amount_cents);
    const type = r.account_type;
    const dc =
      type === "Asset" || type === "Liability" || type === "Equity"
        ? signedCentsToDebitCredit(type, amount)
        : null;
    return {
      id: r.id,
      account_id: r.account_id,
      account_number: r.account_number,
      account_name: r.account_name,
      account_type: r.account_type,
      amount_cents: amount,
      source: r.source,
      source_account_label: r.source_account_label,
      qbo_account_id: r.qbo_account_id,
      status: r.status,
      note: r.note,
      created_by_user_id: r.created_by_user_id,
      updated_by_user_id: r.updated_by_user_id,
      updated_at: r.updated_at,
      posted_opening_balance_cents:
        r.posted_opening_balance_cents === null ? null : toNumber(r.posted_opening_balance_cents),
      posted_opening_balance_as_of: r.posted_opening_balance_as_of,
      debit_or_credit: dc?.debit_or_credit ?? null,
    };
  });
}

function makersOf(rows: StagedRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.created_by_user_id) set.add(r.created_by_user_id);
    if (r.updated_by_user_id) set.add(r.updated_by_user_id);
  }
  return [...set];
}

export async function getObRegisterView(
  client: DbClient,
  operatingCompanyId: string,
  viewerUserId: string | null
): Promise<ObRegisterView> {
  const { company, period } = await resolveObRegisterPeriod(client, operatingCompanyId);
  const [rows, finality, connPresent, flagOn] = await Promise.all([
    loadStagedRows(client, operatingCompanyId, period.as_of_date),
    loadFinality(client, operatingCompanyId, period.as_of_date),
    qboConnectionPresent(client, operatingCompanyId),
    isEnabled(client as never, OPENING_BALANCE_IMPORT_FLAG, {
      operating_company_id: operatingCompanyId,
    }),
  ]);

  const lines = toViewLines(rows);
  const totals = computeObTotals(lines);
  const makers = makersOf(rows);
  const commit_blockers = computeCommitBlockers({
    isFinal: finality.is_final,
    totals,
    makers,
    checkerUserId: viewerUserId,
  });

  const memo = `Opening balance — ${company.code} as of ${period.as_of_date} (reviewed register, signed-actual)`;
  const postings = lines
    .filter((l) => l.debit_or_credit && l.amount_cents !== 0)
    .map((l) => ({
      account_id: l.account_id,
      debit_or_credit: l.debit_or_credit as "debit" | "credit",
      amount_cents: Math.abs(l.amount_cents),
      description: `${memo} — ${l.account_name}`,
    }));

  return {
    operating_company_id: operatingCompanyId,
    company_code: company.code,
    as_of_date: period.as_of_date,
    import_source: period.import_source,
    period_basis: period.basis,
    qbo_import_flag_on: flagOn,
    qbo_connection_present: connPresent,
    finality,
    lines,
    totals,
    // Preview only when the entry would actually balance — never show a half-JE as if it were postable.
    je_preview: totals.is_balanced ? { entry_date: period.as_of_date, memo, postings } : null,
    commit_blockers,
    makers,
  };
}

/** Upsert one staged line (manual entry or correction of an imported line) + WORM audit. */
export async function upsertObRegisterLine(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  input: { account_id: string; amount_cents: number; note?: string | null }
): Promise<ObRegisterLine> {
  const { period } = await resolveObRegisterPeriod(client, operatingCompanyId);

  const acct = await client.query<{ id: string; account_name: string }>(
    `
      SELECT id::text, account_name
      FROM catalogs.accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [input.account_id, operatingCompanyId]
  );
  if (!acct.rows[0]) {
    // Entity scope is a hard boundary: an account from another operating company is not "not found
    // in this list", it is a cross-entity write attempt and is refused as such.
    throw new ObRegisterError(
      "account_not_in_entity",
      "account does not belong to this operating company",
      404,
      { account_id: input.account_id }
    );
  }

  const before = await client.query<{ id: string; amount_cents: string; note: string | null }>(
    `
      SELECT id::text, amount_cents::text, note
      FROM accounting.ob_register_staging_lines
      WHERE operating_company_id = $1::uuid AND as_of_date = $2::date
        AND account_id = $3::uuid AND status = 'staged'
      LIMIT 1
    `,
    [operatingCompanyId, period.as_of_date, input.account_id]
  );
  const prior = before.rows[0] ?? null;

  const upserted = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.ob_register_staging_lines (
        operating_company_id, as_of_date, account_id, amount_cents, source, note,
        created_by_user_id, updated_by_user_id
      )
      VALUES ($1::uuid, $2::date, $3::uuid, $4::bigint, 'manual', $5, $6::uuid, $6::uuid)
      ON CONFLICT (operating_company_id, as_of_date, account_id) WHERE status = 'staged'
      DO UPDATE SET
        amount_cents = EXCLUDED.amount_cents,
        note = EXCLUDED.note,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      RETURNING id::text
    `,
    [operatingCompanyId, period.as_of_date, input.account_id, input.amount_cents, input.note ?? null, actorUserId]
  );
  const lineId = upserted.rows[0]?.id ?? null;

  await insertAuditEvent(client, {
    operatingCompanyId,
    asOfDate: period.as_of_date,
    stagingLineId: lineId,
    accountId: input.account_id,
    eventType: prior ? "line_edited" : "line_created",
    actorUserId,
    before: prior ? { amount_cents: Number(prior.amount_cents), note: prior.note } : null,
    after: { amount_cents: input.amount_cents, note: input.note ?? null },
    detail: prior ? "opening balance line edited under review" : "opening balance line entered manually",
  });

  const rows = await loadStagedRows(client, operatingCompanyId, period.as_of_date);
  const line = toViewLines(rows).find((l) => l.account_id === input.account_id);
  if (!line) throw new ObRegisterError("line_not_found", "staged line missing after write", 500);
  return line;
}

export type ObImportDeps = {
  qboCompanyContext?: (operatingCompanyId: string) => Promise<QboApiContext>;
  qboReport?: (
    ctx: QboApiContext,
    reportName: string,
    params?: Record<string, string>
  ) => Promise<QboReportResponse>;
};

export type ObImportResult = {
  as_of_date: string;
  company_code: string;
  realm_id: string;
  staged_count: number;
  unmapped: Array<{ qbo_account_id: string; report_account_name: string; reason: string }>;
  /** Never silently zero: a line the register could not map is reported, not dropped. */
  mapped_count: number;
};

/**
 * Import the QBO balance sheet as-of this entity's opening date into STAGING.
 *
 * Read-only against QBO (one report GET). Writes only accounting.ob_register_staging_lines and the
 * WORM audit — no GL, no catalogs.accounts write, no QBO write-back. Re-running overwrites the
 * staged rows for the same period rather than duplicating them.
 */
export async function importObRegisterFromQbo(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  deps: ObImportDeps = {}
): Promise<ObImportResult> {
  const { company, period } = await resolveObRegisterPeriod(client, operatingCompanyId);

  if (period.import_source !== "qbo") {
    throw new ObRegisterError(
      "manual_entry_only",
      `${company.code} has no QBO source for opening balances — enter them manually`,
      409,
      { company_code: company.code, as_of_date: period.as_of_date }
    );
  }
  if (!(await qboConnectionPresent(client, operatingCompanyId))) {
    throw new ObRegisterError(
      "no_qbo_connection",
      `no active QBO connection for ${company.code}`,
      409,
      { company_code: company.code }
    );
  }
  const flagOn = await isEnabled(client as never, OPENING_BALANCE_IMPORT_FLAG, {
    operating_company_id: operatingCompanyId,
  });
  if (!flagOn) {
    // Same gate the existing OB preview pulls sit behind — a new flag would be duplicate law.
    throw new ObRegisterError(
      "import_flag_off",
      `${OPENING_BALANCE_IMPORT_FLAG} is off for this entity — manual entry still works`,
      409,
      { flag: OPENING_BALANCE_IMPORT_FLAG }
    );
  }

  const getCtx = deps.qboCompanyContext ?? qboCompanyContext;
  const getReport = deps.qboReport ?? qboReport;
  const ctx = await getCtx(operatingCompanyId);
  const raw = await getReport(ctx, "BalanceSheet", {
    start_date: period.as_of_date,
    end_date: period.as_of_date,
    accounting_method: QBO_OB_ACCOUNTING_METHOD,
  });

  const parsed = parseBalanceSheet(raw);
  const reportAccounts = parsed.lines.map((l) => ({
    qbo_account_id: l.qbo_account_id,
    account_name: l.account_name,
  }));
  const mapping = await mapQboObAccountsViaMdata(client, operatingCompanyId, reportAccounts);
  const mappedByQboId = new Map(mapping.mapped.map((m) => [m.qbo_account_id, m]));

  let staged = 0;
  for (const line of parsed.lines) {
    const mapped = mappedByQboId.get(line.qbo_account_id);
    if (!mapped) continue; // surfaced in `unmapped` — never guessed into an account
    const amountCents = Number(line.balance_cents);
    if (!Number.isSafeInteger(amountCents)) {
      throw new ObRegisterError(
        "cents_overflow",
        `QBO balance for ${line.account_name} exceeds safe integer range`,
        422,
        { qbo_account_id: line.qbo_account_id }
      );
    }

    const res = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.ob_register_staging_lines (
          operating_company_id, as_of_date, account_id, amount_cents, source,
          source_account_label, qbo_account_id, created_by_user_id, updated_by_user_id
        )
        VALUES ($1::uuid, $2::date, $3::uuid, $4::bigint, 'qbo_import', $5, $6, $7::uuid, $7::uuid)
        ON CONFLICT (operating_company_id, as_of_date, account_id) WHERE status = 'staged'
        DO UPDATE SET
          amount_cents = EXCLUDED.amount_cents,
          source = 'qbo_import',
          source_account_label = EXCLUDED.source_account_label,
          qbo_account_id = EXCLUDED.qbo_account_id,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
        RETURNING id::text
      `,
      [
        operatingCompanyId,
        period.as_of_date,
        mapped.catalogs_account_id,
        amountCents,
        line.account_name,
        line.qbo_account_id,
        actorUserId,
      ]
    );
    if (res.rows[0]) staged += 1;
  }

  await insertAuditEvent(client, {
    operatingCompanyId,
    asOfDate: period.as_of_date,
    eventType: "import_staged",
    actorUserId,
    after: {
      realm_id: ctx.realmId,
      staged,
      mapped: mapping.counts.mapped,
      unmapped: mapping.counts.unmapped,
    },
    detail: `QBO BalanceSheet ${period.as_of_date} ${QBO_OB_ACCOUNTING_METHOD} imported to staging (read-only pull)`,
  });

  return {
    as_of_date: period.as_of_date,
    company_code: company.code,
    realm_id: ctx.realmId,
    staged_count: staged,
    mapped_count: mapping.counts.mapped,
    unmapped: mapping.unmapped.map((u) => ({
      qbo_account_id: u.qbo_account_id,
      report_account_name: u.report_account_name,
      reason: u.reason,
    })),
  };
}

/** Martin's gate. Marking an entity/period FINAL is what unlocks the commit; it is itself audited. */
export async function setObSourceFinality(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  input: { is_final: boolean; note?: string | null }
): Promise<ObRegisterFinality> {
  const { period } = await resolveObRegisterPeriod(client, operatingCompanyId);
  const before = await loadFinality(client, operatingCompanyId, period.as_of_date);

  await client.query(
    `
      INSERT INTO accounting.ob_source_finality (
        operating_company_id, as_of_date, is_final, set_by, set_at, note
      )
      VALUES ($1::uuid, $2::date, $3::boolean, $4::uuid, now(), $5)
      ON CONFLICT (operating_company_id, as_of_date) DO UPDATE SET
        is_final = EXCLUDED.is_final,
        set_by = EXCLUDED.set_by,
        set_at = now(),
        note = EXCLUDED.note,
        updated_at = now()
    `,
    [operatingCompanyId, period.as_of_date, input.is_final, actorUserId, input.note ?? null]
  );

  await insertAuditEvent(client, {
    operatingCompanyId,
    asOfDate: period.as_of_date,
    eventType: "finality_set",
    actorUserId,
    before: { is_final: before.is_final },
    after: { is_final: input.is_final, note: input.note ?? null },
    detail: input.is_final
      ? "source period marked FINAL — commit is now permitted for this entity/period"
      : "source period marked NOT final — commit is refused for this entity/period",
  });

  return loadFinality(client, operatingCompanyId, period.as_of_date);
}

export type ObCommitResult =
  | {
      committed: true;
      as_of_date: string;
      company_code: string;
      accounts_written: number;
      totals: ObRegisterTotals;
      blockers: [];
    }
  | {
      committed: false;
      as_of_date: string;
      company_code: string;
      accounts_written: 0;
      totals: ObRegisterTotals;
      blockers: ObCommitRefuseReason[];
      is_final: boolean;
    };

/**
 * Commit the reviewed register onto catalogs.accounts.
 *
 * Refuses — with an audited `commit_refused` event — unless the source period is FINAL, a different
 * user staged the lines than is committing them, the entry balances, and Opening Balance Equity has
 * been reclassed to Retained Earnings. There is no override: a refused commit writes nothing.
 *
 * A refusal RETURNS `{ committed: false, blockers }`; it does not throw. That is deliberate and it
 * is the whole reason the refusal is auditable: the routes run this inside withCompanyScope, which
 * ROLLBACKs the transaction on a thrown error — so a thrown refusal would take its own
 * `commit_refused` WORM row down with it and no one could ever prove the attempt happened. A refused
 * commit is an expected business outcome, not an exception. The route maps it to HTTP 409.
 * (`ObRegisterError` is still thrown for genuine faults: unknown company, cross-entity account, no
 * QBO realm — none of those need to survive as an audit row.)
 */
export async function commitObRegister(
  client: DbClient,
  operatingCompanyId: string,
  checkerUserId: string
): Promise<ObCommitResult> {
  const { company, period } = await resolveObRegisterPeriod(client, operatingCompanyId);
  const [rows, finality] = await Promise.all([
    loadStagedRows(client, operatingCompanyId, period.as_of_date),
    loadFinality(client, operatingCompanyId, period.as_of_date),
  ]);

  const lines = toViewLines(rows);
  const totals = computeObTotals(lines);
  const makers = makersOf(rows);
  const blockers = computeCommitBlockers({
    isFinal: finality.is_final,
    totals,
    makers,
    checkerUserId,
  });

  if (blockers.length > 0) {
    await insertAuditEvent(client, {
      operatingCompanyId,
      asOfDate: period.as_of_date,
      eventType: "commit_refused",
      actorUserId: checkerUserId,
      after: {
        blockers,
        is_final: finality.is_final,
        total_debits_cents: totals.total_debits_cents,
        total_credits_cents: totals.total_credits_cents,
        obe_residual_cents: totals.obe_residual_cents,
      },
      detail: `commit refused: ${blockers.join(", ")}`,
    });
    return {
      committed: false,
      as_of_date: period.as_of_date,
      company_code: company.code,
      accounts_written: 0,
      totals,
      blockers,
      is_final: finality.is_final,
    };
  }

  let written = 0;
  for (const line of lines) {
    const res = await client.query<{ id: string }>(
      `
        UPDATE catalogs.accounts
           SET opening_balance_cents = $1::bigint,
               opening_balance_as_of = $2::date
         WHERE id = $3::uuid
           AND operating_company_id = $4::uuid
           AND deactivated_at IS NULL
        RETURNING id::text
      `,
      [line.amount_cents, period.as_of_date, line.account_id, operatingCompanyId]
    );
    if (res.rows[0]) written += 1;

    await client.query(
      `
        UPDATE accounting.ob_register_staging_lines
           SET status = 'committed',
               committed_by_user_id = $1::uuid,
               committed_at = now(),
               updated_at = now()
         WHERE id = $2::uuid
      `,
      [checkerUserId, line.id]
    );

    await insertAuditEvent(client, {
      operatingCompanyId,
      asOfDate: period.as_of_date,
      stagingLineId: line.id,
      accountId: line.account_id,
      eventType: "committed",
      actorUserId: checkerUserId,
      before: {
        opening_balance_cents: line.posted_opening_balance_cents,
        opening_balance_as_of: line.posted_opening_balance_as_of,
      },
      after: { opening_balance_cents: line.amount_cents, opening_balance_as_of: period.as_of_date },
      detail: "opening balance committed to catalogs.accounts",
    });
  }

  return {
    committed: true,
    as_of_date: period.as_of_date,
    company_code: company.code,
    accounts_written: written,
    totals,
    blockers: [],
  };
}

export async function listObRegisterAudit(
  client: DbClient,
  operatingCompanyId: string,
  limit = 100
): Promise<
  Array<{
    id: string;
    event_type: string;
    actor_user_id: string | null;
    actor_name: string | null;
    account_name: string | null;
    detail: string | null;
    before_json: unknown;
    after_json: unknown;
    created_at: string;
  }>
> {
  const { period } = await resolveObRegisterPeriod(client, operatingCompanyId);
  const res = await client.query<{
    id: string;
    event_type: string;
    actor_user_id: string | null;
    actor_name: string | null;
    account_name: string | null;
    detail: string | null;
    before_json: unknown;
    after_json: unknown;
    created_at: string;
  }>(
    `
      SELECT e.id::text,
             e.event_type,
             e.actor_user_id::text,
             nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name,
             a.account_name,
             e.detail,
             e.before_json,
             e.after_json,
             e.created_at
      FROM accounting.ob_register_audit_events e
      LEFT JOIN identity.users u ON u.id = e.actor_user_id
      LEFT JOIN catalogs.accounts a ON a.id = e.account_id
      WHERE e.operating_company_id = $1::uuid
        AND e.as_of_date = $2::date
      ORDER BY e.created_at DESC
      LIMIT $3
    `,
    [operatingCompanyId, period.as_of_date, limit]
  );
  return res.rows;
}
