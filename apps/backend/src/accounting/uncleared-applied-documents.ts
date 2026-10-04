/**
 * ROUND 363-CUR-A — cleared means CATEGORIZED or MATCHED in Banking (or register_cleared on the
 * payment's own JE). Derived from the GL + bank-feed pointers. No stored cleared total.
 *
 * A payment that is applied to an invoice/bill but has no bank line and no register_cleared flag
 * is uncleared: the aging open number already subtracted it, so the cleared balance adds it back
 * and names the document (owner example: $2,000 bill + $500 unmatched payment → cleared $2,000,
 * payment named "not cleared").
 */
type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type UnclearedDocument = {
  party_id: string;
  document_type: string;
  document_number: string;
  document_date: string;
  amount_cents: number;
};

export type UnclearedBundle = {
  uncleared_documents: UnclearedDocument[];
  uncleared_cents: number;
  cleared_open_cents: number;
};

function bundleFor(partyId: string, docs: UnclearedDocument[], openCents: number): UnclearedBundle {
  const uncleared_documents = docs.filter((d) => d.party_id === partyId);
  const uncleared_cents = uncleared_documents.reduce((s, d) => s + d.amount_cents, 0);
  return {
    uncleared_documents,
    uncleared_cents,
    cleared_open_cents: openCents + uncleared_cents,
  };
}

/**
 * Factoring outstanding liability is already the GL total. Unmatched advances are named beside
 * that total — they are not added back. Cleared = GL minus the unmatched wires.
 */
export function factoringClearedOpenCents(liabilityCents: number, unclearedCents: number): number {
  return Math.round(liabilityCents) - unclearedCents;
}

export function attachUncleared<T extends Record<string, unknown>>(
  rows: T[],
  docs: UnclearedDocument[],
  partyKey: keyof T,
  openCents: (row: T) => number,
): Array<T & UnclearedBundle> {
  return rows.map((row) => ({
    ...row,
    ...bundleFor(String(row[partyKey] ?? ""), docs, openCents(row)),
  }));
}

export async function listUnclearedCustomerPayments(
  client: Queryable,
  operatingCompanyId: string,
  asOfDate: string,
): Promise<UnclearedDocument[]> {
  const res = await client.query(
    `
      SELECT
        i.customer_id::text AS party_id,
        'customer payment'::text AS document_type,
        COALESCE(NULLIF(btrim(p.display_id), ''), p.id::text) AS document_number,
        p.payment_date::text AS document_date,
        SUM(COALESCE(pa.amount_cents, 0))::bigint AS amount_cents
      FROM accounting.payments p
      JOIN accounting.payment_applications pa
        ON pa.payment_id = p.id
       AND pa.operating_company_id = p.operating_company_id
      JOIN accounting.invoices i
        ON i.id = pa.invoice_id
       AND i.operating_company_id = pa.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND p.voided_at IS NULL
        AND p.payment_date <= $2::date
        AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > $2::date)
        AND p.source_bank_transaction_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = p.operating_company_id
            AND bt.matched_payment_id = p.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je
            ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = jep.operating_company_id
          WHERE jep.operating_company_id = p.operating_company_id
            AND jep.source_transaction_type = 'customer_payment'
            AND jep.source_transaction_id = p.id::text
            AND je.voided_at IS NULL
            AND COALESCE(jep.register_cleared, false)
        )
      GROUP BY i.customer_id, p.display_id, p.id, p.payment_date
      HAVING SUM(COALESCE(pa.amount_cents, 0)) > 0
    `,
    [operatingCompanyId, asOfDate],
  );
  return res.rows.map((r) => ({
    party_id: String(r.party_id ?? ""),
    document_type: String(r.document_type ?? "customer payment"),
    document_number: String(r.document_number ?? ""),
    document_date: String(r.document_date ?? ""),
    amount_cents: Number(r.amount_cents ?? 0),
  }));
}

export async function listUnclearedBillPayments(
  client: Queryable,
  operatingCompanyId: string,
  asOfDate: string,
): Promise<UnclearedDocument[]> {
  const res = await client.query(
    `
      SELECT
        COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown') AS party_id,
        'bill payment'::text AS document_type,
        COALESCE(
          NULLIF(btrim(bp.reference_number), ''),
          NULLIF(btrim(bp.check_number), ''),
          bp.id::text
        ) AS document_number,
        bp.payment_date::text AS document_date,
        SUM(COALESCE(bp.amount_cents, 0))::bigint AS amount_cents
      FROM accounting.bill_payments bp
      JOIN accounting.bills b
        ON b.id = bp.bill_id
       AND b.operating_company_id = bp.operating_company_id
      WHERE bp.operating_company_id = $1::uuid
        AND bp.payment_date <= $2::date
        AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
        AND bp.source_bank_transaction_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = bp.operating_company_id
            AND bt.matched_bill_payment_id = bp.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je
            ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = jep.operating_company_id
          WHERE jep.operating_company_id = bp.operating_company_id
            AND jep.source_transaction_type = 'bill_payment'
            AND jep.source_transaction_id = bp.id::text
            AND je.voided_at IS NULL
            AND COALESCE(jep.register_cleared, false)
        )
      GROUP BY COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown'),
               bp.reference_number, bp.check_number, bp.id, bp.payment_date
      HAVING SUM(COALESCE(bp.amount_cents, 0)) > 0
    `,
    [operatingCompanyId, asOfDate],
  );
  return res.rows.map((r) => ({
    party_id: String(r.party_id ?? ""),
    document_type: String(r.document_type ?? "bill payment"),
    document_number: String(r.document_number ?? ""),
    document_date: String(r.document_date ?? ""),
    amount_cents: Number(r.amount_cents ?? 0),
  }));
}

/**
 * 363-CUR-A remainder — Factoring Home outstanding liability.
 * An advance that is on the books (voided_at IS NULL) but has no bank MATCH and no register_cleared
 * JE is uncleared. factoring_advances has no source_bank_transaction_id; the reverse pointer is
 * banking.bank_transactions.matched_factoring_advance_id. Amount is the same net-to-company the
 * deposit writer uses. Do not add these cents back into outstanding_liability — they already are
 * the liability. The surface names the document beside the GL total.
 */
export async function listUnclearedFactoringAdvances(
  client: Queryable,
  operatingCompanyId: string,
  asOfDate: string,
): Promise<UnclearedDocument[]> {
  const res = await client.query(
    `
      SELECT
        COALESCE(fa.factoring_company_vendor_id::text, 'unknown') AS party_id,
        'factoring advance'::text AS document_type,
        COALESCE(NULLIF(btrim(fa.display_id), ''), fa.id::text) AS document_number,
        COALESCE(fa.advanced_at::date, fa.faro_purchase_date)::text AS document_date,
        GREATEST(
          0,
          COALESCE(fa.invoice_total_cents, 0)
          - COALESCE(fa.reserve_amount_cents, 0)
          - COALESCE(fa.factor_fee_cents, 0)
          - COALESCE(fa.wire_fee_cents, 0)
          - COALESCE(fa.cash_rsv_cents, 0)
        )::bigint AS amount_cents
      FROM accounting.factoring_advances fa
      WHERE fa.operating_company_id = $1::uuid
        AND fa.voided_at IS NULL
        AND COALESCE(fa.status, '') <> 'voided'
        AND COALESCE(fa.advanced_at::date, fa.faro_purchase_date) <= $2::date
        AND NOT EXISTS (
          SELECT 1
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = fa.operating_company_id
            AND bt.matched_factoring_advance_id = fa.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je
            ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = jep.operating_company_id
          WHERE jep.operating_company_id = fa.operating_company_id
            AND jep.source_transaction_type = 'factoring_advance'
            AND jep.source_transaction_id = fa.id::text
            AND je.voided_at IS NULL
            AND COALESCE(jep.register_cleared, false)
        )
      ORDER BY COALESCE(fa.advanced_at::date, fa.faro_purchase_date), fa.display_id, fa.id
    `,
    [operatingCompanyId, asOfDate],
  );
  return res.rows.map((r) => ({
    party_id: String(r.party_id ?? ""),
    document_type: String(r.document_type ?? "factoring advance"),
    document_number: String(r.document_number ?? ""),
    document_date: String(r.document_date ?? ""),
    amount_cents: Number(r.amount_cents ?? 0),
  }));
}
