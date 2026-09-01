import { randomUUID } from "node:crypto";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import {
  loadControlBalanceCents,
  sumBankSubledgerCents,
  sumUnbilledRevenueSubledgerCents,
  sumPrepaidSubledgerCents,
  sumFixedAssetNetBookValueSubledgerCents,
  sumEscrowSubledgerCents,
  sumFactoringLiabilitySubledgerCents,
} from "../accounting/subledger-gl-control-rec.service.js";

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

// INV-11 REVERSAL SYMMETRY (detector 7 of the plan's 10): scripts/verify-gl-invariants.sql's own
// INV-11 block ("expect reversal_of = reversed_by"). Two independent checks, both currently a clean
// steady state (live-queried before building: 2181 real JEs, 117 marked reversed = 117 marked
// reversal, 0 voided-in-place, 0 broken pointers either direction):
//   voided_in_place    — a JE must NEVER be voided in place (voided_at set). The void-not-delete law
//                         requires a REVERSAL (a new JE with reverses_je_id pointing back), never a
//                         mutation of the original entry. A JE with voided_at set is that law broken.
//   reversal pointer    — reversed_by_je_id and reverses_je_id are two ends of the SAME edge and must
//                         agree: if A.reversed_by_je_id = B, then B.reverses_je_id must = A, and vice
//                         versa. A one-sided pointer (set on one JE, not mirrored on the other) means
//                         the reversal relationship is only half-recorded — auditable from one entry,
//                         invisible from the other.
export async function checkReversalIntegrityForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const voidedRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(id::text))[1:10] AS ids
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) = false
    `,
    [operatingCompanyId]
  );
  const voidedCount = Number(voidedRes.rows[0]?.count ?? 0);
  const voidedScope: ResourceScope = { role: "journal_entry_voided_in_place", account_id: "", account_number: "" };
  if (voidedCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "journal_entry_voided_in_place",
      severity: "critical",
      runId,
      resourceScope: voidedScope,
      localValue: { count: voidedCount, sample_journal_entry_ids: voidedRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "journal_entry_must_be_reversed_never_voided_in_place", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "journal_entry_voided_in_place", voidedScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }

  const brokenRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(id::text))[1:10] AS ids
      FROM (
        SELECT je.id
        FROM accounting.journal_entries je
        LEFT JOIN accounting.journal_entries rb
          ON rb.id = je.reversed_by_je_id AND rb.operating_company_id = je.operating_company_id
        WHERE je.operating_company_id = $1::uuid AND je.reversed_by_je_id IS NOT NULL
          AND COALESCE(je.is_sample_data, false) = false
          AND (rb.reverses_je_id IS DISTINCT FROM je.id)
        UNION
        SELECT je.id
        FROM accounting.journal_entries je
        LEFT JOIN accounting.journal_entries rv
          ON rv.id = je.reverses_je_id AND rv.operating_company_id = je.operating_company_id
        WHERE je.operating_company_id = $1::uuid AND je.reverses_je_id IS NOT NULL
          AND COALESCE(je.is_sample_data, false) = false
          AND (rv.reversed_by_je_id IS DISTINCT FROM je.id)
      ) broken
    `,
    [operatingCompanyId]
  );
  const brokenCount = Number(brokenRes.rows[0]?.count ?? 0);
  const brokenScope: ResourceScope = { role: "journal_entry_reversal_pointer", account_id: "", account_number: "" };
  if (brokenCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "journal_entry_reversal_pointer_broken",
      severity: "critical",
      runId,
      resourceScope: brokenScope,
      localValue: { count: brokenCount, sample_journal_entry_ids: brokenRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "reversed_by_je_id_and_reverses_je_id_must_point_back_to_each_other", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "journal_entry_reversal_pointer_broken", brokenScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01 band A/C/F — CC-2's assigned bands. Each new check
// below follows the SAME persistLedgerFinding/autoResolveLedgerFinding/resourceScope contract as
// every detector above: read-only, one open finding per (company, finding_type, resource_scope),
// auto-resolved (never human-resolved) the tick a condition clears.

// A3 — every real (non-voided, non-sample) journal entry must carry at least two posting lines.
// A single-leg entry with amount 0 would slip past checkPerEntryBalanceForCompany's diff<>0 filter
// (0 - 0 = 0, "balanced") while still being structurally broken — no debit/credit pair at all.
export async function checkMinimumPostingLinesForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const res = await client.query<{ count: string; ids: string[] | null }>(
    `
      WITH je AS (
        SELECT j.id, COUNT(p.id) AS lines
        FROM accounting.journal_entries j
        LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id
        WHERE j.operating_company_id = $1::uuid AND j.status <> 'voided' AND COALESCE(j.is_sample_data, false) = false
        GROUP BY j.id
      )
      SELECT
        COUNT(*) FILTER (WHERE lines < 2)::text AS count,
        (ARRAY_AGG(id::text) FILTER (WHERE lines < 2))[1:10] AS ids
      FROM je
    `,
    [operatingCompanyId]
  );
  const count = Number(res.rows[0]?.count ?? 0);
  const ids = res.rows[0]?.ids ?? [];
  const resourceScope: ResourceScope = { role: "journal_entry_min_lines", account_id: "", account_number: "" };

  if (count > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "journal_entry_fewer_than_two_postings",
      severity: "critical",
      runId,
      resourceScope,
      localValue: { count, sample_journal_entry_ids: ids },
      thresholdSnapshot: { rule: "every_real_journal_entry_must_have_at_least_two_postings", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "journal_entry_fewer_than_two_postings", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// A4 — every posting must reference a live catalogs.accounts row IN THE SAME COMPANY. An orphan
// (account deleted/never existed) or a cross-company account_id (a posting silently landing on
// another entity's chart) are both entity-integrity failures a raw FK alone cannot catch if the FK
// target table has no company-scoped uniqueness — this is a defense-in-depth check, not a
// substitute for the FK.
export async function checkOrphanPostingsForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const res = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(p.id::text))[1:10] AS ids
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id AND a.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
        AND a.id IS NULL
    `,
    [operatingCompanyId]
  );
  const count = Number(res.rows[0]?.count ?? 0);
  const resourceScope: ResourceScope = { role: "journal_entry_posting_orphan", account_id: "", account_number: "" };

  if (count > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "posting_orphan_or_cross_company_account",
      severity: "critical",
      runId,
      resourceScope,
      localValue: { count, sample_posting_ids: res.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "every_posting_account_id_must_resolve_to_a_live_same_company_account", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "posting_orphan_or_cross_company_account", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// A5-extend — checkNoGlDeltaForCompany (above) already covers invoices and bills; the law's own
// live baseline names a THIRD real violation on this exact check shape: expense `8a1b3d84` $75.00.
// expenses has no source_system column (grep-confirmed: every expense row is TMS-native by
// construction, there is no QBO-import concept for this table), so this omits that filter rather
// than guessing a column that does not exist.
export async function checkExpenseNoGlDeltaForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const res = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(e.id::text))[1:10] AS ids
      FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid AND e.status = 'posted'
        AND COALESCE(e.is_sample_data, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings p
          WHERE p.source_transaction_type = 'expense' AND p.source_transaction_id = e.id::text
        )
    `,
    [operatingCompanyId]
  );
  const count = Number(res.rows[0]?.count ?? 0);
  const resourceScope: ResourceScope = { role: "expense", account_id: "", account_number: "" };

  if (count > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "document_no_gl_delta",
      severity: "critical",
      runId,
      resourceScope,
      localValue: { document_type: "expense", count, sample_ids: res.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "posted_expense_must_have_a_gl_posting", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "document_no_gl_delta", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// C1 + C5 combined — LAW's own trap warning for whoever builds this: the void path writes a
// SEPARATE reversing JE and does NOT populate the LINE-level reversal_of_line_id/
// reversed_by_line_id columns on accounting.journal_entry_postings (confirmed live: 0 non-null
// rows for either). Asserting on those gives a false positive. The JE-LEVEL pointer
// (journal_entries.reversed_by_je_id / reverses_je_id) is the one this repo's void path DOES
// populate — checkReversalIntegrityForCompany above already proves that pointer pair is internally
// consistent (117/117 at last live check). This check goes one step further: for every VOIDED
// document with a real original posting, (C1) the original JE must actually HAVE a reversal
// (reversed_by_je_id set), and (C5) the reversal's postings must mirror the original's EXACTLY —
// same account, opposite side, same amount, for every line — not just "a reversal exists somewhere".
// A document voided with NO original posting at all (nothing to reverse) is not a violation of
// THIS check — that shape is A5/checkNoGlDeltaForCompany's concern, not C1's.
async function checkVoidedDocumentReversalIntegrity(
  client: DbClient,
  operatingCompanyId: string,
  runId: string,
  docType: "invoice" | "bill"
): Promise<void> {
  const table = docType === "invoice" ? "accounting.invoices" : "accounting.bills";
  const res = await client.query<{ doc_id: string; missing_reversal: boolean; mismatched_cents: string }>(
    `
      WITH voided_docs AS (
        SELECT id FROM ${table}
        WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL
          AND COALESCE(is_sample_data, false) = false
      ),
      original_je AS (
        SELECT vd.id AS doc_id, p.journal_entry_uuid AS je_id
        FROM voided_docs vd
        JOIN accounting.journal_entry_postings p
          ON p.source_transaction_type = $2 AND p.source_transaction_id = vd.id::text
        GROUP BY vd.id, p.journal_entry_uuid
      ),
      reversal_check AS (
        SELECT
          oj.doc_id,
          je.reversed_by_je_id IS NULL AS missing_reversal,
          COALESCE((
            SELECT SUM(ABS(
              (SELECT COALESCE(SUM(CASE WHEN p2.debit_or_credit = 'debit' THEN p2.amount_cents ELSE -p2.amount_cents END), 0)
                 FROM accounting.journal_entry_postings p2 WHERE p2.journal_entry_uuid = oj.je_id AND p2.account_id = acct.account_id)
              +
              (SELECT COALESCE(SUM(CASE WHEN p3.debit_or_credit = 'debit' THEN p3.amount_cents ELSE -p3.amount_cents END), 0)
                 FROM accounting.journal_entry_postings p3 WHERE p3.journal_entry_uuid = je.reversed_by_je_id AND p3.account_id = acct.account_id)
            ))
            FROM (SELECT DISTINCT account_id FROM accounting.journal_entry_postings WHERE journal_entry_uuid IN (oj.je_id, je.reversed_by_je_id)) acct
          ), 0) AS mismatched_cents
        FROM original_je oj
        JOIN accounting.journal_entries je ON je.id = oj.je_id
      )
      SELECT doc_id, missing_reversal, mismatched_cents::text
      FROM reversal_check
      WHERE missing_reversal = true OR mismatched_cents <> 0
    `,
    [operatingCompanyId, docType]
  );

  const missingIds = res.rows.filter((r) => r.missing_reversal).map((r) => r.doc_id).slice(0, 10);
  const mismatchedIds = res.rows.filter((r) => !r.missing_reversal).map((r) => r.doc_id).slice(0, 10);
  const resourceScope: ResourceScope = { role: `${docType}_void_reversal`, account_id: "", account_number: "" };

  if (res.rows.length > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "voided_document_reversal_broken",
      severity: "critical",
      runId,
      resourceScope,
      localValue: {
        document_type: docType,
        missing_reversal_count: missingIds.length,
        sample_missing_reversal_ids: missingIds,
        mismatched_reversal_count: mismatchedIds.length,
        sample_mismatched_reversal_ids: mismatchedIds,
      },
      thresholdSnapshot: {
        rule: "every_voided_document_with_a_real_original_posting_must_have_a_balanced_mirroring_reversal_je",
        threshold_cents: 0,
      },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "voided_document_reversal_broken", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

export async function checkVoidReversalIntegrityForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  await checkVoidedDocumentReversalIntegrity(client, operatingCompanyId, runId, "invoice");
  await checkVoidedDocumentReversalIntegrity(client, operatingCompanyId, runId, "bill");
}

// C2 — void metadata completeness, SCHEMA-AWARE per document type on purpose: live-verified before
// writing this (information_schema.columns) that invoices and bills do NOT share one void-column
// convention (this repo has FOUR parallel conventions across its financial tables — that drift is
// its own separate finding, C4, not fixed here). accounting.invoices has voided_at/void_reason but
// NO voided_by_user_id column at all — asserting on a column that structurally does not exist
// would either crash the query or silently mis-check; this function only asserts what each table
// actually has. accounting.bills uses "revoked_at" as its real void timestamp (there is no
// bills.voided_at column) but ALSO carries a separate voided_by_user_id/void_reason pair that
// coexist with revoked_by_user_id/revoked_reason — exactly the C4 confusion made concrete: this
// check requires bills' OWN "revoked" fields to be complete, since that is the column the void
// path this repo actually uses for timestamping.
export async function checkVoidMetadataCompletenessForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const invoiceRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(id::text))[1:10] AS ids
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL
        AND (void_reason IS NULL OR btrim(void_reason) = '')
    `,
    [operatingCompanyId]
  );
  const invoiceCount = Number(invoiceRes.rows[0]?.count ?? 0);
  const invoiceScope: ResourceScope = { role: "invoice_void_metadata", account_id: "", account_number: "" };
  if (invoiceCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "void_metadata_incomplete",
      severity: "important",
      runId,
      resourceScope: invoiceScope,
      localValue: { document_type: "invoice", count: invoiceCount, sample_ids: invoiceRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "voided_invoice_must_have_a_non_empty_void_reason", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "void_metadata_incomplete", invoiceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }

  const billRes = await client.query<{ count: string; ids: string[] | null }>(
    `
      SELECT COUNT(*)::text AS count, (ARRAY_AGG(id::text))[1:10] AS ids
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid AND revoked_at IS NOT NULL
        AND (revoked_reason IS NULL OR btrim(revoked_reason) = '' OR revoked_by_user_id IS NULL)
    `,
    [operatingCompanyId]
  );
  const billCount = Number(billRes.rows[0]?.count ?? 0);
  const billScope: ResourceScope = { role: "bill_void_metadata", account_id: "", account_number: "" };
  if (billCount > 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "void_metadata_incomplete",
      severity: "important",
      runId,
      resourceScope: billScope,
      localValue: { document_type: "bill", count: billCount, sample_ids: billRes.rows[0]?.ids ?? [] },
      thresholdSnapshot: { rule: "revoked_bill_must_have_a_non_empty_revoked_reason_and_revoked_by_user_id", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "void_metadata_incomplete", billScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// F1/F2 shared name-pattern detection — F-BAND-DATA-HONESTY-01 (Devin-A live sweep, 2026-09-01,
// docs/audit/WORKORDER-F-BAND-DATA-HONESTY-SWEEP-2026-09-01.md, handed to CC-2 explicitly to build
// these checks FROM). This module's OWN first draft of F2 (matching only TEST/CODEX-TEST/CC3TEST)
// undercounted 4x — the real live sweep found 24 test-named accounts, not 6, because names shaped
// like "ZZ-SAMPLE A ..." (accounts 9901/9902) or a bare "DEMO"/"SEED"/"FAKE" never matched TEST at
// all. Corrected here before this ever shipped, using the sweep's own broader pattern list. The
// sweep ALSO caught a real false-positive risk in that first draft: a bare `\bTEST\b` matches
// "Antidoping-Drug Test Services" (QBO-1150040105, a real vendor account — "Drug Test" is a
// legitimate business service, not a fixture marker) — EXCLUSIONS below block that confirmed trap
// before it fires, per the same "text matching is not a control" discipline already applied to
// verify-no-seat-instruction-overrides-owner-void.mjs elsewhere in this repo.
const TEST_NAME_PATTERNS = [
  /\bTEST\b/i,
  /\bDEMO\b/i,
  /\bSEED\b/i,
  /\bSAMPLE\b/i,
  /\bFAKE\b/i,
  /\bCODEX\b.*\bTEST\b/i,
  /\bTEST\b.*\bCODEX\b/i,
  /\bCC3TEST\b/i,
  /\bARCHIVED-TEST\b/i,
  /\bZZ-SAMPLE\b/i,
] as const;
const TEST_NAME_EXCLUSIONS = [/\bDRUG\s+TEST\b/i, /\bEMISSIONS?\s+TEST\b/i] as const;

function isTestNamedRecord(name: string): boolean {
  if (TEST_NAME_EXCLUSIONS.some((p) => p.test(name))) return false;
  return TEST_NAME_PATTERNS.some((p) => p.test(name));
}

// F1 — a financial document whose NAME/customer/vendor looks test-shaped (per isTestNamedRecord
// above) but is NOT flagged is_sample_data=true. This is a REWRITE of this check's first draft,
// which asserted `is_sample_data IS NULL` — the F-BAND sweep proved that assertion is structurally
// inert: all 14 tables that carry is_sample_data are NOT NULL DEFAULT false with ZERO NULL rows
// across the entire database, so an IS-NULL check could never fire, on this table or any other — an
// always-green check masquerading as coverage. The REAL gap the law's own baseline named ("17
// unflagged expenses, 34 of 49 invoices") is test-shaped records sitting at is_sample_data=false,
// not NULL ones. invoices.routes.ts derives an invoice's flag from its CUSTOMER's flag (sweep
// finding) — an unflagged test customer silently produces unflagged test invoices, which is
// exactly why this checks invoices/bills/expenses by their OWN visible name/memo text, not by
// trusting an upstream flag that may itself be wrong.
export async function checkSampleDataFlagExplicitForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  for (const doc of [
    { table: "accounting.invoices", nameExpr: "COALESCE(customer_notes, internal_notes, '')", label: "invoice" },
    { table: "accounting.bills", nameExpr: "COALESCE(memo, '')", label: "bill" },
    { table: "accounting.expenses", nameExpr: "COALESCE(memo, '')", label: "expense" },
  ] as const) {
    const res = await client.query<{ id: string; text: string }>(
      `SELECT id::text AS id, ${doc.nameExpr} AS text FROM ${doc.table} WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) = false`,
      [operatingCompanyId]
    );
    const offenders = res.rows.filter((r) => isTestNamedRecord(r.text));
    const resourceScope: ResourceScope = { role: `${doc.label}_is_sample_data_unset`, account_id: "", account_number: "" };
    if (offenders.length > 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "is_sample_data_not_explicit",
        severity: "important",
        runId,
        resourceScope,
        localValue: { document_type: doc.label, count: offenders.length, sample_ids: offenders.slice(0, 10).map((o) => o.id) },
        thresholdSnapshot: { rule: "test_shaped_record_must_be_flagged_is_sample_data_true", threshold_cents: 0 },
      });
    } else {
      const open = await findOpenLedgerFinding(client, operatingCompanyId, "is_sample_data_not_explicit", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
  }
}

// F2 — no test-named record in real master data. Live-verified before writing this (and expanded
// after the Devin-A sweep proved the first draft's scope was too narrow — see the shared pattern
// comment above): scans catalogs.accounts (a coding seat creating a GL ACCOUNT that appears on the
// owner's real chart is the worst instance of this class) plus mdata.drivers/customers/vendors/
// units, since the same F-BAND sweep found 20/20/47/23 test-named records respectively across
// those tables — accounts alone was a fraction of the real contamination surface.
const F2_TARGETS = [
  { table: "catalogs.accounts", idCol: "id", nameExpr: "account_name", numberCol: "account_number", label: "account" },
  { table: "mdata.drivers", idCol: "id", nameExpr: "first_name || ' ' || last_name", numberCol: null, label: "driver" },
  { table: "mdata.customers", idCol: "id", nameExpr: "customer_name", numberCol: null, label: "customer" },
  { table: "mdata.vendors", idCol: "id", nameExpr: "vendor_name", numberCol: null, label: "vendor" },
  { table: "mdata.units", idCol: "id", nameExpr: "unit_number", numberCol: null, label: "unit" },
] as const;

export async function checkTestNamedAccountForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  for (const target of F2_TARGETS) {
    const numberSelect = target.numberCol ? `${target.numberCol} AS number_val,` : "NULL AS number_val,";
    const res = await client.query<{ id: string; number_val: string | null; name_val: string }>(
      `
        SELECT ${target.idCol}::text AS id, ${numberSelect} ${target.nameExpr} AS name_val
        FROM ${target.table}
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
    const offenders = res.rows.filter((r) => isTestNamedRecord(r.name_val ?? ""));
    const resourceScope: ResourceScope = { role: `test_named_${target.label}`, account_id: "", account_number: "" };

    if (offenders.length > 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "test_named_account_in_coa",
        severity: "important",
        runId,
        resourceScope,
        localValue: {
          record_type: target.label,
          count: offenders.length,
          sample_records: offenders.slice(0, 10).map((o) => ({ id: o.id, number: o.number_val, name: o.name_val })),
        },
        thresholdSnapshot: { rule: "no_test_or_sample_named_record_active_in_real_master_data", threshold_cents: 0 },
      });
      continue;
    }
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "test_named_account_in_coa", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// B6 — driver cash advance does not fit subledger-gl-control-rec.service.ts's single-role-account
// report row shape: driver_finance.driver_advance_accounts.coa_account_id is a DISTINCT GL account
// PER DRIVER (26 of them on USMCA alone), not one company-wide control account. This check sums
// the sign-normalized GL balance across every one of those per-driver accounts and compares it to
// the sum of outstanding driver_advances — reusing loadControlBalanceCents (imported from
// subledger-gl-control-rec.service.ts) for the per-account GL read, per account, exactly the "reuse
// it, do not rebuild it" instruction.
export async function checkDriverCashAdvanceTieOutForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const asOfDate = new Date().toISOString().slice(0, 10);
  const accountsRes = await client.query<{ account_id: string }>(
    `
      SELECT DISTINCT coa_account_id AS account_id
      FROM driver_finance.driver_advance_accounts
      WHERE operating_company_id = $1::uuid AND is_active = true AND coa_account_id IS NOT NULL
    `,
    [operatingCompanyId]
  );

  let glCents = 0;
  for (const row of accountsRes.rows) {
    glCents += await loadControlBalanceCents(client, operatingCompanyId, asOfDate, row.account_id);
  }

  const subRes = await client.query<{ cents: string | number }>(
    `
      SELECT COALESCE(SUM(ROUND(outstanding_balance * 100)), 0)::bigint AS cents
      FROM driver_finance.driver_advances
      WHERE operating_company_id = $1::uuid AND status = 'outstanding'
    `,
    [operatingCompanyId]
  );
  const subCents = Number(subRes.rows[0]?.cents ?? 0);
  const diffCents = glCents - subCents;
  const resourceScope: ResourceScope = { role: "driver_cash_advance", account_id: "", account_number: "" };

  if (accountsRes.rows.length === 0) return; // nothing bound yet — not a false "$0 tie" claim

  if (diffCents !== 0) {
    await persistLedgerFinding(client, {
      operatingCompanyId,
      findingType: "subledger_tie_out_diff",
      severity: "critical",
      runId,
      resourceScope,
      localValue: { ledger: "driver_cash_advance", gl_cents: glCents, subledger_cents: subCents, diff_cents: diffCents },
      thresholdSnapshot: { rule: "driver_cash_advance_gl_must_equal_outstanding_driver_advances_subledger", threshold_cents: 0 },
    });
  } else {
    const open = await findOpenLedgerFinding(client, operatingCompanyId, "subledger_tie_out_diff", resourceScope);
    if (open) await autoResolveLedgerFinding(client, open.id);
  }
}

// B3/B4/B7/B8 — the existing checkSubledgerTieOutForCompany above hand-rolls JUST ar_control/
// ap_control with its own inline SQL, never calling subledger-gl-control-rec.service.ts's report
// function at all — that function is currently reachable ONLY via its authenticated HTTP route,
// not by this cron. Rather than route the automated tick through the full report function (which
// pulls in getArAgingReport/getApAgingReport and assertCompanyMembership — a real "logged-in user"
// dependency chain this system-context cron does not have), this reuses the report's OWN exported
// per-role primitives (resolveRoleAccountOptional + loadControlBalanceCents + the sum functions)
// directly — same math, no duplicated SQL, no borrowed auth context.
const EXTENDED_TIE_OUT_ROLES = [
  { role: "operating_bank" as const, ledger: "bank", needsAccountId: true },
  { role: "unbilled_revenue" as const, ledger: "unbilled_revenue", needsAccountId: false },
  { role: "prepaid_asset_default" as const, ledger: "prepaid", needsAccountId: false },
  { role: "fixed_asset_default" as const, ledger: "fixed_assets", needsAccountId: false },
  // SUBLEDGER-GL-TIEOUT-EVERY-CONTROL (board-routed CC-2) — escrow_liability_default and
  // factoring_advance_liability were already registered CoaRoles with real, already-shipped sum
  // functions (getSubledgerGlControlRecReport already used them, live-verified, in the on-demand
  // report) but were never wired into THIS automated hourly cron — the report existed, continuous
  // monitoring didn't. Added here, not built from scratch: same functions, same math, just now
  // running on the cron's own schedule instead of only when someone opens the report.
  { role: "escrow_liability_default" as const, ledger: "escrow", needsAccountId: false },
  { role: "factoring_advance_liability" as const, ledger: "factoring", needsAccountId: false },
];

export async function checkExtendedSubledgerTieOutForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  const asOfDate = new Date().toISOString().slice(0, 10);
  for (const { role, ledger, needsAccountId } of EXTENDED_TIE_OUT_ROLES) {
    const controlAccountId = await resolveRoleAccountOptional(client as never, operatingCompanyId, role);
    const resourceScope: ResourceScope = { role, account_id: controlAccountId ?? "", account_number: "" };

    if (controlAccountId == null) continue; // unbound — nothing to compare, not a false "$0" claim

    const glCents = await loadControlBalanceCents(client, operatingCompanyId, asOfDate, controlAccountId);
    // Explicit per-role dispatch, no catch-all default — an unhandled future role must fail loud
    // (thrown error surfaces as a cron error) rather than silently reuse the wrong sum function,
    // the exact class of bug an implicit trailing `: else` branch invites the moment a 7th role
    // is added and someone forgets to extend this chain.
    let subCents: number;
    if (role === "operating_bank" && needsAccountId) {
      subCents = await sumBankSubledgerCents(client, operatingCompanyId, controlAccountId);
    } else if (role === "unbilled_revenue") {
      subCents = await sumUnbilledRevenueSubledgerCents(client, operatingCompanyId);
    } else if (role === "prepaid_asset_default") {
      subCents = await sumPrepaidSubledgerCents(client, operatingCompanyId);
    } else if (role === "fixed_asset_default") {
      subCents = await sumFixedAssetNetBookValueSubledgerCents(client, operatingCompanyId);
    } else if (role === "escrow_liability_default") {
      subCents = await sumEscrowSubledgerCents(client, operatingCompanyId);
    } else if (role === "factoring_advance_liability") {
      subCents = await sumFactoringLiabilitySubledgerCents(client, operatingCompanyId, asOfDate);
    } else {
      throw new Error(`checkExtendedSubledgerTieOutForCompany: unhandled EXTENDED_TIE_OUT_ROLES role "${role}"`);
    }

    const diffCents = glCents - subCents;
    if (diffCents !== 0) {
      await persistLedgerFinding(client, {
        operatingCompanyId,
        findingType: "subledger_tie_out_diff",
        severity: "critical",
        runId,
        resourceScope,
        localValue: { ledger, gl_cents: glCents, subledger_cents: subCents, diff_cents: diffCents },
        thresholdSnapshot: { rule: `${role}_gl_must_equal_subledger`, threshold_cents: 0 },
      });
    } else {
      const open = await findOpenLedgerFinding(client, operatingCompanyId, "subledger_tie_out_diff", resourceScope);
      if (open) await autoResolveLedgerFinding(client, open.id);
    }
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
    await checkReversalIntegrityForCompany(client, operatingCompanyId, runId);
    // LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01 bands A/C/F — CC-2.
    await checkMinimumPostingLinesForCompany(client, operatingCompanyId, runId);
    await checkOrphanPostingsForCompany(client, operatingCompanyId, runId);
    await checkExpenseNoGlDeltaForCompany(client, operatingCompanyId, runId);
    await checkVoidReversalIntegrityForCompany(client, operatingCompanyId, runId);
    await checkVoidMetadataCompletenessForCompany(client, operatingCompanyId, runId);
    await checkSampleDataFlagExplicitForCompany(client, operatingCompanyId, runId);
    await checkTestNamedAccountForCompany(client, operatingCompanyId, runId);
    await checkDriverCashAdvanceTieOutForCompany(client, operatingCompanyId, runId);
    await checkExtendedSubledgerTieOutForCompany(client, operatingCompanyId, runId);
  }
}
