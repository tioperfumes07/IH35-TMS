// OB-01 — Opening Balance Register: import → stage → owner-adjustable commit.
//
// OWNER RULING 2026-07-29 (docs/fixtures/ob01 companion: ~/Downloads/GIVE-CURSOR/Cursor-OpeningBalances-OB01.md,
// superseding this module's original 2026-07-28 finality-gate design): opening balances are LIVE and
// CHANGE. There is NO finality gate. The register auto-imports the QBO/fixture numbers AND commits
// them as the opening balance NOW (clone-as-is, Adjustment 0), so the books are populated and the
// software is functional immediately — waiting on any "the QBO cleanup is done" flag before the books
// can be used at all was the wrong shape of control. Martin/owner adjust balances over time in the
// register (three columns, worksheet-style: QBO Snapshot | editable Adjustment | Adjusted Opening =
// Snapshot + Adjustment, the committed value). Re-import refreshes the Snapshot only; a prior
// Adjustment persists across re-import. Every edit stays WORM-audited. The commit still refuses an
// internally-inconsistent register (unbalanced, OBE not reclassed, an account outside Asset/Liability/
// Equity) and still enforces maker≠checker for a HUMAN commit — those are data-integrity controls, not
// the "is the source final" control this ruling removed. The one-time system clone-as-is commit (see
// cloneAsIsImportAndCommit) is the sole caller allowed to bypass maker≠checker, because there is no
// second human in that loop by construction; it still cannot bypass balance/OBE/account-type checks.
//
// WHY THIS EXISTS: catalogs.accounts has carried opening_balance_cents / opening_balance_as_of for
// months, and on prod (2026-07-28) every one of the 1,233 active accounts across TRANSP/TRK/USMCA
// has a NULL/zero opening balance and no as-of date. The two opening-balance code paths that existed
// before this module (opening-balance-import.service.ts, qbo-ob-2026-03-31-live-pull.service.ts) are
// read-only previews that assemble a JE and stop — nothing persists a reviewed balance, nothing audits
// who changed one. This module is that missing persistence + audit layer, now with the two-source
// (Snapshot vs Adjustment) model the owner's worksheet already uses.
//
// GL MATH: none is written here. Debit/credit derivation reuses signedCentsToDebitCredit from
// opening-balance-import.service.ts (the CPA-locked signed-actual convention). QBO account mapping
// (live QBO import path only) reuses mapQboObAccountsViaMdata from qbo-ob-2026-03-31-live-pull.service.ts.
// This module assembles a JE PREVIEW only — it never calls createJournalEntry and writes nothing to
// accounting.journal_*.
//
// PARALLEL BOOKS: QBO is read-only. This module issues QBO *report* GETs and nothing else. There is
// no write-back of any kind, and no posting flag is read or flipped.
//
// MATCHING (fixture import only — 2026-07-29 prod-truth pass, Cursor-Balances-Reference.xlsx vs live
// Neon catalogs.accounts): four ordered passes, each a documented, deterministic rule — never a fuzzy
// guess. A label that matches none of the four is reported in `unmapped`:
//   1. `match_aliases` in the fixture file — an explicit, owner-verified rename for a SPECIFIC label
//      (e.g. QBO's report-only "Accounts Receivable (A/R) [control]" -> the live CoA's plain
//      "Accounts Receivable (A/R)"; the worksheet's ASCII "Ignacio Munoz" -> the live CoA's accented
//      "Ignacio Muñoz"). This is the ONLY pass that is per-label data, not a general rule — it exists
//      precisely so a rename never needs a guessed general rule.
//   2. exact catalogs.accounts.account_name match.
//   3. case-insensitive/trimmed match.
//   4. trailing " [control]" suffix stripped (QBO's Balance Sheet report appends this to the A/R
//      control account label; the live CoA row never carries it) — deterministic, not a guess.
//   5. diacritic-fold compare (Unicode NFD decomposition with combining marks stripped, then
//      trim/lower) — catches an ASCII-vs-accented spelling difference generally, beyond the one
//      `match_aliases` entry that documents this specific case.
// `fold_into` in the fixture file names labels that are NOT postable catalogs.accounts rows at all
// (QBO's Balance Sheet "Net Income" line is a rollup of not-yet-closed P&L accounts, not a GL account
// in any chart of accounts) and folds their cents into a named target label's snapshot BEFORE staging
// — never left in `unmapped` when the target resolves. The one-time TRANSP prod seed
// (db/migrations/202610151400_*) implements the identical alias + fold rules in SQL so the register
// and the migration agree on what "the same account" means.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { resolveMonorepoRoot } from "../../lib/monorepo-root.js";
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
 *   (docs/OPENING-BALANCES-TRANSP-2024-12-31.md / transp-2024-12-31-source.ts). AWAITING DATA per the
 *   owner worksheet (Cursor-Balances-Reference.xlsx "TRK 2024-12-31" tab) — a separate QBO company not
 *   yet connected. Never invent TRK balances; import stays refused until a real source exists.
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
 * This check is unaffected by the 2026-07-29 finality-gate removal — it is a data-integrity check on
 * the register's own contents, not a "has Martin finished cleanup" gate.
 */
export const OB_OBE_RESIDUAL_TOLERANCE_CENTS = 0;

const OBE_LABELS = ["opening balance equity"];
const RETAINED_EARNINGS_LABELS = ["retained earnings"];

/** Repo-root-relative path to the owner-provided TRANSP clone-as-is fixture (see file header). */
export const TRANSP_CLONE_AS_IS_FIXTURE_RELATIVE_PATH = "docs/fixtures/ob01/transp-2026-03-31.json";

function normalizeLabel(label: string | null | undefined): string {
  return String(label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesAnyLabel(name: string | null | undefined, labels: readonly string[]): boolean {
  const n = normalizeLabel(name);
  return labels.some((l) => normalizeLabel(l) === n);
}

/** Deterministic QBO Balance Sheet report normalize — the control-account rollup suffix, not a guess. */
function stripControlSuffix(name: string): string {
  return name.replace(/\s*\[control\]\s*$/i, "");
}

/** Unicode NFD decomposition + strip combining marks (U+0300–U+036F) — "Muñoz" -> "Munoz". */
function diacriticFold(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function trimLower(name: string): string {
  return name.trim().toLowerCase();
}

type FixtureAccountRow = { id: string; account_name: string };

/** Four independent lookup indexes over the SAME live catalogs.accounts rows — see the file header's
 * "MATCHING" section for the ordered rule these back. */
function buildFixtureAccountIndexes(accounts: FixtureAccountRow[]): {
  byExact: Map<string, FixtureAccountRow>;
  byTrimLower: Map<string, FixtureAccountRow>;
  byControlStripped: Map<string, FixtureAccountRow>;
  byDiacriticFold: Map<string, FixtureAccountRow>;
} {
  const byExact = new Map<string, FixtureAccountRow>();
  const byTrimLower = new Map<string, FixtureAccountRow>();
  const byControlStripped = new Map<string, FixtureAccountRow>();
  const byDiacriticFold = new Map<string, FixtureAccountRow>();
  for (const a of accounts) {
    byExact.set(a.account_name, a);
    // first-match-wins on every index — never silently overwritten by a later duplicate label.
    const tl = trimLower(a.account_name);
    if (!byTrimLower.has(tl)) byTrimLower.set(tl, a);
    const cs = trimLower(stripControlSuffix(a.account_name));
    if (!byControlStripped.has(cs)) byControlStripped.set(cs, a);
    const df = trimLower(diacriticFold(a.account_name));
    if (!byDiacriticFold.has(df)) byDiacriticFold.set(df, a);
  }
  return { byExact, byTrimLower, byControlStripped, byDiacriticFold };
}

/**
 * Resolve one fixture label to a live account using the ordered rule documented in the file header's
 * "MATCHING" section: alias -> exact -> trim/lower -> control-suffix-stripped -> diacritic-fold.
 * Returns null (never a guess) when none of the four passes finds a live account.
 */
function resolveFixtureAccountMatch(
  qboAccountName: string,
  idx: ReturnType<typeof buildFixtureAccountIndexes>,
  matchAliases: Record<string, string>
): { account: FixtureAccountRow; strategy: string } | null {
  const alias = matchAliases[qboAccountName];
  const candidates = alias ? [alias, qboAccountName] : [qboAccountName];

  for (const c of candidates) {
    const hit = idx.byExact.get(c);
    if (hit) return { account: hit, strategy: c === alias ? "match_aliases+exact" : "exact" };
  }
  for (const c of candidates) {
    const hit = idx.byTrimLower.get(trimLower(c));
    if (hit) return { account: hit, strategy: c === alias ? "match_aliases+trim_lower" : "trim_lower" };
  }
  for (const c of candidates) {
    const hit = idx.byControlStripped.get(trimLower(stripControlSuffix(c)));
    if (hit) return { account: hit, strategy: "control_suffix_stripped" };
  }
  for (const c of candidates) {
    const hit = idx.byDiacriticFold.get(trimLower(diacriticFold(c)));
    if (hit) return { account: hit, strategy: "diacritic_fold" };
  }
  return null;
}

export type ObRegisterLine = {
  id: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  /** QBO/fixture snapshot as last imported. NULL when this line has never been imported (hand-entered only). */
  qbo_snapshot_cents: number | null;
  /** Owner/accountant editable layer on top of the snapshot. Persists across re-import. */
  adjustment_cents: number;
  /** Adjusted Opening = coalesce(qbo_snapshot_cents, 0) + adjustment_cents. This is the committed value. */
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

/**
 * `source_not_final` was REMOVED 2026-07-29 (owner ruling — no finality gate; balances are live and
 * change). Every remaining reason is a data-integrity check on the register's own contents, not a
 * "has the source been cleaned up" gate.
 */
export type ObCommitRefuseReason =
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
  /** Advisory only since 2026-07-29 — does NOT gate commit_blockers. Martin's own tracking flag. */
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
  qbo_snapshot_cents: string | number | null;
  adjustment_cents: string | number;
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
        l.qbo_snapshot_cents,
        l.adjustment_cents,
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

/**
 * The most recently touched register row (staged OR committed OR superseded) for one account/period,
 * regardless of status. This is how a re-import or a fresh manual entry after a commit inherits the
 * last Adjustment instead of clobbering it back to 0 — "re-import refreshes the Snapshot only" (owner
 * ruling 2026-07-29).
 */
async function loadMostRecentLine(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string,
  accountId: string
): Promise<{ qbo_snapshot_cents: number | null; adjustment_cents: number } | null> {
  const res = await client.query<{ qbo_snapshot_cents: string | number | null; adjustment_cents: string | number }>(
    `
      SELECT qbo_snapshot_cents, adjustment_cents
      FROM accounting.ob_register_staging_lines
      WHERE operating_company_id = $1::uuid AND as_of_date = $2::date AND account_id = $3::uuid
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, asOfDate, accountId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    qbo_snapshot_cents: row.qbo_snapshot_cents === null ? null : toNumber(row.qbo_snapshot_cents),
    adjustment_cents: toNumber(row.adjustment_cents),
  };
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
 *
 * `source_not_final` was REMOVED 2026-07-29 (owner ruling — there is no finality gate; balances are
 * live and change). `checkerUserId: null` (the system clone-as-is path — see cloneAsIsImportAndCommit)
 * skips the maker/checker check entirely: there is no second human in a system-driven commit by
 * construction, so refusing it for that reason would be nonsensical, not protective. Every other check
 * (balance, OBE, account type) still applies to that path unchanged.
 */
export function computeCommitBlockers(args: {
  totals: ObRegisterTotals & { unsupported_types: string[] };
  makers: string[];
  checkerUserId: string | null;
}): ObCommitRefuseReason[] {
  const blockers: ObCommitRefuseReason[] = [];
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
      qbo_snapshot_cents: r.qbo_snapshot_cents === null ? null : toNumber(r.qbo_snapshot_cents),
      adjustment_cents: toNumber(r.adjustment_cents),
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

/**
 * Upsert one staged line's ADJUSTMENT (manual entry or correction of an imported line) + WORM audit.
 *
 * The Snapshot is never touched by this path — it is preserved from whatever it last was (null for a
 * line that was never imported, e.g. a hand-entered USMCA balance). Adjusted Opening (`amount_cents`,
 * the value a commit writes) is always recomputed as snapshot + adjustment here, server-side; the
 * caller (route/UI) sends only the Adjustment.
 */
export async function upsertObRegisterLine(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  input: { account_id: string; adjustment_cents: number; note?: string | null }
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

  const before = await client.query<{
    id: string;
    amount_cents: string;
    qbo_snapshot_cents: string | number | null;
    adjustment_cents: string;
    note: string | null;
    source: "manual" | "qbo_import";
  }>(
    `
      SELECT id::text, amount_cents::text, qbo_snapshot_cents, adjustment_cents::text, note, source
      FROM accounting.ob_register_staging_lines
      WHERE operating_company_id = $1::uuid AND as_of_date = $2::date
        AND account_id = $3::uuid AND status = 'staged'
      LIMIT 1
    `,
    [operatingCompanyId, period.as_of_date, input.account_id]
  );
  const prior = before.rows[0] ?? null;
  // Preserve whatever Snapshot this account last carried (staged, committed, or superseded) — a
  // manual adjustment never invents or clears a Snapshot.
  const mostRecent = prior
    ? { qbo_snapshot_cents: prior.qbo_snapshot_cents === null ? null : toNumber(prior.qbo_snapshot_cents) }
    : await loadMostRecentLine(client, operatingCompanyId, period.as_of_date, input.account_id);
  const snapshotCents = mostRecent?.qbo_snapshot_cents ?? null;
  const amountCents = (snapshotCents ?? 0) + input.adjustment_cents;
  const source: "manual" | "qbo_import" = prior?.source ?? (snapshotCents === null ? "manual" : "qbo_import");

  const upserted = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.ob_register_staging_lines (
        operating_company_id, as_of_date, account_id, amount_cents, qbo_snapshot_cents,
        adjustment_cents, source, note, created_by_user_id, updated_by_user_id
      )
      VALUES ($1::uuid, $2::date, $3::uuid, $4::bigint, $5::bigint, $6::bigint, $7, $8, $9::uuid, $9::uuid)
      ON CONFLICT (operating_company_id, as_of_date, account_id) WHERE status = 'staged'
      DO UPDATE SET
        amount_cents = EXCLUDED.amount_cents,
        qbo_snapshot_cents = EXCLUDED.qbo_snapshot_cents,
        adjustment_cents = EXCLUDED.adjustment_cents,
        note = EXCLUDED.note,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      RETURNING id::text
    `,
    [
      operatingCompanyId,
      period.as_of_date,
      input.account_id,
      amountCents,
      snapshotCents,
      input.adjustment_cents,
      source,
      input.note ?? null,
      actorUserId,
    ]
  );
  const lineId = upserted.rows[0]?.id ?? null;

  await insertAuditEvent(client, {
    operatingCompanyId,
    asOfDate: period.as_of_date,
    stagingLineId: lineId,
    accountId: input.account_id,
    eventType: prior ? "line_edited" : "line_created",
    actorUserId,
    before: prior
      ? { amount_cents: Number(prior.amount_cents), adjustment_cents: Number(prior.adjustment_cents), note: prior.note }
      : null,
    after: { amount_cents: amountCents, adjustment_cents: input.adjustment_cents, note: input.note ?? null },
    detail: prior ? "opening balance adjustment edited" : "opening balance adjustment entered manually",
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
 *
 * "Re-import refreshes the Snapshot only" (owner ruling 2026-07-29): if this account already carries
 * an Adjustment from a prior staged/committed row for the same period, that Adjustment is PRESERVED
 * and Adjusted Opening is recomputed as new_snapshot + old_adjustment — never reset to the raw QBO
 * number, and never silently dropped.
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
    const snapshotCents = Number(line.balance_cents);
    if (!Number.isSafeInteger(snapshotCents)) {
      throw new ObRegisterError(
        "cents_overflow",
        `QBO balance for ${line.account_name} exceeds safe integer range`,
        422,
        { qbo_account_id: line.qbo_account_id }
      );
    }

    const prior = await loadMostRecentLine(client, operatingCompanyId, period.as_of_date, mapped.catalogs_account_id);
    const priorAdjustment = prior?.adjustment_cents ?? 0;
    const amountCents = snapshotCents + priorAdjustment;

    const res = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.ob_register_staging_lines (
          operating_company_id, as_of_date, account_id, amount_cents, qbo_snapshot_cents,
          adjustment_cents, source, source_account_label, qbo_account_id,
          created_by_user_id, updated_by_user_id
        )
        VALUES ($1::uuid, $2::date, $3::uuid, $4::bigint, $5::bigint, $6::bigint, 'qbo_import', $7, $8, $9::uuid, $9::uuid)
        ON CONFLICT (operating_company_id, as_of_date, account_id) WHERE status = 'staged'
        DO UPDATE SET
          amount_cents = EXCLUDED.amount_cents,
          qbo_snapshot_cents = EXCLUDED.qbo_snapshot_cents,
          adjustment_cents = EXCLUDED.adjustment_cents,
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
        snapshotCents,
        priorAdjustment,
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
    detail: `QBO BalanceSheet ${period.as_of_date} ${QBO_OB_ACCOUNTING_METHOD} imported to staging (read-only pull; snapshot refreshed, prior adjustments preserved)`,
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

export type ObFixtureLineInput = {
  qbo_account_name: string;
  qbo_snapshot_cents: number;
  /** Fixture files ship Adjustment 0 by convention; a prior live Adjustment always wins over this. */
  adjustment_cents?: number;
  notes?: string | null;
};

type ObFixtureFile = {
  company_code?: string;
  as_of_date?: string;
  lines: ObFixtureLineInput[];
  /** Explicit, owner-verified rename for a SPECIFIC fixture label — see file header "MATCHING" §1. */
  match_aliases?: Record<string, string>;
  /** Fixture labels that are not postable catalogs.accounts rows — see file header "MATCHING" fold note. */
  fold_into?: Record<string, string>;
};

export type ObFixtureSource = string | ObFixtureLineInput[] | ObFixtureFile;

export type ObFixtureImportResult = {
  as_of_date: string;
  company_code: string;
  staged_count: number;
  mapped_count: number;
  unmapped: Array<{ qbo_account_name: string; reason: string }>;
};

type ObFixtureLoaded = { lines: ObFixtureLineInput[]; match_aliases: Record<string, string>; fold_into: Record<string, string> };

function loadFixtureFile(source: ObFixtureSource): ObFixtureLoaded {
  if (typeof source === "string") {
    const abs = source.startsWith("/") ? source : join(resolveMonorepoRoot(import.meta.url), source);
    const raw = readFileSync(abs, "utf8");
    const parsed = JSON.parse(raw) as ObFixtureFile;
    if (!Array.isArray(parsed.lines)) {
      throw new ObRegisterError("fixture_malformed", `fixture at ${abs} has no "lines" array`, 500, { path: abs });
    }
    return { lines: parsed.lines, match_aliases: parsed.match_aliases ?? {}, fold_into: parsed.fold_into ?? {} };
  }
  if (Array.isArray(source)) return { lines: source, match_aliases: {}, fold_into: {} };
  return { lines: source.lines, match_aliases: source.match_aliases ?? {}, fold_into: source.fold_into ?? {} };
}

/**
 * Import the owner-provided clone-as-is fixture (docs/fixtures/ob01/transp-2026-03-31.json, sourced
 * from Cursor-Balances-Reference.xlsx) into STAGING. TRANSP-only — this fixture is TRANSP's snapshot;
 * TRK is "AWAITING DATA" per the worksheet and USMCA is manual-only, neither has a fixture to import.
 *
 * Matching: the five-pass rule documented in the file header's "MATCHING" section (match_aliases ->
 * exact -> trim/lower -> control-suffix-stripped -> diacritic-fold). A label that matches none of them
 * is reported in `unmapped` — never guessed, never invented. `fold_into` labels (fixture rows that are
 * not postable catalogs.accounts rows, e.g. QBO's "Net Income" rollup) are folded into their named
 * target's snapshot before staging instead of being matched to their own account. This is the same
 * rule db/migrations/202610151400_ob01_transp_clone_as_is_seed.sql implements in SQL so the register
 * and the migration agree on what "the same account" means.
 *
 * "Re-import refreshes the Snapshot only": a prior Adjustment for the same account/period is preserved
 * exactly like importObRegisterFromQbo.
 */
export async function importObRegisterFromFixture(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  fixtureSource: ObFixtureSource = TRANSP_CLONE_AS_IS_FIXTURE_RELATIVE_PATH
): Promise<ObFixtureImportResult> {
  const { company, period } = await resolveObRegisterPeriod(client, operatingCompanyId);
  if (company.code !== "TRANSP") {
    throw new ObRegisterError(
      "fixture_entity_mismatch",
      `the clone-as-is fixture is TRANSP-only — ${company.code} has no fixture to import`,
      409,
      { company_code: company.code }
    );
  }

  const { lines: fixtureLines, match_aliases: matchAliases, fold_into: foldInto } = loadFixtureFile(fixtureSource);

  const accountsRes = await client.query<FixtureAccountRow>(
    `SELECT id::text, account_name FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL`,
    [operatingCompanyId]
  );
  const idx = buildFixtureAccountIndexes(accountsRes.rows);

  // fold_into sources (e.g. "Net Income") are NOT matched to their own account — they never had one.
  // Their cents are folded into the named target's Snapshot before staging, keyed by the fixture's own
  // qbo_account_name so the fold target does not depend on which live account label it resolved to.
  const foldSourceNames = new Set(Object.keys(foldInto));
  const normalLines = fixtureLines.filter((l) => !foldSourceNames.has(l.qbo_account_name));
  const foldSourceLines = fixtureLines.filter((l) => foldSourceNames.has(l.qbo_account_name));

  type Resolved = { line: ObFixtureLineInput; match: FixtureAccountRow; strategy: string };
  const resolved: Resolved[] = [];
  const unmapped: Array<{ qbo_account_name: string; reason: string }> = [];

  for (const line of normalLines) {
    const found = resolveFixtureAccountMatch(line.qbo_account_name, idx, matchAliases);
    if (!found) {
      unmapped.push({
        qbo_account_name: line.qbo_account_name,
        reason: "no matching catalogs.accounts row (match_aliases / exact / trim-lower / control-suffix / diacritic-fold) — never invented",
      });
      continue;
    }
    resolved.push({ line, match: found.account, strategy: found.strategy });
  }

  // Fold each fold_into source's cents onto its target's resolved snapshot. "Never leave [a fold
  // source] unmapped if the fold target exists" — if the target itself did not resolve, the fold
  // source honestly reports unmapped naming the missing target, rather than inventing a home for it.
  const foldAdditionsByAccountId = new Map<string, number>();
  for (const line of foldSourceLines) {
    const targetLabel = foldInto[line.qbo_account_name];
    const target = resolved.find((r) => r.line.qbo_account_name === targetLabel);
    if (!target) {
      unmapped.push({
        qbo_account_name: line.qbo_account_name,
        reason: `fold_into target "${targetLabel}" did not resolve to a live account in this fixture run — cannot fold, never invented`,
      });
      continue;
    }
    foldAdditionsByAccountId.set(
      target.match.id,
      (foldAdditionsByAccountId.get(target.match.id) ?? 0) + line.qbo_snapshot_cents
    );
  }

  let staged = 0;
  for (const { line, match, strategy } of resolved) {
    const foldAddition = foldAdditionsByAccountId.get(match.id) ?? 0;
    const prior = await loadMostRecentLine(client, operatingCompanyId, period.as_of_date, match.id);
    const priorAdjustment = prior?.adjustment_cents ?? line.adjustment_cents ?? 0;
    const snapshotCents = line.qbo_snapshot_cents + foldAddition;
    const amountCents = snapshotCents + priorAdjustment;
    const note =
      foldAddition !== 0
        ? `${line.notes ? `${line.notes} — ` : ""}includes ${foldAddition} cents folded in from Net Income (owner ruling 2026-07-29)`
        : line.notes ?? null;

    const res = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.ob_register_staging_lines (
          operating_company_id, as_of_date, account_id, amount_cents, qbo_snapshot_cents,
          adjustment_cents, source, source_account_label, note, created_by_user_id, updated_by_user_id
        )
        VALUES ($1::uuid, $2::date, $3::uuid, $4::bigint, $5::bigint, $6::bigint, 'qbo_import', $7, $8, $9::uuid, $9::uuid)
        ON CONFLICT (operating_company_id, as_of_date, account_id) WHERE status = 'staged'
        DO UPDATE SET
          amount_cents = EXCLUDED.amount_cents,
          qbo_snapshot_cents = EXCLUDED.qbo_snapshot_cents,
          adjustment_cents = EXCLUDED.adjustment_cents,
          source = 'qbo_import',
          source_account_label = EXCLUDED.source_account_label,
          note = EXCLUDED.note,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
        RETURNING id::text
      `,
      [
        operatingCompanyId,
        period.as_of_date,
        match.id,
        amountCents,
        snapshotCents,
        priorAdjustment,
        `${line.qbo_account_name} (matched via ${strategy})`,
        note,
        actorUserId,
      ]
    );
    if (res.rows[0]) staged += 1;
  }

  const mapped = fixtureLines.length - unmapped.length;

  await insertAuditEvent(client, {
    operatingCompanyId,
    asOfDate: period.as_of_date,
    eventType: "import_staged",
    actorUserId,
    after: { source: "fixture_clone_as_is", staged, mapped, unmapped: unmapped.length },
    detail: `Clone-as-is fixture import (${typeof fixtureSource === "string" ? fixtureSource : "inline lines"}) staged ${staged} of ${fixtureLines.length} lines`,
  });

  return {
    as_of_date: period.as_of_date,
    company_code: company.code,
    staged_count: staged,
    mapped_count: mapped,
    unmapped,
  };
}

/**
 * Martin's tracking flag. Advisory ONLY since 2026-07-29 — setting or clearing it no longer changes
 * whether a commit is accepted (computeCommitBlockers no longer reads it). Kept because it is still
 * useful information ("has the accountant finished this period's cleanup") and because dropping the
 * table/audit trail would be a delete, not an add (07-never-delete-only-add). Still fully audited both
 * directions.
 */
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
      ? "source period marked FINAL (advisory only — does not gate commit; owner ruling 2026-07-29)"
      : "source period marked NOT final (advisory only — does not gate commit; owner ruling 2026-07-29)",
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

export type ObCommitOptions = {
  /**
   * System clone-as-is path ONLY (cloneAsIsImportAndCommit). Skips maker≠checker — there is no second
   * human in that loop by construction. Every other check (balance, OBE, account type, staged-lines)
   * still applies unchanged. NEVER set this from a route driven by an end-user click.
   */
  bypassMakerChecker?: boolean;
};

/**
 * Commit the reviewed register onto catalogs.accounts.
 *
 * Since 2026-07-29 (owner ruling) this NO LONGER refuses on "source not final" — there is no finality
 * gate. It still refuses — with an audited `commit_refused` event — when there are no staged lines,
 * the register does not balance, Opening Balance Equity has not been reclassed, a staged line sits on
 * a non-balance-sheet account, or (for a human commit) the checker is also a maker. There is no
 * override for any of those: a refused commit writes nothing.
 *
 * A refusal RETURNS `{ committed: false, blockers }`; it does not throw. That is deliberate and it
 * is the whole reason the refusal is auditable: the routes run this inside withCompanyScope, which
 * ROLLBACKs the transaction on a thrown error — so a thrown refusal would take its own
 * `commit_refused` audit row down with it and no one could ever prove the attempt happened. A refused
 * commit is an expected business outcome, not an exception. The route maps it to HTTP 409.
 * (`ObRegisterError` is still thrown for genuine faults: unknown company, cross-entity account, no
 * QBO realm — none of those need to survive as an audit row.)
 */
export async function commitObRegister(
  client: DbClient,
  operatingCompanyId: string,
  checkerUserId: string,
  opts: ObCommitOptions = {}
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
    totals,
    makers,
    checkerUserId: opts.bypassMakerChecker ? null : checkerUserId,
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
        bypass_maker_checker: Boolean(opts.bypassMakerChecker),
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
               opening_balance_as_of = $2::date,
               opening_balance_qbo_snapshot_cents = $3::bigint,
               opening_balance_adjustment_cents = $4::bigint
         WHERE id = $5::uuid
           AND operating_company_id = $6::uuid
           AND deactivated_at IS NULL
        RETURNING id::text
      `,
      [line.amount_cents, period.as_of_date, line.qbo_snapshot_cents, line.adjustment_cents, line.account_id, operatingCompanyId]
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
      after: {
        opening_balance_cents: line.amount_cents,
        opening_balance_as_of: period.as_of_date,
        qbo_snapshot_cents: line.qbo_snapshot_cents,
        adjustment_cents: line.adjustment_cents,
        bypass_maker_checker: Boolean(opts.bypassMakerChecker),
      },
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

export type ObCloneAsIsResult = {
  as_of_date: string;
  company_code: string;
  import_source: "qbo" | "fixture";
  staged_count: number;
  mapped_count: number;
  unmapped: Array<{ reason: string; [key: string]: unknown }>;
  commit: ObCommitResult;
};

/**
 * The owner-ordered one-time (and re-runnable) system action: import the QBO/fixture snapshot AND
 * commit it as the opening balance immediately, Adjustment 0, no human maker/checker pair required.
 *
 * Source preference: a live QBO connection wins if present (importObRegisterFromQbo); otherwise, for
 * TRANSP only, falls back to the owner-provided clone-as-is fixture (importObRegisterFromFixture).
 * TRK/USMCA with neither a QBO connection nor a fixture refuse honestly — never invented.
 *
 * The commit that follows is NOT a rubber stamp: it still runs every data-integrity check
 * (balance, OBE, account type) via commitObRegister — only maker≠checker is bypassed, because a
 * system action has no second human by construction. If the imported set does not balance (for
 * example: some fixture lines could not be mapped to a live account — see importObRegisterFromFixture),
 * the commit legitimately refuses and this function reports that refusal, not a forced write.
 */
export async function cloneAsIsImportAndCommit(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string
): Promise<ObCloneAsIsResult> {
  const { company } = await resolveObRegisterPeriod(client, operatingCompanyId);

  let importSource: "qbo" | "fixture";
  let staged_count: number;
  let mapped_count: number;
  let unmapped: Array<{ reason: string; [key: string]: unknown }>;

  if (await qboConnectionPresent(client, operatingCompanyId)) {
    importSource = "qbo";
    const result = await importObRegisterFromQbo(client, operatingCompanyId, actorUserId);
    staged_count = result.staged_count;
    mapped_count = result.mapped_count;
    unmapped = result.unmapped;
  } else if (company.code === "TRANSP") {
    importSource = "fixture";
    const result = await importObRegisterFromFixture(client, operatingCompanyId, actorUserId);
    staged_count = result.staged_count;
    mapped_count = result.mapped_count;
    unmapped = result.unmapped;
  } else {
    throw new ObRegisterError(
      "clone_as_is_no_source",
      `no QBO connection and no clone-as-is fixture available for ${company.code}`,
      409,
      { company_code: company.code }
    );
  }

  const commit = await commitObRegister(client, operatingCompanyId, actorUserId, { bypassMakerChecker: true });

  return {
    as_of_date: commit.as_of_date,
    company_code: company.code,
    import_source: importSource,
    staged_count,
    mapped_count,
    unmapped,
    commit,
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
