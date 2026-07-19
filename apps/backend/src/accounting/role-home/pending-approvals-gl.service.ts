/**
 * 0280-15 — Pending journal approvals ↔ GL linkage (read-only).
 *
 * FORENSIC (migrations, no Neon guess):
 *   - `accounting.journal_entries` (0092) status CHECK is only ('posted','voided').
 *     No approval_status / draft / pending-post vocabulary exists.
 *   - No migrated period-close warning table exists — NEVER invent or query one.
 *   - Reversal linkage (202607340000): reverses_je_id / reversed_by_je_id.
 *   - Void columns (0092): voided_at / voided_by_user_id / status='voided'.
 *
 * Therefore journal-approval control is schema-unavailable until a future owner
 * migration adds a canonical approval record. This endpoint must NOT invent
 * approvals from phantom tables or fabricate Owner/Administrator role checkers.
 *
 * Honest contract when capability is absent:
 *   control_available: false
 *   pending_journal_approvals: 0
 *   exceptions: [{ code: "approval_control_unavailable", ... }]
 *
 * No posting, mutation, schema DDL, or new GL math.
 */

import { withCompanyScope } from "../shared.js";

/** Exception codes returned when structure/assignment/capability is missing. */
export type PendingApprovalExceptionCode =
  | "approval_control_unavailable"
  | "assignment_unresolved"
  | "required_structure_unavailable";

export type PendingApprovalKind =
  | "journal_approval"
  | "approval_control_unavailable"
  | "excluded_voided_or_reversed";

export type GovernedAccountRef = {
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  coa_role: string | null;
  debit_cents: number;
  credit_cents: number;
};

export type PendingApprovalActor = {
  /** Canonical user id from schema, or null when only a role column is populated. */
  user_id: string | null;
  role: string | null;
};

export type PendingApprovalException = {
  code: PendingApprovalExceptionCode;
  message: string;
};

export type PendingApprovalItem = {
  kind: PendingApprovalKind;
  journal_entry_id: string | null;
  /** Server-held display token only — never frontend-composed. */
  journal_display_id: string | null;
  status: string | null;
  risk: string | null;
  reason: string | null;
  amounts_balanced: boolean;
  debit_total_cents: number;
  credit_total_cents: number;
  governed_accounts: GovernedAccountRef[];
  creator: PendingApprovalActor | null;
  required_approver: PendingApprovalActor | null;
  /** True when creator user_id equals required approver user_id (both non-null). */
  maker_checker_violation: boolean;
  /** Present when required approver cannot be resolved from canonical columns. */
  assignment_exception: PendingApprovalException | null;
  forward_drill: {
    journal_entry_id: string | null;
    href: string | null;
  };
  /**
   * Reverse drill only when a consumer route actually reads the parameter.
   * JournalEntryDetailPage consumes `:id` path only — no warning_id / query params.
   */
  reverse_drill: {
    journal_entry_id: string | null;
    href: string | null;
  };
  entry_date: string | null;
  created_at: string | null;
  voided: boolean;
  reversed: boolean;
  operating_company_id: string;
};

export type PendingApprovalsGlResult = {
  items: PendingApprovalItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  /** Linked pending journal approvals only (never voided/reversed; never invented). */
  pending_journal_approvals: number;
  /** False when migrated schema has no JE approval-capable record. */
  control_available: boolean;
  exceptions: PendingApprovalException[];
};

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Approval-status columns proven in migrations for accounting.journal_entries.
 * FORENSIC (0092 + follow-ons): EMPTY — status CHECK is only ('posted','voided').
 * Do not add a name here until an owner migration ships that column in the same change.
 */
const MIGRATED_JE_APPROVAL_STATUS_COLUMNS = new Set<string>();

/** Approver columns proven in migrations on journal_entries — also empty today. */
const MIGRATED_JE_APPROVER_USER_COLUMNS = new Set<string>();
const MIGRATED_JE_APPROVER_ROLE_COLUMNS = new Set<string>();

/** Pending-like status tokens — only meaningful if an approval_status column exists. */
const PENDING_APPROVAL_STATUSES = new Set([
  "pending",
  "needs_review",
  "awaiting_approval",
  "submitted",
]);

export type JeApprovalCapability = {
  journal_entries_present: boolean;
  postings_present: boolean;
  /** Column on journal_entries that carries approval workflow state, if any. */
  approval_status_column: string | null;
  approver_user_column: string | null;
  approver_role_column: string | null;
  has_voided_at: boolean;
  has_reverses_je_id: boolean;
  has_reversed_by_je_id: boolean;
  has_created_at: boolean;
  has_created_by_user_id: boolean;
  control_available: boolean;
  unavailable_reason: PendingApprovalExceptionCode | null;
  message: string;
};

async function tableExists(client: QueryableClient, regclass: string): Promise<boolean> {
  const res = await client.query<{ ok?: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [regclass]);
  return Boolean(res.rows[0]?.ok);
}

async function listColumns(client: QueryableClient, schema: string, table: string): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [schema, table]
  );
  return new Set(res.rows.map((r) => r.column_name));
}

function firstPresent(cols: Set<string>, candidates: readonly string[]): string | null {
  for (const c of candidates) {
    if (cols.has(c)) return c;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asCents(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** Direct detail route — matches ManualJEListPage / EntityLink / JournalEntryDetailPage. */
export function journalEntryDetailHref(journalEntryId: string): string {
  return `/accounting/journal-entries/${encodeURIComponent(journalEntryId)}`;
}

/**
 * Voided or reversing/reversed originals must not inflate pending.
 * Uses only proven columns when present on the row snapshot.
 */
export function isJeExcludedFromPendingQueue(row: {
  status?: string | null;
  voided_at?: string | null;
  reverses_je_id?: string | null;
  reversed_by_je_id?: string | null;
}): { excluded: boolean; reason: string | null } {
  if (asText(row.voided_at)) {
    return { excluded: true, reason: "voided_at_set" };
  }
  if ((asText(row.status) ?? "").toLowerCase() === "voided") {
    return { excluded: true, reason: "status_voided" };
  }
  if (asText(row.reverses_je_id)) {
    return { excluded: true, reason: "reversing_entry" };
  }
  if (asText(row.reversed_by_je_id)) {
    return { excluded: true, reason: "already_reversed" };
  }
  return { excluded: false, reason: null };
}

/**
 * Required approver from canonical columns only.
 * Never invents Owner / Administrator / synthetic role placeholders.
 */
export function resolveRequiredApprover(input: {
  approverUserId: string | null;
  approverRole: string | null;
  creatorUserId: string | null;
}): {
  actor: PendingApprovalActor | null;
  maker_checker_violation: boolean;
  assignment_exception: PendingApprovalException | null;
} {
  const userId = asText(input.approverUserId);
  const role = asText(input.approverRole);

  if (!userId && !role) {
    return {
      actor: null,
      maker_checker_violation: false,
      assignment_exception: {
        code: "assignment_unresolved",
        message:
          "No canonical required_approver_user_id or required_approver_role on the approval record.",
      },
    };
  }

  const makerChecker = Boolean(userId && input.creatorUserId && userId === input.creatorUserId);
  return {
    actor: { user_id: userId, role },
    maker_checker_violation: makerChecker,
    assignment_exception: null,
  };
}

/**
 * Probe migrated JE tables for approval-capable columns.
 * Control is available only when an approval-status column exists on journal_entries
 * (none in current migrations — forensic from 0092 status CHECK).
 */
export async function probeJeApprovalCapability(client: QueryableClient): Promise<JeApprovalCapability> {
  const journalEntriesPresent = await tableExists(client, "accounting.journal_entries");
  const postingsPresent = await tableExists(client, "accounting.journal_entry_postings");

  if (!journalEntriesPresent) {
    return {
      journal_entries_present: false,
      postings_present: postingsPresent,
      approval_status_column: null,
      approver_user_column: null,
      approver_role_column: null,
      has_voided_at: false,
      has_reverses_je_id: false,
      has_reversed_by_je_id: false,
      has_created_at: false,
      has_created_by_user_id: false,
      control_available: false,
      unavailable_reason: "required_structure_unavailable",
      message:
        "accounting.journal_entries is not present — cannot evaluate journal approval control.",
    };
  }

  const cols = await listColumns(client, "accounting", "journal_entries");
  if (!cols.has("id") || !cols.has("operating_company_id")) {
    return {
      journal_entries_present: true,
      postings_present: postingsPresent,
      approval_status_column: null,
      approver_user_column: null,
      approver_role_column: null,
      has_voided_at: cols.has("voided_at"),
      has_reverses_je_id: cols.has("reverses_je_id"),
      has_reversed_by_je_id: cols.has("reversed_by_je_id"),
      has_created_at: cols.has("created_at"),
      has_created_by_user_id: cols.has("created_by_user_id"),
      control_available: false,
      unavailable_reason: "required_structure_unavailable",
      message:
        "accounting.journal_entries lacks required id/operating_company_id structure for entity-scoped approval reads.",
    };
  }

  // Only migration-proven approval columns — never activate on unmigrated prod drift.
  const approvalStatusColumn = firstPresent(cols, [...MIGRATED_JE_APPROVAL_STATUS_COLUMNS]);
  const approverUserColumn = firstPresent(cols, [...MIGRATED_JE_APPROVER_USER_COLUMNS]);
  const approverRoleColumn = firstPresent(cols, [...MIGRATED_JE_APPROVER_ROLE_COLUMNS]);

  if (!approvalStatusColumn) {
    return {
      journal_entries_present: true,
      postings_present: postingsPresent,
      approval_status_column: null,
      approver_user_column: approverUserColumn,
      approver_role_column: approverRoleColumn,
      has_voided_at: cols.has("voided_at"),
      has_reverses_je_id: cols.has("reverses_je_id"),
      has_reversed_by_je_id: cols.has("reversed_by_je_id"),
      has_created_at: cols.has("created_at"),
      has_created_by_user_id: cols.has("created_by_user_id"),
      control_available: false,
      unavailable_reason: "approval_control_unavailable",
      message:
        "Migrated accounting.journal_entries has no approval-status column (status is posted|voided only). " +
        "No canonical journal-approval record exists — control_available=false.",
    };
  }

  return {
    journal_entries_present: true,
    postings_present: postingsPresent,
    approval_status_column: approvalStatusColumn,
    approver_user_column: approverUserColumn,
    approver_role_column: approverRoleColumn,
    has_voided_at: cols.has("voided_at"),
    has_reverses_je_id: cols.has("reverses_je_id"),
    has_reversed_by_je_id: cols.has("reversed_by_je_id"),
    has_created_at: cols.has("created_at"),
    has_created_by_user_id: cols.has("created_by_user_id"),
    control_available: true,
    unavailable_reason: null,
    message: "Journal approval control available via journal_entries approval-status column.",
  };
}

type JeCandidateRow = {
  id: string;
  status: string | null;
  approval_status: string | null;
  entry_date: string | null;
  created_at: string | null;
  memo: string | null;
  created_by_user_id: string | null;
  qbo_journal_entry_id: string | null;
  display_id: string | null;
  voided_at: string | null;
  reverses_je_id: string | null;
  reversed_by_je_id: string | null;
  required_approver_user_id: string | null;
  required_approver_role: string | null;
};

async function loadPendingApprovalCandidates(
  client: QueryableClient,
  operatingCompanyId: string,
  capability: JeApprovalCapability
): Promise<JeCandidateRow[]> {
  if (!capability.control_available || !capability.approval_status_column) return [];

  const cols = await listColumns(client, "accounting", "journal_entries");
  const statusCol = capability.approval_status_column;
  const displaySelect = cols.has("display_id") ? "display_id::text" : "NULL::text";
  const qboSelect = cols.has("qbo_journal_entry_id") ? "qbo_journal_entry_id::text" : "NULL::text";
  const voidedSelect = capability.has_voided_at ? "voided_at::text" : "NULL::text";
  const reversesSelect = capability.has_reverses_je_id ? "reverses_je_id::text" : "NULL::text";
  const reversedBySelect = capability.has_reversed_by_je_id ? "reversed_by_je_id::text" : "NULL::text";
  const creatorSelect = capability.has_created_by_user_id ? "created_by_user_id::text" : "NULL::text";
  const memoSelect = cols.has("memo") ? "memo::text" : "NULL::text";
  const entryStatusSelect = cols.has("status") ? "status::text" : "NULL::text";
  const dateSelect = cols.has("entry_date") ? "entry_date::text" : "NULL::text";
  const createdAtSelect = capability.has_created_at ? "created_at::text" : "NULL::text";
  const approverUserSelect = capability.approver_user_column
    ? `${capability.approver_user_column}::text`
    : "NULL::text";
  const approverRoleSelect = capability.approver_role_column
    ? `${capability.approver_role_column}::text`
    : "NULL::text";

  // Deterministic: created_at ASC NULLS LAST, then id ASC.
  const orderBy = capability.has_created_at
    ? "created_at ASC NULLS LAST, id ASC"
    : "id ASC";

  const res = await client.query<{
    id: string;
    status: string | null;
    approval_status: string | null;
    entry_date: string | null;
    created_at: string | null;
    memo: string | null;
    created_by_user_id: string | null;
    qbo_journal_entry_id: string | null;
    display_id: string | null;
    voided_at: string | null;
    reverses_je_id: string | null;
    reversed_by_je_id: string | null;
    required_approver_user_id: string | null;
    required_approver_role: string | null;
  }>(
    `
      SELECT
        id::text AS id,
        ${entryStatusSelect} AS status,
        ${statusCol}::text AS approval_status,
        ${dateSelect} AS entry_date,
        ${createdAtSelect} AS created_at,
        ${memoSelect} AS memo,
        ${creatorSelect} AS created_by_user_id,
        ${qboSelect} AS qbo_journal_entry_id,
        ${displaySelect} AS display_id,
        ${voidedSelect} AS voided_at,
        ${reversesSelect} AS reverses_je_id,
        ${reversedBySelect} AS reversed_by_je_id,
        ${approverUserSelect} AS required_approver_user_id,
        ${approverRoleSelect} AS required_approver_role
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid
      ORDER BY ${orderBy}
    `,
    [operatingCompanyId]
  );

  return res.rows
    .map((r) => ({
      id: r.id,
      status: asText(r.status),
      approval_status: asText(r.approval_status),
      entry_date: asText(r.entry_date),
      created_at: asText(r.created_at),
      memo: asText(r.memo),
      created_by_user_id: asText(r.created_by_user_id),
      qbo_journal_entry_id: asText(r.qbo_journal_entry_id),
      display_id: asText(r.display_id) ?? asText(r.qbo_journal_entry_id),
      voided_at: asText(r.voided_at),
      reverses_je_id: asText(r.reverses_je_id),
      reversed_by_je_id: asText(r.reversed_by_je_id),
      required_approver_user_id: asText(r.required_approver_user_id),
      required_approver_role: asText(r.required_approver_role),
    }))
    .filter((r) => {
      const token = (r.approval_status ?? "").toLowerCase();
      return PENDING_APPROVAL_STATUSES.has(token);
    });
}

type PostingAgg = {
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  debit_cents: number;
  credit_cents: number;
  coa_role: string | null;
};

async function loadPostingsByJournal(
  client: QueryableClient,
  operatingCompanyId: string,
  journalEntryIds: string[]
): Promise<Map<string, { debit_total_cents: number; credit_total_cents: number; accounts: PostingAgg[] }>> {
  const map = new Map<string, { debit_total_cents: number; credit_total_cents: number; accounts: PostingAgg[] }>();
  if (!journalEntryIds.length) return map;
  if (!(await tableExists(client, "accounting.journal_entry_postings"))) return map;

  const hasAccounts = await tableExists(client, "catalogs.accounts");
  const hasRoles = await tableExists(client, "accounting.chart_of_accounts_roles");
  const acctCols = hasAccounts ? await listColumns(client, "catalogs", "accounts") : new Set<string>();
  const numberSelect = acctCols.has("account_number") ? "a.account_number::text" : "NULL::text";
  const nameSelect = acctCols.has("account_name")
    ? "a.account_name::text"
    : acctCols.has("name")
      ? "a.name::text"
      : "NULL::text";

  const roleJoin = hasRoles
    ? `
      LEFT JOIN accounting.chart_of_accounts_roles car
        ON car.account_id = p.account_id
       AND car.operating_company_id = p.operating_company_id
       AND COALESCE(car.is_active, true) = true
    `
    : "";
  const roleSelect = hasRoles ? "car.role::text" : "NULL::text";

  const acctJoin = hasAccounts
    ? `
      LEFT JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND (a.operating_company_id IS NULL OR a.operating_company_id = p.operating_company_id)
    `
    : "";

  const res = await client.query<{
    journal_entry_uuid: string;
    account_id: string;
    account_number: string | null;
    account_name: string | null;
    debit_cents: string | number;
    credit_cents: string | number;
    coa_role: string | null;
  }>(
    `
      SELECT
        p.journal_entry_uuid::text AS journal_entry_uuid,
        p.account_id::text AS account_id,
        MAX(${hasAccounts ? numberSelect : "NULL::text"}) AS account_number,
        MAX(${hasAccounts ? nameSelect : "NULL::text"}) AS account_name,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS debit_cents,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS credit_cents,
        MAX(${roleSelect}) AS coa_role
      FROM accounting.journal_entry_postings p
      ${acctJoin}
      ${roleJoin}
      WHERE p.operating_company_id = $1::uuid
        AND p.journal_entry_uuid = ANY($2::uuid[])
      GROUP BY p.journal_entry_uuid, p.account_id
      ORDER BY p.journal_entry_uuid, p.account_id
    `,
    [operatingCompanyId, journalEntryIds]
  );

  for (const row of res.rows) {
    const jeId = row.journal_entry_uuid;
    let bucket = map.get(jeId);
    if (!bucket) {
      bucket = { debit_total_cents: 0, credit_total_cents: 0, accounts: [] };
      map.set(jeId, bucket);
    }
    const debit = asCents(row.debit_cents);
    const credit = asCents(row.credit_cents);
    bucket.debit_total_cents += debit;
    bucket.credit_total_cents += credit;
    bucket.accounts.push({
      account_id: row.account_id,
      account_number: asText(row.account_number),
      account_name: asText(row.account_name),
      debit_cents: debit,
      credit_cents: credit,
      coa_role: asText(row.coa_role),
    });
  }
  return map;
}

async function loadUserRoles(
  client: QueryableClient,
  userIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!userIds.length) return map;
  if (!(await tableExists(client, "identity.users"))) return map;

  // id + role ONLY — never email/phone (PII).
  const res = await client.query<{ id: string; role: string | null }>(
    `
      SELECT id::text AS id, role::text AS role
      FROM identity.users
      WHERE id = ANY($1::uuid[])
    `,
    [userIds]
  );
  for (const row of res.rows) {
    map.set(row.id, asText(row.role));
  }
  return map;
}

/** Build a queue item from a candidate JE + postings (exported for focused unit tests). */
export function buildApprovalItemFromCandidate(input: {
  operatingCompanyId: string;
  candidate: JeCandidateRow;
  postings: { debit_total_cents: number; credit_total_cents: number; accounts: PostingAgg[] } | null;
  userRoles: Map<string, string | null>;
}): PendingApprovalItem {
  const { candidate, postings, userRoles, operatingCompanyId } = input;
  const exclusion = isJeExcludedFromPendingQueue(candidate);
  const voided =
    Boolean(candidate.voided_at) || (candidate.status ?? "").toLowerCase() === "voided";
  const reversed = Boolean(candidate.reverses_je_id || candidate.reversed_by_je_id);

  const debit = postings?.debit_total_cents ?? 0;
  const credit = postings?.credit_total_cents ?? 0;
  const balanced = !exclusion.excluded && debit === credit && debit > 0;

  const creatorUserId = candidate.created_by_user_id;
  const creatorRole = creatorUserId ? (userRoles.get(creatorUserId) ?? null) : null;
  const creator: PendingApprovalActor | null = creatorUserId
    ? { user_id: creatorUserId, role: creatorRole }
    : null;

  const approver = resolveRequiredApprover({
    approverUserId: candidate.required_approver_user_id,
    approverRole: candidate.required_approver_role,
    creatorUserId,
  });

  const governed = (postings?.accounts ?? [])
    .filter((a) => a.coa_role != null)
    .map((a) => ({
      account_id: a.account_id,
      account_number: a.account_number,
      account_name: a.account_name,
      coa_role: a.coa_role,
      debit_cents: a.debit_cents,
      credit_cents: a.credit_cents,
    }));
  const affected =
    governed.length > 0
      ? governed
      : (postings?.accounts ?? []).map((a) => ({
          account_id: a.account_id,
          account_number: a.account_number,
          account_name: a.account_name,
          coa_role: a.coa_role,
          debit_cents: a.debit_cents,
          credit_cents: a.credit_cents,
        }));

  const href = journalEntryDetailHref(candidate.id);

  return {
    kind: exclusion.excluded ? "excluded_voided_or_reversed" : "journal_approval",
    journal_entry_id: candidate.id,
    journal_display_id: candidate.display_id,
    status: candidate.approval_status ?? candidate.status,
    risk: exclusion.excluded ? exclusion.reason : "pending_approval",
    reason: exclusion.excluded
      ? `Excluded from pending queue: ${exclusion.reason}`
      : candidate.memo,
    amounts_balanced: balanced,
    debit_total_cents: debit,
    credit_total_cents: credit,
    governed_accounts: affected,
    creator,
    required_approver: approver.actor,
    maker_checker_violation: approver.maker_checker_violation,
    assignment_exception: approver.assignment_exception,
    forward_drill: {
      journal_entry_id: candidate.id,
      href,
    },
    reverse_drill: {
      journal_entry_id: candidate.id,
      href,
    },
    entry_date: candidate.entry_date,
    created_at: candidate.created_at,
    voided,
    reversed,
    operating_company_id: operatingCompanyId,
  };
}

function controlUnavailableResult(
  capability: JeApprovalCapability,
  limit: number,
  offset: number
): PendingApprovalsGlResult {
  const code = capability.unavailable_reason ?? "approval_control_unavailable";
  const exception: PendingApprovalException = {
    code,
    message: capability.message,
  };
  const item: PendingApprovalItem = {
    kind: "approval_control_unavailable",
    journal_entry_id: null,
    journal_display_id: null,
    status: null,
    risk: code,
    reason: capability.message,
    amounts_balanced: false,
    debit_total_cents: 0,
    credit_total_cents: 0,
    governed_accounts: [],
    creator: null,
    required_approver: null,
    maker_checker_violation: false,
    assignment_exception: exception,
    forward_drill: { journal_entry_id: null, href: null },
    reverse_drill: { journal_entry_id: null, href: null },
    entry_date: null,
    created_at: null,
    voided: false,
    reversed: false,
    operating_company_id: "",
  };

  return {
    items: [item],
    total: 1,
    limit,
    offset,
    has_more: false,
    pending_journal_approvals: 0,
    control_available: false,
    exceptions: [exception],
  };
}

/**
 * Build the pending-approvals GL read model inside an already-scoped client.
 * Exported for unit tests (inject a mock QueryableClient).
 */
export async function buildPendingApprovalsGl(
  client: QueryableClient,
  operatingCompanyId: string,
  opts: {
    limit?: number;
    offset?: number;
    /** Test-only: inject a capability snapshot (never used by production routes). */
    capabilityOverride?: JeApprovalCapability;
  } = {}
): Promise<PendingApprovalsGlResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const capability = opts.capabilityOverride ?? (await probeJeApprovalCapability(client));
  if (!capability.control_available) {
    const result = controlUnavailableResult(capability, limit, offset);
    result.items[0] = {
      ...result.items[0]!,
      operating_company_id: operatingCompanyId,
    };
    return result;
  }

  const candidates = await loadPendingApprovalCandidates(client, operatingCompanyId, capability);
  const ids = candidates.map((c) => c.id);
  const postings = await loadPostingsByJournal(client, operatingCompanyId, ids);

  const userIds = new Set<string>();
  for (const c of candidates) {
    if (c.created_by_user_id) userIds.add(c.created_by_user_id);
    if (c.required_approver_user_id) userIds.add(c.required_approver_user_id);
  }
  const userRoles = await loadUserRoles(client, Array.from(userIds));

  const allItems = candidates.map((candidate) =>
    buildApprovalItemFromCandidate({
      operatingCompanyId,
      candidate,
      postings: postings.get(candidate.id) ?? null,
      userRoles,
    })
  );

  // Pending KPI: journal_approval only (voided/reversed classified separately and excluded).
  const pendingItems = allItems.filter((i) => i.kind === "journal_approval");
  const page = pendingItems.slice(offset, offset + limit);

  const exceptions: PendingApprovalException[] = [];
  for (const item of pendingItems) {
    if (item.assignment_exception) {
      exceptions.push(item.assignment_exception);
    }
  }

  return {
    items: page,
    total: pendingItems.length,
    limit,
    offset,
    has_more: offset + page.length < pendingItems.length,
    pending_journal_approvals: pendingItems.length,
    control_available: true,
    exceptions,
  };
}

export async function getPendingApprovalsGl(input: {
  userId: string;
  operating_company_id: string;
  limit?: number;
  offset?: number;
}): Promise<PendingApprovalsGlResult> {
  return withCompanyScope(input.userId, input.operating_company_id, (client) =>
    buildPendingApprovalsGl(client, input.operating_company_id, {
      limit: input.limit,
      offset: input.offset,
    })
  );
}

/** Scalar count for Accounting Home KPI — linked pending journal approvals only. */
export async function countPendingJournalApprovals(
  client: QueryableClient,
  operatingCompanyId: string
): Promise<number> {
  const result = await buildPendingApprovalsGl(client, operatingCompanyId, { limit: 1, offset: 0 });
  return result.pending_journal_approvals;
}
