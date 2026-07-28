import { appendCrudAudit } from "../audit/crud-audit.js";

/**
 * ACCT-R-03 — a real Chart-of-Accounts merge (blueprint MUST 3.18.4.3 / Catalogs §7.3).
 *
 * The COA list's "Merge accounts" button used to loop the DEACTIVATE endpoint over the source
 * accounts. That archives a row and nothing else: the source's child accounts keep pointing at an
 * archived parent, and every config pointer that DESIGNATES the source for future postings
 * (item default accounts, role bindings, COA role bindings, expense-category map, banking rules,
 * asset-class / loan / escrow bindings) keeps designating an account nobody can post to. No record of
 * the merge existed either, so a later reader could not tell a merge from a plain archive.
 *
 * This service is the root fix. It is deliberately split into two classes of pointer:
 *
 *   CONFIG pointers  — designate an account for FUTURE postings. These MUST follow the merge.
 *   HISTORY pointers — record a posted fact (journal_entry_postings, bill/invoice/expense lines,
 *                      settlement lines, bank transaction categorization). These MUST NOT move:
 *                      blueprint MUST 3.18.4.3 step 3 keeps the postings on the source, and
 *                      MUST 3.18.7.1 states "the system MUST NOT migrate historical postings to new
 *                      accounts; history is immutable". `migrate_historical_postings: true` is
 *                      therefore REFUSED (E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN) rather than silently
 *                      rewriting posted history — the conservative reading wins.
 *
 * No GL math is written here. Every statement is either an UPDATE of a config FK column, the
 * append-only merge record, or the source archive (void-not-delete).
 */

export type MergeQueryResult = { rows: Array<Record<string, unknown>>; rowCount?: number | null };
export type MergeClient = { query: (sql: string, values?: unknown[]) => Promise<MergeQueryResult> };

export class AccountMergeError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "AccountMergeError";
  }
}

/**
 * Config pointers that must follow a merged account. Every entry is entity-scoped: the UPDATE only
 * touches rows whose own operating_company_id equals the merge's entity, so a merge can never rewrite
 * another entity's configuration (the cross-entity class ACCT-LINK-04 / BANK-LINK-01 closed at the
 * schema layer). Tables/columns are probed before use, because several of these are conditional on
 * prod (af1 migration 202606272100 documents the same conditional set).
 */
export const CONFIG_REMOUNT_TARGETS: ReadonlyArray<{ schema: string; table: string; column: string }> = [
  // Child accounts get reparented onto the surviving account.
  { schema: "catalogs", table: "accounts", column: "parent_account_id" },
  { schema: "catalogs", table: "items", column: "default_income_account_id" },
  { schema: "catalogs", table: "items", column: "default_expense_account_id" },
  { schema: "catalogs", table: "account_role_bindings", column: "account_id" },
  { schema: "accounting", table: "chart_of_accounts_roles", column: "account_id" },
  { schema: "accounting", table: "expense_category_account_map", column: "account_id" },
  { schema: "accounting", table: "banking_rules", column: "then_account_id" },
  { schema: "accounting", table: "escrow_accounts", column: "coa_account_id" },
  { schema: "fixed_assets", table: "asset_classes", column: "default_asset_account_id" },
  { schema: "fixed_assets", table: "asset_classes", column: "default_accum_depr_account_id" },
  { schema: "fixed_assets", table: "asset_classes", column: "default_depr_expense_account_id" },
  { schema: "finance", table: "loans", column: "gl_liability_account_id" },
  { schema: "finance", table: "loans", column: "gl_interest_expense_account_id" },
  { schema: "finance", table: "loans", column: "payment_account_id" },
  { schema: "banking", table: "bank_accounts", column: "ledger_account_id" },
];

/**
 * Posted history. Listed so the refusal is explicit and reviewable rather than an unstated omission.
 */
export const HISTORY_POINTERS_NEVER_MOVED: ReadonlyArray<string> = [
  "accounting.journal_entry_postings.account_id",
  "accounting.bill_lines.account_id",
  "accounting.invoice_lines.account_id",
  "accounting.expense_lines.expense_account_uuid",
  "accounting.bill_payments.cc_account_id",
  "payroll.driver_settlement_line_items.posting_account_id",
  "banking.bank_transactions.suggested_account_id",
];

export const MERGE_REASON_MIN_LENGTH = 20;

export type MergeAccountsInput = {
  targetAccountId: string;
  sourceAccountIds: string[];
  operatingCompanyId: string;
  reason: string;
  migrateHistoricalPostings?: boolean;
};

export type MergedSourceResult = {
  merge_record_id: string;
  source_account_id: string;
  source_account_number: string | null;
  source_account_name: string | null;
  reparented_child_account_count: number;
  remounted_reference_counts: Record<string, number>;
  deactivated_at: string | null;
};

type AccountRow = {
  id: string;
  account_number: string | null;
  account_name: string | null;
  account_type: string;
  currency_code: string | null;
  is_locked: boolean | null;
  deactivated_at: string | null;
};

const ACCOUNT_COLS = "id, account_number, account_name, account_type, currency_code, is_locked, deactivated_at";

async function columnExists(client: MergeClient, schema: string, table: string, column: string) {
  const res = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      LIMIT 1`,
    [schema, table, column],
  );
  return res.rows.length > 0;
}

/**
 * Entity-scoped by an explicit predicate, not only by the RLS GUC. The route does set
 * app.operating_company_id and catalogs.accounts is FORCE RLS, but a merge re-points configuration
 * across nine tables: if the GUC were ever unset, mis-set, or the call reached here from a
 * bypass-capable session, an unscoped lookup would happily load ANOTHER entity's account and let it
 * become the survivor. The predicate makes the entity a precondition of the read instead of a
 * property of the surrounding session.
 */
async function loadAccount(
  client: MergeClient,
  id: string,
  operatingCompanyId: string,
): Promise<AccountRow | null> {
  const res = await client.query(
    `SELECT ${ACCOUNT_COLS} FROM catalogs.accounts WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
    [id, operatingCompanyId],
  );
  return (res.rows[0] as AccountRow | undefined) ?? null;
}

/**
 * Validates the merge request against blueprint MUST 3.18.4.3 step 2. Exported so the route and the
 * unit test exercise the SAME rules (a second copy of a rule is a rule that will disagree with itself).
 */
export function assertMergeCompatible(target: AccountRow, source: AccountRow) {
  if (source.id === target.id) {
    throw new AccountMergeError("E_MERGE_SOURCE_IS_TARGET", 400, { account_id: source.id });
  }
  if (source.account_type !== target.account_type) {
    // Task-facing code + blueprint 3.18.9 code, both surfaced so neither reader has to translate.
    throw new AccountMergeError("E_MERGE_ACCOUNT_TYPE_MISMATCH", 409, {
      spec_code: "E_ACCOUNT_MERGE_TYPE_MISMATCH",
      source_account_type: source.account_type,
      target_account_type: target.account_type,
    });
  }
  if ((source.currency_code ?? "USD") !== (target.currency_code ?? "USD")) {
    throw new AccountMergeError("E_MERGE_CURRENCY_MISMATCH", 409, {
      source_currency_code: source.currency_code,
      target_currency_code: target.currency_code,
    });
  }
  if (source.is_locked === true) {
    throw new AccountMergeError("E_MERGE_SOURCE_LOCKED", 423, { account_id: source.id });
  }
}

export function assertMergeReason(reason: string) {
  if (reason.trim().length < MERGE_REASON_MIN_LENGTH) {
    throw new AccountMergeError("E_VALIDATION", 400, {
      field: "reason",
      message: `required; minimum ${MERGE_REASON_MIN_LENGTH} characters for merge operations`,
    });
  }
}

export function assertHistoricalMigrationRefused(migrateHistoricalPostings: boolean | undefined) {
  if (migrateHistoricalPostings === true) {
    throw new AccountMergeError("E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN", 400, {
      spec: "IH35_MASTER_BLUEPRINT_v3_FULL MUST 3.18.7.1 / MUST 3.18.4.3 step 3",
      message:
        "historical postings stay on the source account; history is immutable. Re-posting or reclassifying " +
        "past entries is an owner-approved journal-entry action, not a side effect of a chart merge.",
      history_pointers_never_moved: HISTORY_POINTERS_NEVER_MOVED,
    });
  }
}

/**
 * Runs the whole merge inside the CALLER's transaction/client (lockstep): every remount, the merge
 * record, the archive and the audit rows commit together or not at all. The caller is responsible for
 * having set app.operating_company_id and asserted membership.
 */
export async function mergeAccountsOnClient(
  client: MergeClient,
  input: MergeAccountsInput,
  actorUserId: string,
): Promise<{ target: AccountRow; merged: MergedSourceResult[] }> {
  assertMergeReason(input.reason);
  assertHistoricalMigrationRefused(input.migrateHistoricalPostings);

  if (input.sourceAccountIds.length === 0) {
    throw new AccountMergeError("E_VALIDATION", 400, { field: "source_account_ids", message: "at least one required" });
  }

  // KR-03 — fail closed BEFORE any remount/archive. catalogs.account_merge_records is created only by
  // HELD migration 202608060000 (to_regclass=NULL on prod 2026-07-27). An unguarded INSERT is a live
  // 42P01 on every merge attempt; mirror #3662 honest-503 until owner Neon-applies.
  {
    const reg = await client.query(
      `SELECT to_regclass($1::text) IS NOT NULL AS ok`,
      ["catalogs.account_merge_records"],
    );
    const present = Boolean((reg.rows[0] as { ok?: boolean } | undefined)?.ok);
    if (!present) {
      throw new AccountMergeError("E_MERGE_SCHEMA_NOT_APPLIED", 503, {
        relation: "catalogs.account_merge_records",
        migration: "202608060000_acct_r03_catalogs_account_merge_records.sql",
        message:
          "CoA merge audit table is not on this database yet. Owner must Neon-apply 202608060000 before merge can run.",
      });
    }
  }

  const target = await loadAccount(client, input.targetAccountId, input.operatingCompanyId);
  if (!target) throw new AccountMergeError("E_MERGE_TARGET_NOT_FOUND", 404, { account_id: input.targetAccountId });
  if (target.deactivated_at !== null) {
    throw new AccountMergeError("E_MERGE_TARGET_ARCHIVED", 409, { account_id: target.id });
  }

  // Probe once per request, not once per source.
  const liveTargets: Array<{ schema: string; table: string; column: string }> = [];
  for (const t of CONFIG_REMOUNT_TARGETS) {
    if (await columnExists(client, t.schema, t.table, t.column)) liveTargets.push(t);
  }

  const merged: MergedSourceResult[] = [];

  for (const sourceId of input.sourceAccountIds) {
    const source = await loadAccount(client, sourceId, input.operatingCompanyId);
    // RLS already restricts the read to the active entity, so "not found" here IS "not in this entity".
    if (!source) throw new AccountMergeError("E_MERGE_SOURCE_NOT_FOUND", 404, { account_id: sourceId });
    assertMergeCompatible(target, source);

    const remounted: Record<string, number> = {};
    let reparentedChildren = 0;

    for (const t of liveTargets) {
      const qualified = `${t.schema}.${t.table}.${t.column}`;
      const res = await client.query(
        `UPDATE ${t.schema}.${t.table}
            SET ${t.column} = $1
          WHERE ${t.column} = $2
            AND operating_company_id = $3`,
        [target.id, source.id, input.operatingCompanyId],
      );
      const count = res.rowCount ?? 0;
      if (count > 0) remounted[qualified] = count;
      if (t.schema === "catalogs" && t.table === "accounts" && t.column === "parent_account_id") {
        reparentedChildren = count;
      }
    }

    const recordRes = await client.query(
      `INSERT INTO catalogs.account_merge_records (
         operating_company_id, source_account_id, target_account_id, reason,
         migrate_historical_postings, reparented_child_account_count, remounted_reference_counts,
         source_account_number, source_account_name, target_account_number, target_account_name,
         account_type, merged_by_user_id
       ) VALUES ($1,$2,$3,$4,false,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
       RETURNING id, merged_at`,
      [
        input.operatingCompanyId,
        source.id,
        target.id,
        input.reason.trim(),
        reparentedChildren,
        JSON.stringify(remounted),
        source.account_number,
        source.account_name,
        target.account_number,
        target.account_name,
        target.account_type,
        actorUserId,
      ],
    );
    const record = recordRes.rows[0] as { id: string; merged_at: string };

    // void-not-delete: the source account exists forever, it just stops accepting new postings
    // (MUST 3.18.4.4). is_postable=false is what keeps it out of every posting-target picker.
    const archived = await client.query(
      `UPDATE catalogs.accounts
          SET deactivated_at = COALESCE(deactivated_at, now()),
              is_postable = false,
              updated_by_user_id = $2
        WHERE id = $1
        RETURNING deactivated_at`,
      [source.id, actorUserId],
    );

    await appendCrudAudit(
      client,
      actorUserId,
      "catalogs.account_merged",
      {
        resource_id: source.id,
        resource_type: "catalogs.accounts",
        spec_event: "accounting.account_merged",
        merge_record_id: record.id,
        operating_company_id: input.operatingCompanyId,
        source_account_id: source.id,
        source_account_number: source.account_number,
        target_account_id: target.id,
        target_account_number: target.account_number,
        account_type: target.account_type,
        reason: input.reason.trim(),
        migrate_historical_postings: false,
        reparented_child_account_count: reparentedChildren,
        remounted_reference_counts: remounted,
        history_pointers_never_moved: HISTORY_POINTERS_NEVER_MOVED,
      },
      "critical",
      "ACCT-R-03-COA-MERGE",
    );

    // WF-064 — an account merge is a high-risk accounting remap (blueprint §WF-064 class 6). Same
    // audit-driven owner fan-out the manual-JE path already uses; no new notification transport.
    await appendCrudAudit(
      client,
      actorUserId,
      "workflow.requested",
      {
        action_code: "WF-064-ACCT-003",
        workflow_context: "coa_account_merge_high_risk",
        owner_notification_required: true,
        target_resource_type: "catalogs.accounts",
        target_resource_id: source.id,
        merge_record_id: record.id,
        operating_company_id: input.operatingCompanyId,
      },
      "critical",
      "ACCT-R-03-COA-MERGE",
    );

    merged.push({
      merge_record_id: record.id,
      source_account_id: source.id,
      source_account_number: source.account_number,
      source_account_name: source.account_name,
      reparented_child_account_count: reparentedChildren,
      remounted_reference_counts: remounted,
      deactivated_at: (archived.rows[0]?.deactivated_at as string | undefined) ?? null,
    });
  }

  return { target, merged };
}
