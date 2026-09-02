// GO-20 slice A (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — banking.reconciliation_drift_alerts.
//
// "A detector that runs after every reconciliation finalize and once nightly... It opens an alert
// if none is open for that account and kind, and closes an alert automatically when the condition
// clears, recording who or what closed it. It NEVER posts a journal entry."
export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class DriftAlertError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "DriftAlertError";
  }
}

type DetectResult = { opened: number; closed: number };

// severity: any drift beyond tolerance is 'warning'; beyond 10x tolerance (or $100 flat, whichever
// is larger) is 'critical' — a small, honest tiering so a $1 slip over a $1 tolerance doesn't read
// the same as a $50,000 one, without inventing a second owner-editable setting the spec never asked
// for.
function severityFor(driftCents: number, toleranceCents: number): "warning" | "critical" {
  const criticalFloor = Math.max(toleranceCents * 10, 10_000);
  return Math.abs(driftCents) >= criticalFloor ? "critical" : "warning";
}

async function openOrRefreshAlert(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_account_id: string;
    reconciliation_session_id: string | null;
    as_of_date: string;
    drift_kind: "session_variance" | "live_balance" | "stale_feed";
    bank_balance_cents: number;
    book_balance_cents: number;
    drift_cents: number;
    tolerance_cents: number;
  }
): Promise<"opened" | "unchanged"> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id FROM banking.reconciliation_drift_alerts
       WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid AND drift_kind = $3
         AND resolved_at IS NULL AND voided_at IS NULL
    `,
    [input.operating_company_id, input.bank_account_id, input.drift_kind]
  );
  if (existing.rows[0]?.id) {
    // Already open — refresh the measured numbers so the panel shows the current drift, not the
    // stale figure from when it first opened. Never touches resolved_at/resolved_by/note.
    await client.query(
      `
        UPDATE banking.reconciliation_drift_alerts
           SET bank_balance_cents = $1, book_balance_cents = $2, drift_cents = $3,
               reconciliation_session_id = COALESCE($4::uuid, reconciliation_session_id),
               as_of_date = $5::date, updated_at = now()
         WHERE id = $6::uuid
      `,
      [
        input.bank_balance_cents,
        input.book_balance_cents,
        input.drift_cents,
        input.reconciliation_session_id,
        input.as_of_date,
        existing.rows[0].id,
      ]
    );
    return "unchanged";
  }

  await client.query(
    `
      INSERT INTO banking.reconciliation_drift_alerts (
        operating_company_id, bank_account_id, reconciliation_session_id, as_of_date, drift_kind,
        bank_balance_cents, book_balance_cents, drift_cents, tolerance_cents, severity
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6, $7, $8, $9, $10)
    `,
    [
      input.operating_company_id,
      input.bank_account_id,
      input.reconciliation_session_id,
      input.as_of_date,
      input.drift_kind,
      input.bank_balance_cents,
      input.book_balance_cents,
      input.drift_cents,
      input.tolerance_cents,
      severityFor(input.drift_cents, input.tolerance_cents),
    ]
  );
  return "opened";
}

// Auto-close: the condition cleared on its own (drift back within tolerance, feed resynced).
// resolved_by_user_id is NULL — this was the detector, not a person — and the note says so, so a
// reader of the audit trail can tell an auto-close from an owner's written reason.
async function autoCloseAlert(client: DbClient, alertId: string): Promise<void> {
  await client.query(
    `
      UPDATE banking.reconciliation_drift_alerts
         SET resolved_at = now(),
             resolved_by_user_id = NULL,
             resolution_note = 'Auto-closed: condition cleared (drift back within tolerance).',
             updated_at = now()
       WHERE id = $1::uuid
    `,
    [alertId]
  );
}

async function closeAlertsNotIn(
  client: DbClient,
  operating_company_id: string,
  drift_kind: "session_variance" | "live_balance" | "stale_feed",
  stillOpenBankAccountIds: string[]
): Promise<number> {
  const openRes = await client.query<{ id: string; bank_account_id: string }>(
    `
      SELECT id, bank_account_id::text AS bank_account_id
        FROM banking.reconciliation_drift_alerts
       WHERE operating_company_id = $1::uuid AND drift_kind = $2
         AND resolved_at IS NULL AND voided_at IS NULL
    `,
    [operating_company_id, drift_kind]
  );
  const stillOpen = new Set(stillOpenBankAccountIds);
  let closed = 0;
  for (const row of openRes.rows) {
    if (stillOpen.has(row.bank_account_id)) continue;
    await autoCloseAlert(client, row.id);
    closed += 1;
  }
  return closed;
}

// session_variance — any finalized session where abs(variance_cents) > tolerance.
export async function detectSessionVarianceDrift(client: DbClient, operating_company_id: string): Promise<DetectResult> {
  const rows = await client.query<{
    session_id: string;
    bank_account_id: string;
    period_end: string;
    statement_balance_cents: string;
    book_balance_cents: string;
    variance_cents: string;
    drift_tolerance_cents: number;
  }>(
    `
      SELECT rs.id AS session_id, rs.bank_account_id::text AS bank_account_id, rs.period_end::text AS period_end,
             rs.statement_balance_cents, rs.book_balance_cents, rs.variance_cents,
             ba.drift_tolerance_cents
        FROM banking.reconciliation_sessions rs
        JOIN banking.bank_accounts ba ON ba.id = rs.bank_account_id
       WHERE rs.operating_company_id = $1::uuid
         AND rs.finalized_at IS NOT NULL
         AND rs.voided_at IS NULL
         AND rs.status <> 'reopened'
       ORDER BY rs.finalized_at DESC
    `,
    [operating_company_id]
  );

  // Only the LATEST finalized session per account decides today's open/closed state — an old,
  // superseded session's variance should not keep re-opening an alert forever.
  const latestPerAccount = new Map<string, (typeof rows.rows)[number]>();
  for (const row of rows.rows) {
    if (!latestPerAccount.has(row.bank_account_id)) latestPerAccount.set(row.bank_account_id, row);
  }

  const stillOpenAccountIds: string[] = [];
  let opened = 0;
  for (const row of latestPerAccount.values()) {
    const drift = Number(row.variance_cents);
    const tolerance = Number(row.drift_tolerance_cents);
    if (Math.abs(drift) > tolerance) {
      stillOpenAccountIds.push(row.bank_account_id);
      const result = await openOrRefreshAlert(client, {
        operating_company_id,
        bank_account_id: row.bank_account_id,
        reconciliation_session_id: row.session_id,
        as_of_date: row.period_end,
        drift_kind: "session_variance",
        bank_balance_cents: Number(row.statement_balance_cents),
        book_balance_cents: Number(row.book_balance_cents),
        drift_cents: drift,
        tolerance_cents: tolerance,
      });
      if (result === "opened") opened += 1;
    }
  }
  const closed = await closeAlertsNotIn(client, operating_company_id, "session_variance", stillOpenAccountIds);
  return { opened, closed };
}

// live_balance — bank_accounts.current_balance_cents vs the ledger balance for its
// ledger_account_id, computed via the existing accounting.fn_account_balances_as_of() function
// (same one account-balances.service.ts uses) — reused, not reimplemented.
export async function detectLiveBalanceDrift(client: DbClient, operating_company_id: string): Promise<DetectResult> {
  const accountsRes = await client.query<{
    id: string;
    current_balance_cents: number;
    ledger_account_id: string | null;
    drift_tolerance_cents: number;
  }>(
    `
      SELECT id, current_balance_cents, ledger_account_id::text AS ledger_account_id, drift_tolerance_cents
        FROM banking.bank_accounts
       WHERE operating_company_id = $1::uuid AND is_active = true AND ledger_account_id IS NOT NULL
    `,
    [operating_company_id]
  );
  if (accountsRes.rows.length === 0) return { opened: 0, closed: 0 };

  const asOfDate = new Date().toISOString().slice(0, 10);
  const balancesRes = await client.query<{ account_id: string; closing_balance_cents: string | number | null }>(
    `SELECT account_id, closing_balance_cents FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL)`,
    [operating_company_id, asOfDate]
  );
  const closingByAccount = new Map(balancesRes.rows.map((r) => [r.account_id, Number(r.closing_balance_cents ?? 0)]));

  const stillOpenAccountIds: string[] = [];
  let opened = 0;
  for (const acct of accountsRes.rows) {
    const ledgerCents = closingByAccount.get(acct.ledger_account_id as string) ?? 0;
    const drift = Number(acct.current_balance_cents) - ledgerCents;
    const tolerance = Number(acct.drift_tolerance_cents);
    if (Math.abs(drift) > tolerance) {
      stillOpenAccountIds.push(acct.id);
      const result = await openOrRefreshAlert(client, {
        operating_company_id,
        bank_account_id: acct.id,
        reconciliation_session_id: null,
        as_of_date: asOfDate,
        drift_kind: "live_balance",
        bank_balance_cents: Number(acct.current_balance_cents),
        book_balance_cents: ledgerCents,
        drift_cents: drift,
        tolerance_cents: tolerance,
      });
      if (result === "opened") opened += 1;
    }
  }
  const closed = await closeAlertsNotIn(client, operating_company_id, "live_balance", stillOpenAccountIds);
  return { opened, closed };
}

// stale_feed — last_synced_at older than 24 hours on an active account.
export async function detectStaleFeedDrift(client: DbClient, operating_company_id: string): Promise<DetectResult> {
  const rows = await client.query<{ id: string; current_balance_cents: number; last_synced_at: string | null }>(
    `
      SELECT id, current_balance_cents, last_synced_at::text AS last_synced_at
        FROM banking.bank_accounts
       WHERE operating_company_id = $1::uuid AND is_active = true
         AND (last_synced_at IS NULL OR last_synced_at < now() - interval '24 hours')
    `,
    [operating_company_id]
  );
  const stillOpenAccountIds: string[] = [];
  const asOfDate = new Date().toISOString().slice(0, 10);
  for (const acct of rows.rows) {
    stillOpenAccountIds.push(acct.id);
    await openOrRefreshAlert(client, {
      operating_company_id,
      bank_account_id: acct.id,
      reconciliation_session_id: null,
      as_of_date: asOfDate,
      drift_kind: "stale_feed",
      bank_balance_cents: Number(acct.current_balance_cents),
      book_balance_cents: Number(acct.current_balance_cents),
      drift_cents: 0,
      tolerance_cents: 0,
    });
  }
  const opened = stillOpenAccountIds.length; // idempotent — openOrRefreshAlert already dedupes
  const closed = await closeAlertsNotIn(client, operating_company_id, "stale_feed", stillOpenAccountIds);
  return { opened, closed };
}

// Runs after every reconciliation finalize and once nightly (cron). Never posts a journal entry —
// no call in this file ever touches accounting.journal_entries or postSourceTransaction.
export async function runDriftDetectors(client: DbClient, operating_company_id: string) {
  const sessionVariance = await detectSessionVarianceDrift(client, operating_company_id);
  const liveBalance = await detectLiveBalanceDrift(client, operating_company_id);
  const staleFeed = await detectStaleFeedDrift(client, operating_company_id);
  return { session_variance: sessionVariance, live_balance: liveBalance, stale_feed: staleFeed };
}

export async function resolveDriftAlert(
  client: DbClient,
  input: {
    operating_company_id: string;
    alert_id: string;
    resolved_by_user_id: string;
    note: string;
    resolving_journal_entry_id?: string | null;
  }
) {
  const note = input.note?.trim() ?? "";
  if (!note) throw new DriftAlertError("resolution_note_required", "A written reason is required to resolve a drift alert.");

  const res = await client.query<{ id: string; resolved_at: string | null; voided_at: string | null }>(
    `
      SELECT id, resolved_at::text AS resolved_at, voided_at::text AS voided_at
        FROM banking.reconciliation_drift_alerts
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       FOR UPDATE
    `,
    [input.alert_id, input.operating_company_id]
  );
  const alert = res.rows[0];
  if (!alert) throw new DriftAlertError("drift_alert_not_found");
  if (alert.voided_at) throw new DriftAlertError("drift_alert_voided");
  if (alert.resolved_at) throw new DriftAlertError("drift_alert_already_resolved");

  await client.query(
    `
      UPDATE banking.reconciliation_drift_alerts
         SET resolved_at = now(),
             resolved_by_user_id = $1::uuid,
             resolution_note = $2,
             resolving_journal_entry_id = $3::uuid,
             updated_at = now()
       WHERE id = $4::uuid
    `,
    [input.resolved_by_user_id, note, input.resolving_journal_entry_id ?? null, input.alert_id]
  );
  return { id: input.alert_id, resolved: true };
}
