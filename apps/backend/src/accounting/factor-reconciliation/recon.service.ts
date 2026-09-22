import { withLuciaBypass } from "../../auth/db.js";
import {
  assertFaroDailyImportProvenance,
  FaroDailyImportUntrustedProvenanceError,
} from "../../factoring/faro-daily-import-provenance.js";

type MatchState = "matched" | "missing_in_ledger" | "missing_on_statement" | "amount_mismatch";

// Q11 tolerance rule reused for factor statement matching.
const Q11_FIXED_TOLERANCE_CENTS = 100;
const Q11_PERCENT_TOLERANCE = 0.0001;

function toleranceForAmount(amountCents: number) {
  return Math.max(Q11_FIXED_TOLERANCE_CENTS, Math.round(Math.abs(amountCents) * Q11_PERCENT_TOLERANCE));
}

export type FactorReconciliationRun = {
  id: string;
  operating_company_id: string;
  factor_id: string;
  statement_date: string;
  status: "open" | "closed";
  total_advances_cents: number;
  total_fees_cents: number;
  total_reserves_released_cents: number;
  source_daily_import_id: string | null;
  created_at: string;
};

export type FactorReconciliationItem = {
  id: string;
  run_id: string;
  operating_company_id: string;
  invoice_id: string | null;
  invoice_display_id: string | null;
  statement_invoice_number: string | null;
  ledger_match_state: MatchState;
  factor_amount_cents: number;
  ledger_amount_cents: number;
  variance_cents: number;
  tolerance_cents: number;
  details: Record<string, unknown> | null;
  created_at: string;
};

type StatementLine = {
  invoice_number: string;
  gross_amount_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  fee_amount_cents: number;
  net_amount_cents: number;
};

function normalizeInvoiceNumber(raw: string) {
  return String(raw ?? "").trim().toUpperCase();
}

function deriveState(input: { factorAmountCents: number; ledgerAmountCents: number }) {
  const variance = input.factorAmountCents - input.ledgerAmountCents;
  const tolerance = toleranceForAmount(Math.max(input.factorAmountCents, input.ledgerAmountCents));
  if (Math.abs(variance) <= tolerance) {
    return {
      state: "matched" as const,
      variance_cents: variance,
      tolerance_cents: tolerance,
    };
  }
  return {
    state: "amount_mismatch" as const,
    variance_cents: variance,
    tolerance_cents: tolerance,
  };
}

export async function importStatement(input: {
  operating_company_id: string;
  factor_id: string;
  daily_import_id: string;
  actor_user_uuid: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const dailyImportRes = await client.query<{
      id: string;
      statement_date: string;
      advance_total_cents: number;
      fee_total_cents: number;
      reserve_total_cents: number;
      raw_payload: unknown;
    }>(
      `
        SELECT
          id::text,
          statement_date::text,
          advance_total_cents::bigint AS advance_total_cents,
          fee_total_cents::bigint AS fee_total_cents,
          reserve_total_cents::bigint AS reserve_total_cents,
          raw_payload
        FROM factor.faro_daily_imports
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.daily_import_id, input.operating_company_id]
    );
    const dailyImport = dailyImportRes.rows[0];
    if (!dailyImport) throw new Error("factor_daily_import_not_found");

    // ROUND29.7 standing rule: never let an untrusted-provenance row (raw_payload written outside
    // the app, not FaroCsvLine shape) source a reconciliation run. Refuse loud; the row itself is
    // never touched here — flag and investigate, never delete.
    const provenance = assertFaroDailyImportProvenance(dailyImport.raw_payload);
    if (!provenance.trusted) {
      throw new FaroDailyImportUntrustedProvenanceError(dailyImport.id, provenance.reason);
    }

    const runRes = await client.query<{ id: string }>(
      `
        INSERT INTO factor.reconciliation_runs (
          operating_company_id,
          factor_id,
          statement_date,
          source_daily_import_id,
          status,
          total_advances_cents,
          total_fees_cents,
          total_reserves_released_cents,
          created_by_user_uuid
        )
        VALUES ($1::uuid, $2::uuid, $3::date, $4::uuid, 'open', $5, $6, $7, $8::uuid)
        RETURNING id::text
      `,
      [
        input.operating_company_id,
        input.factor_id,
        dailyImport.statement_date,
        input.daily_import_id,
        Number(dailyImport.advance_total_cents ?? 0),
        Number(dailyImport.fee_total_cents ?? 0),
        Number(dailyImport.reserve_total_cents ?? 0),
        input.actor_user_uuid,
      ]
    );
    const runId = runRes.rows[0]?.id;
    if (!runId) throw new Error("factor_reconciliation_run_create_failed");

    const statementLinesRes = await client.query<StatementLine>(
      `
        SELECT
          invoice_number::text,
          gross_amount_cents::bigint AS gross_amount_cents,
          advance_amount_cents::bigint AS advance_amount_cents,
          reserve_amount_cents::bigint AS reserve_amount_cents,
          fee_amount_cents::bigint AS fee_amount_cents,
          net_amount_cents::bigint AS net_amount_cents
        FROM factor.faro_invoice_lines
        WHERE daily_import_id = $1::uuid
          AND operating_company_id = $2::uuid
        ORDER BY invoice_number ASC
      `,
      [input.daily_import_id, input.operating_company_id]
    );

    // ROUND29.7-RECON-DATE-SCOPE: a factor.faro_daily_imports row was originally always a single
    // day's statement, so "candidate invoices" was exact-date-filtered on the advance's own
    // submitted_at/advanced_at/released_at. Once a statement legitimately spans a window (Round
    // 29.6/29.7: 2026-08-10..2026-09-21, one row), that exact-date filter live-reproduced a false
    // 85-of-89 missing_in_ledger result on a statement that actually ties to Faro's own control
    // totals to the cent -- not because 85 invoices are missing, but because their advances simply
    // weren't dated on the single statement_date this row happens to carry. Matching candidates
    // now goes straight to what the statement itself claims (its own invoice_number list) —
    // simpler and more correct than pre-filtering by date at all. The date window (derived from
    // the statement's own lines' due_on, min..max) is used ONLY for the separate
    // missing_on_statement direction below, where a real date scope is still needed to avoid
    // treating every invoice this vendor has ever advanced as a candidate.
    const statementInvoiceNumbers = statementLinesRes.rows.map((l) => l.invoice_number);
    // ROUND29.8: the date-scope fix above (matching by display_id, not by an exact-date advance)
    // was correct, but it ALSO silently dropped the vendor/advance-existence check the original
    // query had — live-reproduced: 4 of a run's 41 "matched" invoices had NO
    // accounting.factoring_advances row at all (factoring_advance_id IS NULL), matched purely on
    // a coincidental display_id string, never actually purchased by Faro. A statement line only
    // "matches the ledger" if the invoice both exists AND was genuinely advanced by THIS factor —
    // restored that check, still with NO date filter (a real advance can be dated any time; the
    // window only matters for the SEPARATE missing_on_statement direction below).
    const invoiceCandidatesRes = await client.query<{
      invoice_id: string;
      display_id: string | null;
      total_cents: number;
    }>(
      `
        SELECT
          i.id::text AS invoice_id,
          i.display_id::text AS display_id,
          i.total_cents::bigint AS total_cents
        FROM accounting.invoices i
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): i is scoped by the WHERE below, but the
        -- advance it filters against was not -- a cross-entity fa row could surface the wrong
        -- invoice in a reconciliation query filtered by vendor.
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
                                              AND fa.operating_company_id = i.operating_company_id
        WHERE i.operating_company_id = $1::uuid
          AND i.display_id = ANY($2::text[])
          AND fa.factoring_company_vendor_id = $3::uuid
      `,
      [input.operating_company_id, statementInvoiceNumbers, input.factor_id]
    );

    const dateWindowRes = await client.query<{ min_due_on: string | null; max_due_on: string | null }>(
      `
        SELECT min(due_on)::text AS min_due_on, max(due_on)::text AS max_due_on
        FROM factor.faro_invoice_lines
        WHERE daily_import_id = $1::uuid AND operating_company_id = $2::uuid AND superseded_at IS NULL
      `,
      [input.daily_import_id, input.operating_company_id]
    );
    const dateWindow = dateWindowRes.rows[0];
    const missingOnStatementCandidatesRes =
      dateWindow?.min_due_on && dateWindow?.max_due_on
        ? await client.query<{ invoice_id: string; display_id: string | null; total_cents: number }>(
            `
              SELECT
                i.id::text AS invoice_id,
                i.display_id::text AS display_id,
                i.total_cents::bigint AS total_cents
              FROM accounting.invoices i
              -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): i is scoped by the WHERE below, but the
              -- advance it filters against was not -- a cross-entity fa row could surface the wrong
              -- invoice in a reconciliation query filtered by vendor/date.
              JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
                                                    AND fa.operating_company_id = i.operating_company_id
              WHERE i.operating_company_id = $1::uuid
                AND fa.factoring_company_vendor_id = $2::uuid
                AND (
                  fa.submitted_at::date BETWEEN $3::date AND $4::date
                  OR fa.advanced_at::date BETWEEN $3::date AND $4::date
                  OR fa.released_at::date BETWEEN $3::date AND $4::date
                )
                AND NOT (i.display_id = ANY($5::text[]))
            `,
            [input.operating_company_id, input.factor_id, dateWindow.min_due_on, dateWindow.max_due_on, statementInvoiceNumbers]
          )
        : { rows: [] as Array<{ invoice_id: string; display_id: string | null; total_cents: number }> };

    const byDisplayId = new Map<string, { invoice_id: string; total_cents: number }>();
    for (const row of invoiceCandidatesRes.rows) {
      const key = normalizeInvoiceNumber(row.display_id ?? "");
      if (!key) continue;
      byDisplayId.set(key, {
        invoice_id: row.invoice_id,
        total_cents: Number(row.total_cents ?? 0),
      });
    }

    const seenInvoiceIds = new Set<string>();
    for (const line of statementLinesRes.rows) {
      const invoiceKey = normalizeInvoiceNumber(line.invoice_number);
      const found = byDisplayId.get(invoiceKey);
      if (!found) {
        await client.query(
          `
            INSERT INTO factor.reconciliation_items (
              run_id,
              operating_company_id,
              invoice_id,
              statement_invoice_number,
              ledger_match_state,
              factor_amount_cents,
              ledger_amount_cents,
              variance_cents,
              tolerance_cents,
              details
            )
            VALUES ($1::uuid, $2::uuid, NULL, $3, 'missing_in_ledger', $4, 0, $4, $5, $6::jsonb)
          `,
          [
            runId,
            input.operating_company_id,
            line.invoice_number,
            Number(line.gross_amount_cents ?? 0),
            toleranceForAmount(Number(line.gross_amount_cents ?? 0)),
            JSON.stringify({ reason: "statement_invoice_not_found_in_ledger" }),
          ]
        );
        continue;
      }

      seenInvoiceIds.add(found.invoice_id);
      const derived = deriveState({
        factorAmountCents: Number(line.gross_amount_cents ?? 0),
        ledgerAmountCents: Number(found.total_cents ?? 0),
      });
      await client.query(
        `
          INSERT INTO factor.reconciliation_items (
            run_id,
            operating_company_id,
            invoice_id,
            statement_invoice_number,
            ledger_match_state,
            factor_amount_cents,
            ledger_amount_cents,
            variance_cents,
            tolerance_cents,
            details
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          runId,
          input.operating_company_id,
          found.invoice_id,
          line.invoice_number,
          derived.state,
          Number(line.gross_amount_cents ?? 0),
          Number(found.total_cents ?? 0),
          derived.variance_cents,
          derived.tolerance_cents,
          JSON.stringify({
            advance_amount_cents: Number(line.advance_amount_cents ?? 0),
            reserve_amount_cents: Number(line.reserve_amount_cents ?? 0),
            fee_amount_cents: Number(line.fee_amount_cents ?? 0),
            net_amount_cents: Number(line.net_amount_cents ?? 0),
          }),
        ]
      );
    }

    for (const row of missingOnStatementCandidatesRes.rows) {
      if (seenInvoiceIds.has(row.invoice_id)) continue;
      await client.query(
        `
          INSERT INTO factor.reconciliation_items (
            run_id,
            operating_company_id,
            invoice_id,
            statement_invoice_number,
            ledger_match_state,
            factor_amount_cents,
            ledger_amount_cents,
            variance_cents,
            tolerance_cents,
            details
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, 'missing_on_statement', 0, $4::bigint, -($4::bigint), $5, $6::jsonb)
        `,
        [
          runId,
          input.operating_company_id,
          row.invoice_id,
          Number(row.total_cents ?? 0),
          toleranceForAmount(Number(row.total_cents ?? 0)),
          JSON.stringify({ reason: "ledger_invoice_not_present_on_statement" }),
        ]
      );
    }

    const createdRun = await client.query<FactorReconciliationRun>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          factor_id::text,
          statement_date::text,
          status::text,
          total_advances_cents::bigint AS total_advances_cents,
          total_fees_cents::bigint AS total_fees_cents,
          total_reserves_released_cents::bigint AS total_reserves_released_cents,
          source_daily_import_id::text,
          created_at::text
        FROM factor.reconciliation_runs
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [runId]
    );
    return createdRun.rows[0];
  });
}

export async function listReconciliationRuns(input: { operating_company_id: string; factor_id?: string; limit: number }) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const values: unknown[] = [input.operating_company_id];
    const where: string[] = ["r.operating_company_id = $1::uuid"];
    if (input.factor_id) {
      values.push(input.factor_id);
      where.push(`r.factor_id = $${values.length}::uuid`);
    }
    values.push(input.limit);
    const limitIdx = values.length;
    const rows = await client.query<FactorReconciliationRun & { item_count: number; mismatch_count: number }>(
      `
        SELECT
          r.id::text,
          r.operating_company_id::text,
          r.factor_id::text,
          r.statement_date::text,
          r.status::text,
          r.total_advances_cents::bigint AS total_advances_cents,
          r.total_fees_cents::bigint AS total_fees_cents,
          r.total_reserves_released_cents::bigint AS total_reserves_released_cents,
          r.source_daily_import_id::text,
          r.created_at::text,
          COUNT(ri.id)::int AS item_count,
          COUNT(ri.id) FILTER (WHERE ri.ledger_match_state <> 'matched')::int AS mismatch_count
        FROM factor.reconciliation_runs r
        LEFT JOIN factor.reconciliation_items ri ON ri.run_id = r.id
        WHERE ${where.join(" AND ")}
        GROUP BY r.id
        ORDER BY r.statement_date DESC, r.created_at DESC
        LIMIT $${limitIdx}
      `,
      values
    );
    return rows.rows;
  });
}

export async function listReconciliationItems(input: { operating_company_id: string; run_id: string }) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const rows = await client.query<FactorReconciliationItem>(
      `
        SELECT
          ri.id::text,
          ri.run_id::text,
          ri.operating_company_id::text,
          ri.invoice_id::text,
          i.display_id AS invoice_display_id,
          ri.statement_invoice_number,
          ri.ledger_match_state::text,
          ri.factor_amount_cents::bigint AS factor_amount_cents,
          ri.ledger_amount_cents::bigint AS ledger_amount_cents,
          ri.variance_cents::bigint AS variance_cents,
          ri.tolerance_cents::bigint AS tolerance_cents,
          ri.details,
          ri.created_at::text
        FROM factor.reconciliation_items ri
        LEFT JOIN accounting.invoices i
          ON i.id = ri.invoice_id
         AND i.operating_company_id = ri.operating_company_id
        WHERE ri.run_id = $1::uuid
          AND ri.operating_company_id = $2::uuid
        ORDER BY ri.created_at ASC
      `,
      [input.run_id, input.operating_company_id]
    );
    return rows.rows;
  });
}

export async function listImportCandidates(input: { operating_company_id: string; limit: number }) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const rows = await client.query<{
      id: string;
      statement_date: string;
      statement_reference: string;
      source_filename: string | null;
      imported_at: string;
      advance_total_cents: number;
      fee_total_cents: number;
      reserve_total_cents: number;
      factor_id: string | null;
      factor_name: string | null;
    }>(
      `
        SELECT
          di.id::text,
          di.statement_date::text,
          di.statement_reference,
          di.source_filename,
          di.imported_at::text,
          di.advance_total_cents::bigint AS advance_total_cents,
          di.fee_total_cents::bigint AS fee_total_cents,
          di.reserve_total_cents::bigint AS reserve_total_cents,
          (
            SELECT fa.factoring_company_vendor_id::text
            FROM accounting.factoring_advances fa
            WHERE fa.operating_company_id = di.operating_company_id
              AND fa.submitted_at::date = di.statement_date
            ORDER BY fa.created_at DESC
            LIMIT 1
          ) AS factor_id,
          (
            SELECT v.vendor_name::text
            FROM accounting.factoring_advances fa
            JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
                                 AND v.operating_company_id = fa.operating_company_id
            WHERE fa.operating_company_id = di.operating_company_id
              AND fa.submitted_at::date = di.statement_date
            ORDER BY fa.created_at DESC
            LIMIT 1
          ) AS factor_name
        FROM factor.faro_daily_imports di
        WHERE di.operating_company_id = $1::uuid
          AND NOT EXISTS (
            SELECT 1
            FROM factor.reconciliation_runs rr
            WHERE rr.source_daily_import_id = di.id
              AND rr.operating_company_id = di.operating_company_id
          )
        ORDER BY di.statement_date DESC, di.created_at DESC
        LIMIT $2
      `,
      [input.operating_company_id, input.limit]
    );
    return rows.rows;
  });
}
