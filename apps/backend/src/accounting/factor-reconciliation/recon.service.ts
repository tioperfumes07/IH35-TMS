import { withLuciaBypass } from "../../auth/db.js";

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
    }>(
      `
        SELECT
          id::text,
          statement_date::text,
          advance_total_cents::bigint AS advance_total_cents,
          fee_total_cents::bigint AS fee_total_cents,
          reserve_total_cents::bigint AS reserve_total_cents
        FROM factor.faro_daily_imports
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.daily_import_id, input.operating_company_id]
    );
    const dailyImport = dailyImportRes.rows[0];
    if (!dailyImport) throw new Error("factor_daily_import_not_found");

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
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
        WHERE i.operating_company_id = $1::uuid
          AND fa.factoring_company_vendor_id = $2::uuid
          AND (
            fa.submitted_at::date = $3::date
            OR fa.advanced_at::date = $3::date
            OR fa.released_at::date = $3::date
          )
      `,
      [input.operating_company_id, input.factor_id, dailyImport.statement_date]
    );

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

    for (const row of invoiceCandidatesRes.rows) {
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
          VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, 'missing_on_statement', 0, $4, -$4, $5, $6::jsonb)
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
          id::text,
          run_id::text,
          operating_company_id::text,
          invoice_id::text,
          statement_invoice_number,
          ledger_match_state::text,
          factor_amount_cents::bigint AS factor_amount_cents,
          ledger_amount_cents::bigint AS ledger_amount_cents,
          variance_cents::bigint AS variance_cents,
          tolerance_cents::bigint AS tolerance_cents,
          details,
          created_at::text
        FROM factor.reconciliation_items
        WHERE run_id = $1::uuid
          AND operating_company_id = $2::uuid
        ORDER BY created_at ASC
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
