import { randomUUID } from "node:crypto";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

// LAUNCH-SAFE-LEDGER-MONITOR-DETECTORS (CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md /
// STOP-CC1-ACCT-F5692-POD-GATE-2026-08-28.md §2): "stranded_intermediate detector must cover
// unbilled_revenue (1150), undeposited_funds (1090), and cash_clearing, and must not mix sample
// into the operating metric without labeling it." Ledger findings write into the SAME
// _system.reconciliation_findings table the QBO/Samsara reconciliation-worker.service.ts uses
// (integration widened to include 'ledger' by migration 202613240000), but with a different
// resolution contract: NO HUMAN CLOSE. Every ledger finding this module writes is resolved ONLY
// by this module, on a later tick that finds the underlying condition cleared -- resolved_by_user_id
// is always left NULL for integration='ledger' rows (see scripts/verify-ledger-findings-no-human-resolve.mjs,
// which fails if any route ever sets resolved_by_user_id on an integration='ledger' row, or if this
// file's own auto-resolve path stops leaving it NULL).
//
// Read-only detector: SELECT-only against accounting.journal_entry_postings / journal_entries /
// catalogs.accounts / accounting.chart_of_accounts_roles. Never GL — no INSERT/UPDATE against any
// posting table, ever.

const STRANDED_INTERMEDIATE_ROLES = ["unbilled_revenue", "undeposited_funds", "cash_clearing"] as const;
type StrandedRole = (typeof STRANDED_INTERMEDIATE_ROLES)[number];

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type RoleAccount = {
  accountId: string;
  accountNumber: string;
  accountName: string;
};

type StrandedBalance = {
  operatingCents: number;
  sampleCents: number;
};

// role is deliberately a plain string, not StrandedRole — this scope shape is shared by the stranded-
// intermediate detector (roles from STRANDED_INTERMEDIATE_ROLES) and the tie-out/suspense detectors below
// (roles "ar_control"/"ap_control"/"ask_my_accountant", none of which are stranded-intermediate roles).
type ResourceScope = {
  role: string;
  account_id: string;
  account_number: string;
};

async function listActiveCompanies(client: DbClient): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`
  );
  return res.rows.map((r) => r.id).filter(Boolean);
}

async function resolveRoleAccounts(client: DbClient, operatingCompanyId: string, role: StrandedRole): Promise<RoleAccount[]> {
  const res = await client.query<{ account_id: string; account_number: string; account_name: string }>(
    `
      SELECT a.id::text AS account_id, a.account_number, a.account_name
      FROM accounting.chart_of_accounts_roles r
      JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid
        AND r.role = $2
        AND r.is_active = true
    `,
    [operatingCompanyId, role]
  );
  return res.rows.map((r) => ({ accountId: r.account_id, accountNumber: r.account_number, accountName: r.account_name }));
}

// Sample vs operating split, same-shape as the report-layer exclusion already shipped in #16832
// (TB/P&L/BS/CF/register filter accounting.journal_entries.is_sample_data) -- this detector reads
// the SAME flag against the underlying ledger, not a report projection, so it catches what the
// report-layer filter can only hide from a viewer, not fix in the raw books.
async function readStrandedBalance(client: DbClient, operatingCompanyId: string, accountId: string): Promise<StrandedBalance> {
  const res = await client.query<{ operating_cents: string | null; sample_cents: string | null }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)
          FILTER (WHERE je.is_sample_data = false), 0)::text AS operating_cents,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)
          FILTER (WHERE je.is_sample_data = true), 0)::text AS sample_cents
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.operating_company_id = $1::uuid
        AND p.account_id = $2::uuid
    `,
    [operatingCompanyId, accountId]
  );
  const row = res.rows[0];
  return {
    operatingCents: Number(row?.operating_cents ?? 0),
    sampleCents: Number(row?.sample_cents ?? 0),
  };
}

async function findOpenLedgerFinding(
  client: DbClient,
  operatingCompanyId: string,
  findingType: string,
  resourceScope: ResourceScope
): Promise<{ id: string } | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM _system.reconciliation_findings
      WHERE operating_company_id = $1::uuid
        AND integration = 'ledger'
        AND finding_type = $2
        AND status = 'open'
        AND resource_scope = $3::jsonb
      ORDER BY detected_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, findingType, JSON.stringify(resourceScope)]
  );
  return res.rows[0]?.id ? { id: res.rows[0].id } : null;
}

// NO HUMAN CLOSE: the only status this module ever writes is 'open' (persistLedgerFinding) or
// 'resolved' via THIS function, and resolved_by_user_id is always NULL here — never a user uuid.
// A future route that wants to let a person close a ledger-integration finding must go through a
// SEPARATE integration value or explicitly reject integration='ledger'; scripts/verify-ledger-
// findings-no-human-resolve.mjs enforces that no such route exists today.
async function autoResolveLedgerFinding(client: DbClient, findingId: string): Promise<void> {
  await client.query(
    `
      UPDATE _system.reconciliation_findings
      SET
        status = 'resolved',
        resolved_at = now(),
        resolved_by_user_id = NULL,
        resolution_notes = 'auto-resolved: ledger-integrity detector rescan found the condition cleared (no human close)',
        updated_at = now()
      WHERE id = $1::uuid
        AND integration = 'ledger'
    `,
    [findingId]
  );
}

async function persistLedgerFinding(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    findingType: string;
    severity: "critical" | "important" | "cleanup";
    runId: string;
    resourceScope: ResourceScope;
    localValue: Record<string, unknown>;
    thresholdSnapshot: Record<string, unknown>;
  }
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM _system.reconciliation_findings
      WHERE operating_company_id = $1::uuid
        AND integration = 'ledger'
        AND finding_type = $2
        AND status = 'open'
        AND resource_scope = $3::jsonb
      LIMIT 1
    `,
    [input.operatingCompanyId, input.findingType, JSON.stringify(input.resourceScope)]
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE _system.reconciliation_findings
        SET
          severity = $2,
          last_seen_at = now(),
          local_value = $3::jsonb,
          threshold_snapshot = $4::jsonb,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [existing.rows[0].id, input.severity, JSON.stringify(input.localValue), JSON.stringify(input.thresholdSnapshot)]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO _system.reconciliation_findings (
        operating_company_id, integration, mirror_category, finding_type, severity, status,
        detected_at, reconciliation_run_id, resource_scope, local_value, remote_value,
        drift_metric_abs, drift_metric_pct, threshold_snapshot, first_seen_at, last_seen_at
      )
      VALUES (
        $1::uuid, 'ledger', 'ledger_integrity', $2, $3, 'open',
        now(), $4::uuid, $5::jsonb, $6::jsonb, NULL,
        NULL, NULL, $7::jsonb, now(), now()
      )
    `,
    [
      input.operatingCompanyId,
      input.findingType,
      input.severity,
      input.runId,
      JSON.stringify(input.resourceScope),
      JSON.stringify(input.localValue),
      JSON.stringify(input.thresholdSnapshot),
    ]
  );
}

async function checkStrandedIntermediateForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  for (const role of STRANDED_INTERMEDIATE_ROLES) {
    const accounts = await resolveRoleAccounts(client, operatingCompanyId, role);
    for (const account of accounts) {
      const balance = await readStrandedBalance(client, operatingCompanyId, account.accountId);
      const resourceScope: ResourceScope = { role, account_id: account.accountId, account_number: account.accountNumber };

      if (balance.sampleCents !== 0) {
        await persistLedgerFinding(client, {
          operatingCompanyId,
          findingType: "stranded_intermediate_sample_commingled",
          severity: "important",
          runId,
          resourceScope,
          localValue: {
            account_name: account.accountName,
            operating_cents: balance.operatingCents,
            sample_cents: balance.sampleCents,
          },
          thresholdSnapshot: { rule: "sample_data_must_not_appear_in_operating_ledger_accounts", threshold_cents: 0 },
        });
        continue;
      }

      const open = await findOpenLedgerFinding(client, operatingCompanyId, "stranded_intermediate_sample_commingled", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
  }
}

// INV-3 SUBLEDGER TIE-OUT (detector 2 of the plan's 10): scripts/verify-gl-invariants.sql's own INV-3
// block ("expect both differences = 0.00") computes this exact GL-vs-subledger diff for AR and AP on a
// REAL-ONLY basis (excludes je.is_sample_data / invoice.is_sample_data / bill.is_sample_data, matching
// the report-layer exclusion shipped in #16832). That script is a manual audit tool a human has to run;
// this detector is the same math running unattended every hour, self-closing when the diff clears.
//
// Account resolution deliberately goes through resolveRoleAccountOptional("ar_control"/"ap_control") —
// the SAME fail-closed resolver every real invoice/bill posting uses (posting-engine.service.ts) — so the
// detector always ties out against the account the poster actually wrote to, never a name-matched guess.
// If a company has no explicit/derivable control designation the resolver returns null and that leg is
// skipped for that company (not a false "$0 diff" claim — nothing to compare).
export async function checkSubledgerTieOutForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const arAccountId = await resolveRoleAccountOptional(client as never, operatingCompanyId, "ar_control");
  if (arAccountId) {
    const glRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
          AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
      `,
      [operatingCompanyId, arAccountId]
    );
    const subRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(amount_open_cents), 0)::text AS cents
        FROM accounting.invoices
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status NOT IN ('draft', 'proforma')
          AND COALESCE(is_sample_data, false) = false
      `,
      [operatingCompanyId]
    );
    const glCents = Number(glRes.rows[0]?.cents ?? 0);
    const subCents = Number(subRes.rows[0]?.cents ?? 0);
    const diffCents = glCents - subCents;
    const resourceScope: ResourceScope = { role: "ar_control", account_id: arAccountId, account_number: "" };

    if (diffCents !== 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "subledger_tie_out_diff",
        severity: "critical",
        runId,
        resourceScope,
        localValue: { ledger: "ar", gl_cents: glCents, subledger_cents: subCents, diff_cents: diffCents },
        thresholdSnapshot: { rule: "ar_control_gl_must_equal_open_invoice_subledger_real_only", threshold_cents: 0 },
      });
    } else {
      const open = await findOpenLedgerFinding(client, operatingCompanyId, "subledger_tie_out_diff", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
  }

  const apAccountId = await resolveRoleAccountOptional(client as never, operatingCompanyId, "ap_control");
  if (apAccountId) {
    const glRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
          AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
      `,
      [operatingCompanyId, apAccountId]
    );
    const subRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(ROUND((total_amount - COALESCE(paid_amount, 0)) * 100)), 0)::text AS cents
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid AND revoked_at IS NULL AND status <> 'draft'
          AND COALESCE(is_sample_data, false) = false
      `,
      [operatingCompanyId]
    );
    const glCents = Number(glRes.rows[0]?.cents ?? 0);
    const subCents = Number(subRes.rows[0]?.cents ?? 0);
    const diffCents = glCents - subCents;
    const resourceScope: ResourceScope = { role: "ap_control", account_id: apAccountId, account_number: "" };

    if (diffCents !== 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "subledger_tie_out_diff",
        severity: "critical",
        runId,
        resourceScope,
        localValue: { ledger: "ap", gl_cents: glCents, subledger_cents: subCents, diff_cents: diffCents },
        thresholdSnapshot: { rule: "ap_control_gl_must_equal_open_bill_subledger_real_only", threshold_cents: 0 },
      });
    } else {
      const open = await findOpenLedgerFinding(client, operatingCompanyId, "subledger_tie_out_diff", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
  }
}

// USMCA 9000 "Ask My Accountant" SUSPENSE MUST NET ZERO (GUARD-WORKORDERS ACCT-F-9000: "category->account
// resolver + ledger-health detector ... Refuse unmapped->9000; detector != 0"). 9000 is a miscoding
// bucket — any real (non-sample), non-voided net balance sitting there means transactions were posted
// unclassified and never triaged to a real account. Keyed on system_purpose (not a hardcoded account
// number), so it naturally covers any future entity that seeds the same anchor account and skips entities
// that never seeded it (nothing to compare, not a false "$0" claim).
export async function checkAskMyAccountantForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const accountsRes = await client.query<{ account_id: string; account_number: string; account_name: string }>(
    `
      SELECT id::text AS account_id, account_number, account_name
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND system_purpose = 'ask_my_accountant' AND deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );

  for (const account of accountsRes.rows) {
    const netRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
          AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
      `,
      [operatingCompanyId, account.account_id]
    );
    const netCents = Number(netRes.rows[0]?.cents ?? 0);
    const resourceScope: ResourceScope = {
      role: "ask_my_accountant",
      account_id: account.account_id,
      account_number: account.account_number,
    };

    if (netCents !== 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "ask_my_accountant_suspense_nonzero",
        severity: "important",
        runId,
        resourceScope,
        localValue: { account_name: account.account_name, net_cents: netCents },
        thresholdSnapshot: { rule: "ask_my_accountant_suspense_must_net_zero_real_only", threshold_cents: 0 },
      });
    } else {
      const open = await findOpenLedgerFinding(client, operatingCompanyId, "ask_my_accountant_suspense_nonzero", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
  }
}

// INV-2 PER-ENTRY BALANCE (detector 4 of the plan's 10): scripts/verify-gl-invariants.sql's own INV-2
// block ("expect je_unbalanced = 0"). This is a stronger check than a global trial-balance sum (INV-1) —
// two entries individually off by +$10 and -$10 net to $0.00 on a whole-ledger sum but are each a real
// broken posting. The posting engine is supposed to enforce debits=credits at write time (this has been
// 0/0/0 across all three companies every time it has been queried), so this detector is a safety net for
// a bug that slips past that enforcement (a manual insert, a migration backfill, a future poster change),
// not an expected-to-fire check — which is also why it stays a single aggregate finding per company
// (count + up to 10 sample ids) rather than one row per entry: normal operation is zero rows, and a
// genuine regression is rare enough that per-JE granularity would only matter for the triage step, which
// the sample ids already carry.
export async function checkPerEntryBalanceForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const res = await client.query<{ unbalanced_count: string; unbalanced_ids: string[] | null }>(
    `
      WITH je AS (
        SELECT j.id,
               SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff,
               COUNT(p.id) AS lines
        FROM accounting.journal_entries j
        LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id
        WHERE j.operating_company_id = $1::uuid AND j.status <> 'voided' AND COALESCE(j.is_sample_data, false) = false
        GROUP BY j.id
      )
      SELECT
        COUNT(*) FILTER (WHERE lines > 0 AND diff <> 0)::text AS unbalanced_count,
        (ARRAY_AGG(id::text) FILTER (WHERE lines > 0 AND diff <> 0))[1:10] AS unbalanced_ids
      FROM je
    `,
    [operatingCompanyId]
  );
  const unbalancedCount = Number(res.rows[0]?.unbalanced_count ?? 0);
  const resourceScope: ResourceScope = { role: "journal_entry_balance", account_id: "", account_number: "" };

  if (unbalancedCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "unbalanced_journal_entry",
      severity: "critical",
      runId,
      resourceScope,
      localValue: { unbalanced_count: unbalancedCount, sample_journal_entry_ids: res.rows[0]?.unbalanced_ids ?? [] },
      thresholdSnapshot: { rule: "every_real_posted_journal_entry_debits_must_equal_credits", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "unbalanced_journal_entry", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// INV-4 DOCUMENTS WITH NO GL DELTA (detector 5 of the plan's 10): scripts/verify-gl-invariants.sql's
// own INV-4 block ("expect 0 rows"), extended with the natural AP-side counterpart (the audited SQL
// only covers invoices; a TMS-native bill in a real, non-draft, non-voided status with zero GL
// postings is the identical defect shape on the other side of the ledger). source_system='tms' scopes
// this to documents this app itself is responsible for posting — a QBO-imported document with no local
// posting is expected (TMS never posts QBO's own history), not a defect. Unlike the balance detectors,
// this one is NOT currently a steady 0/0/0: live-queried before building, USMCA has 2 real unpaid bills
// (BILL-2026-00018 $750.00, BILL-2026-00019 $300.00, both created today) sitting with zero postings —
// this detector will open real findings on its very first tick.
export async function checkNoGlDeltaForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const invoiceRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(i.id::text))[1:10] AS ids
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.source_system = 'tms' AND i.voided_at IS NULL
        AND i.status IN ('sent', 'partial', 'paid') AND COALESCE(i.is_sample_data, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings p
          WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text
        )
    `,
    [operatingCompanyId]
  );
  const invoiceCount = Number(invoiceRes.rows[0]?.count ?? 0);
  const invoiceScope: ResourceScope = { role: "invoice", account_id: "", account_number: "" };
  if (invoiceCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "document_no_gl_delta",
      severity: "critical",
      runId,
      resourceScope: invoiceScope,
      localValue: { document_type: "invoice", count: invoiceCount, sample_ids: invoiceRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "tms_native_sent_partial_paid_invoice_must_have_a_gl_posting", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "document_no_gl_delta", invoiceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }

  const billRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(b.id::text))[1:10] AS ids
      FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid AND b.source_system = 'tms'
        AND b.voided_at IS NULL AND b.revoked_at IS NULL
        AND b.status IN ('unpaid', 'partial', 'partially_paid', 'paid') AND COALESCE(b.is_sample_data, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings p
          WHERE p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
        )
    `,
    [operatingCompanyId]
  );
  const billCount = Number(billRes.rows[0]?.count ?? 0);
  const billScope: ResourceScope = { role: "bill", account_id: "", account_number: "" };
  if (billCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "document_no_gl_delta",
      severity: "critical",
      runId,
      resourceScope: billScope,
      localValue: { document_type: "bill", count: billCount, sample_ids: billRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "tms_native_unpaid_partial_paid_bill_must_have_a_gl_posting", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "document_no_gl_delta", billScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// INV-9 FUTURE-DATED ENTRIES (detector 6 of the plan's 10): scripts/verify-gl-invariants.sql's own
// INV-9 block ("expect 0"). A journal entry dated after today is either a real bug (clock skew on a
// job, a typo digit, a timezone conversion error landing a date one day/month/year ahead of intent) or
// a deliberate future-period accrual posted early — either way it is worth a finding, not a silent
// pass, since a future-dated entry can distort any as-of-date report that reads entry_date without an
// explicit upper bound. `important`, not `critical`: unlike an unbalanced entry or a GL-dark document,
// this does not necessarily mean money is wrong, just that the date needs a human look.
export async function checkFutureDatedEntriesForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const res = await client.query<{ count: string; furthest: string | null; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, MAX(entry_date)::text AS furthest, (ARRAY_AGG(id::text))[1:10] AS ids
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid AND entry_date > CURRENT_DATE
        AND status <> 'voided' AND COALESCE(is_sample_data, false) = false
    `,
    [operatingCompanyId]
  );
  const count = Number(res.rows[0]?.count ?? 0);
  const resourceScope: ResourceScope = { role: "journal_entry_date", account_id: "", account_number: "" };

  if (count > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "future_dated_journal_entry",
      severity: "important",
      runId,
      resourceScope,
      localValue: { count, furthest_entry_date: res.rows[0]?.furthest ?? null, sample_journal_entry_ids: res.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "no_real_journal_entry_dated_after_today", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "future_dated_journal_entry", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

export async function runLedgerIntegrityTick(client: DbClient): Promise<void> {
  const companies = await listActiveCompanies(client);
  for (const operatingCompanyId of companies) {
    const runId = randomUUID();
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await checkStrandedIntermediateForCompany(client, operatingCompanyId, runId);
    await checkSubledgerTieOutForCompany(client, operatingCompanyId, runId);
    await checkAskMyAccountantForCompany(client, operatingCompanyId, runId);
    await checkPerEntryBalanceForCompany(client, operatingCompanyId, runId);
    await checkNoGlDeltaForCompany(client, operatingCompanyId, runId);
    await checkFutureDatedEntriesForCompany(client, operatingCompanyId, runId);
  }
}
