type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

/** Human source id — same precedence as account-register reference (never UUID). */
const SOURCE_DISPLAY_ID_SQL = `
        COALESCE(
          NULLIF(btrim(src_inv.display_id), ''),
          NULLIF(btrim(src_bill.bill_number), ''),
          NULLIF(btrim(src_bill.display_id), ''),
          NULLIF(btrim(src_pay.display_id), ''),
          NULLIF(btrim(src_exp.expense_number), ''),
          CASE WHEN jp.source_transaction_type = 'expense' THEN 'Expense' END,
          CASE WHEN jp.source_transaction_type = 'customer_payment' THEN 'Invoice Payment' END,
          NULLIF(btrim(src_bpay_bill.bill_number), ''),
          src_banktx.display_label,
          src_fueltx.display_label,
          src_reimbursement.display_label
        )`;

const SOURCE_DISPLAY_JOINS_SQL = `
      LEFT JOIN accounting.invoices src_inv
        ON jp.source_transaction_type = 'invoice'
       AND src_inv.id::text = jp.source_transaction_id
       AND src_inv.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.bills src_bill
        ON jp.source_transaction_type = 'bill'
       AND src_bill.id::text = jp.source_transaction_id
       AND src_bill.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.payments src_pay
        ON jp.source_transaction_type = 'customer_payment'
       AND src_pay.id::text = jp.source_transaction_id
       AND src_pay.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.expenses src_exp
        ON jp.source_transaction_type = 'expense'
       AND src_exp.id::text = jp.source_transaction_id
       AND src_exp.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.bill_payments src_bpp
        ON jp.source_transaction_type = 'bill_payment'
       AND src_bpp.id::text = jp.source_transaction_id
       AND src_bpp.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.bills src_bpay_bill
        ON src_bpay_bill.id = src_bpp.bill_id
       AND src_bpay_bill.operating_company_id = jp.operating_company_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(bt.merchant_name, ''), NULLIF(bt.description, ''), 'Bank transaction') AS display_label
        FROM banking.bank_transactions bt
        WHERE jp.source_transaction_type = 'bank_categorization'
          AND bt.id::text = jp.source_transaction_id
          AND bt.operating_company_id = jp.operating_company_id
        LIMIT 1
      ) src_banktx ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(ft.transaction_reference, ''), 'Fuel purchase ' || ft.transaction_at::date::text) AS display_label
        FROM fuel.fuel_transactions ft
        WHERE jp.source_transaction_type = 'fuel_event'
          AND ft.id::text = jp.source_transaction_id
          AND ft.operating_company_id = jp.operating_company_id
        LIMIT 1
      ) src_fueltx ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(r.reason, ''), 'Driver ' || replace(r.reimbursement_type, '_', ' ') || ' reimbursement') AS display_label
        FROM driver_finance.driver_reimbursements r
        WHERE jp.source_transaction_type = 'driver_reimbursement'
          AND r.id::text = jp.source_transaction_id
          AND r.operating_company_id = jp.operating_company_id
        LIMIT 1
      ) src_reimbursement ON true`;

export type AccountingAuditTrailEvent = {
  id: string;
  occurred_at: string;
  event_class: "accounting.posting_line_created" | "accounting.posting_line_reversal" | "accounting.posting_line_reversed";
  operating_company_id: string;
  journal_entry_id: string;
  // LINEAGE-ROUTE-OMITS-JE-MEMO — same shape/fix as AccountingSourceLineageRow.memo below: memo IS
  // the JE's human identity, and this listing joined journal_entries + exposed the id without it.
  // Named "memo" (not e.g. "journal_entry_memo") to match AccountingSourceLineageRow.memo — the two
  // types share this file and the same fix, so they share the field name.
  memo: string | null;
  posting_batch_id: string | null;
  source_transaction_type: string | null;
  source_entity_kind: string | null;
  source_transaction_id: string | null;
  source_transaction_display_id: string | null;
  source_transaction_line_id: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  before_state_json: Record<string, unknown> | null;
  after_state_json: Record<string, unknown>;
};

export type AccountingSourceLineageRow = {
  posting_id: string;
  journal_entry_id: string;
  // LINEAGE-ROUTE-OMITS-JE-MEMO — accounting.journal_entries has no number/ref/doc column; memo IS
  // the JE's human identity (#5731/ACCT-F322 established this for 3 other payloads). Named "memo",
  // not "journal_entry_memo", to match the sibling call site's field shape exactly
  // (InvoiceDetailPage.tsx:461 already does entityLabel(je.memo, je.journal_entry_id, "Journal entry")
  // against listAccountingAuditTrail's payload) — so AccountRegisterPage audit history (ACCT-F5066)
  // and the lineage-chips consumer at :387 can switch
  // entityLabel(null, jeId, ...) to entityLabel(row.memo, jeId, ...) with no naming translation needed.
  memo: string | null;
  posting_batch_id: string | null;
  source_transaction_type: string;
  source_entity_kind: string | null;
  source_transaction_id: string;
  source_transaction_display_id: string | null;
  source_transaction_line_id: string | null;
  linked_object_type: string | null;
  linked_object_entity_kind: string | null;
  linked_object_id: string | null;
  linked_object_display_id: string | null;
  relationship_role: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  occurred_at: string;
};

type Cursor = { occurred_at: string; id: string };

export function accountingSourceEntityKind(sourceType: string | null | undefined): string | null {
  switch ((sourceType ?? "").trim().toLowerCase()) {
    case "customer_payment":
    case "payment":
      return "payment";
    case "bill_payment":
      return "bill_payment";
    case "driver_advance":
      return "cash_advance";
    case "transfer":
      return "transfer";
    case "prepaid_asset":
    case "prepaid_amortization":
      return "prepaid_asset";
    case "fixed_asset":
    case "fixed_asset_depreciation":
      return "fixed_asset";
    case "loan":
      return "finance_loan";
    case "lease_contract":
      return "lease_contract";
    case "recurring_template":
      return "recurring_template";
    case "period_close":
      return "period_close";
    case "dispute_disbursement":
      return "settlement_dispute";
    case "driver_settlement":
      return "settlement";
    case "driver_settlement_deduction":
      return "settlement_deduction";
    case "prepaid_amortization_row":
    case "depreciation_schedule_row":
    case "loan_amortization_row":
      return sourceType?.trim() || null;
    case "factoring_customer_payment":
    case "factoring_chargeback":
    case "factoring_reserve_release":
    case "factoring_default_interest":
      return "factoring_advance";
    case "loan_payment":
      return "finance_loan";
    case "prepaid_purchase":
      return "prepaid_asset";
    case "fuel_event":
      return "fuel_transaction";
    case "driver_reimbursement":
      return "driver_reimbursement";
    default:
      return sourceType?.trim() || null;
  }
}

export function decodeAuditTrailCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (!parsed.occurred_at || !parsed.id) return null;
    if (Number.isNaN(Date.parse(parsed.occurred_at))) return null;
    return { occurred_at: parsed.occurred_at, id: parsed.id };
  } catch {
    return null;
  }
}

export function encodeAuditTrailCursor(row: { occurred_at: string; id: string }) {
  return Buffer.from(
    JSON.stringify({
      occurred_at: new Date(row.occurred_at).toISOString(),
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

export async function listAccountingAuditTrail(
  client: Queryable,
  input: {
    operating_company_id: string;
    limit: number;
    cursor?: Cursor | null;
    source_transaction_type?: string;
    source_transaction_id?: string;
    account_id?: string;
  },
): Promise<{ events: AccountingAuditTrailEvent[]; next_cursor: string | null }> {
  const values: unknown[] = [input.operating_company_id];
  const where = ["jp.operating_company_id = $1::uuid"];

  if (input.source_transaction_type) {
    values.push(input.source_transaction_type.trim());
    where.push(`jp.source_transaction_type = $${values.length}::text`);
  }
  if (input.source_transaction_id) {
    values.push(input.source_transaction_id.trim());
    where.push(`jp.source_transaction_id = $${values.length}::text`);
  }
  if (input.account_id) {
    values.push(input.account_id.trim());
    where.push(`jp.account_id = $${values.length}::uuid`);
  }
  if (input.cursor) {
    values.push(input.cursor.occurred_at, input.cursor.id);
    where.push(
      `(COALESCE(je.created_at, pb.created_at, now()), jp.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
    );
  }
  values.push(input.limit + 1);

  const res = await client.query(
    `
      SELECT
        jp.id::text AS id,
        COALESCE(je.created_at, pb.created_at, now())::text AS occurred_at,
        jp.operating_company_id::text AS operating_company_id,
        jp.journal_entry_uuid::text AS journal_entry_id,
        jp.posting_batch_id::text AS posting_batch_id,
        jp.source_transaction_type,
        jp.source_transaction_id,
        ${SOURCE_DISPLAY_ID_SQL} AS source_transaction_display_id,
        jp.source_transaction_line_id,
        jp.account_id::text AS account_id,
        a.account_number,
        a.account_name,
        jp.debit_or_credit,
        jp.amount_cents::bigint AS amount_cents,
        jp.description,
        jp.reversal_of_line_id::text AS reversal_of_line_id,
        jp.reversed_by_line_id::text AS reversed_by_line_id,
        je.memo
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je
        ON je.id = jp.journal_entry_uuid
       AND je.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = jp.posting_batch_id
       AND pb.operating_company_id = jp.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = jp.account_id
       AND a.operating_company_id = jp.operating_company_id
      ${SOURCE_DISPLAY_JOINS_SQL}
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(je.created_at, pb.created_at, now()) DESC, jp.id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const rows = res.rows as Array<Record<string, unknown>>;
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  const events: AccountingAuditTrailEvent[] = page.map((row) => {
    const reversalOf = String(row.reversal_of_line_id ?? "").trim();
    const reversedBy = String(row.reversed_by_line_id ?? "").trim();
    const eventClass: AccountingAuditTrailEvent["event_class"] = reversalOf
      ? "accounting.posting_line_reversal"
      : reversedBy
        ? "accounting.posting_line_reversed"
        : "accounting.posting_line_created";
    const afterState = {
      posting_id: String(row.id ?? ""),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: row.source_transaction_type ? String(row.source_transaction_type) : null,
      source_transaction_id: row.source_transaction_id ? String(row.source_transaction_id) : null,
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      account_id: String(row.account_id ?? ""),
      debit_or_credit: String(row.debit_or_credit ?? ""),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      reversal_of_line_id: reversalOf || null,
      reversed_by_line_id: reversedBy || null,
    };
    const beforeState = reversalOf
      ? { reversal_of_line_id: reversalOf }
      : reversedBy
        ? { reversed_by_line_id: reversedBy }
        : null;
    return {
      id: String(row.id ?? ""),
      occurred_at: new Date(String(row.occurred_at ?? new Date().toISOString())).toISOString(),
      event_class: eventClass,
      operating_company_id: String(row.operating_company_id ?? ""),
      journal_entry_id: String(row.journal_entry_id ?? ""),
      memo: row.memo == null ? null : String(row.memo),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: row.source_transaction_type ? String(row.source_transaction_type) : null,
      source_entity_kind: accountingSourceEntityKind(row.source_transaction_type ? String(row.source_transaction_type) : null),
      source_transaction_id: row.source_transaction_id ? String(row.source_transaction_id) : null,
      source_transaction_display_id: row.source_transaction_display_id ? String(row.source_transaction_display_id) : null,
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      account_id: String(row.account_id ?? ""),
      account_number: row.account_number == null ? null : String(row.account_number),
      account_name: row.account_name == null ? null : String(row.account_name),
      debit_or_credit: (String(row.debit_or_credit ?? "debit") === "credit" ? "credit" : "debit"),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      before_state_json: beforeState,
      after_state_json: afterState,
    };
  });

  const last = events[events.length - 1];
  return {
    events,
    next_cursor: hasMore && last ? encodeAuditTrailCursor({ occurred_at: last.occurred_at, id: last.id }) : null,
  };
}

export async function listAccountingSourceLineage(
  client: Queryable,
  input: {
    operating_company_id: string;
    source_transaction_type: string;
    source_transaction_id: string;
    limit: number;
  },
): Promise<{ rows: AccountingSourceLineageRow[] }> {
  const res = await client.query(
    `
      SELECT
        jp.id::text AS posting_id,
        jp.journal_entry_uuid::text AS journal_entry_id,
        jp.posting_batch_id::text AS posting_batch_id,
        jp.source_transaction_type,
        jp.source_transaction_id,
        ${SOURCE_DISPLAY_ID_SQL} AS source_transaction_display_id,
        jp.source_transaction_line_id,
        tsl.linked_object_type,
        tsl.linked_object_id,
        COALESCE(
          link_inv.display_id,
          link_bill.bill_number,
          link_bill.display_id,
          link_dispute.dispute_description,
          link_settlement.display_id,
          link_load.load_number,
          link_deduction.display_label
        ) AS linked_object_display_id,
        tsl.relationship_role,
        jp.account_id::text AS account_id,
        a.account_number,
        a.account_name,
        jp.debit_or_credit,
        jp.amount_cents::bigint AS amount_cents,
        jp.description,
        je.created_at::text AS occurred_at,
        je.memo
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je
        ON je.id = jp.journal_entry_uuid
       AND je.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.transaction_source_links tsl
        ON tsl.journal_entry_posting_id = jp.id
       AND tsl.operating_company_id = jp.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = jp.account_id
       AND a.operating_company_id = jp.operating_company_id
      ${SOURCE_DISPLAY_JOINS_SQL}
      LEFT JOIN accounting.invoices link_inv
        ON tsl.linked_object_type = 'invoice'
       AND link_inv.id::text = tsl.linked_object_id
       AND link_inv.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.bills link_bill
        ON tsl.linked_object_type = 'bill'
       AND link_bill.id::text = tsl.linked_object_id
       AND link_bill.operating_company_id = jp.operating_company_id
      LEFT JOIN driver_finance.driver_settlement_disputes link_dispute
        ON tsl.linked_object_type = 'dispute_disbursement'
       AND link_dispute.id::text = tsl.linked_object_id
       AND link_dispute.operating_company_id = jp.operating_company_id
      LEFT JOIN driver_finance.driver_settlements link_settlement
        ON tsl.linked_object_type = 'driver_settlement'
       AND link_settlement.id::text = tsl.linked_object_id
       AND link_settlement.operating_company_id = jp.operating_company_id
      LEFT JOIN mdata.loads link_load
        ON tsl.linked_object_type = 'load'
       AND link_load.id::text = tsl.linked_object_id
       AND link_load.operating_company_id = jp.operating_company_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(btrim(d.reason), ''), initcap(replace(d.deduction_type, '_', ' '))) AS display_label
        FROM driver_finance.driver_settlement_deductions d
        WHERE tsl.linked_object_type = 'driver_settlement_deduction'
          AND d.id::text = tsl.linked_object_id
          AND d.operating_company_id = jp.operating_company_id
        LIMIT 1
      ) link_deduction ON true
      WHERE jp.operating_company_id = $1::uuid
        AND jp.source_transaction_type = $2::text
        AND jp.source_transaction_id = $3::text
      ORDER BY je.created_at DESC, jp.id DESC
      LIMIT $4::int
    `,
    [input.operating_company_id, input.source_transaction_type, input.source_transaction_id, input.limit],
  );

  return {
    rows: (res.rows as Array<Record<string, unknown>>).map((row) => ({
      posting_id: String(row.posting_id ?? ""),
      journal_entry_id: String(row.journal_entry_id ?? ""),
      memo: row.memo == null ? null : String(row.memo),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: String(row.source_transaction_type ?? ""),
      source_entity_kind: accountingSourceEntityKind(String(row.source_transaction_type ?? "")),
      source_transaction_id: String(row.source_transaction_id ?? ""),
      source_transaction_display_id: row.source_transaction_display_id ? String(row.source_transaction_display_id) : null,
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      linked_object_type: row.linked_object_type ? String(row.linked_object_type) : null,
      linked_object_entity_kind: accountingSourceEntityKind(row.linked_object_type ? String(row.linked_object_type) : null),
      linked_object_id: row.linked_object_id ? String(row.linked_object_id) : null,
      linked_object_display_id: row.linked_object_display_id ? String(row.linked_object_display_id) : null,
      relationship_role: row.relationship_role ? String(row.relationship_role) : null,
      account_id: String(row.account_id ?? ""),
      account_number: row.account_number == null ? null : String(row.account_number),
      account_name: row.account_name == null ? null : String(row.account_name),
      debit_or_credit: (String(row.debit_or_credit ?? "debit") === "credit" ? "credit" : "debit"),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      occurred_at: new Date(String(row.occurred_at ?? new Date().toISOString())).toISOString(),
    })),
  };
}
