type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export const MONEY_PROOF_DOCUMENTS = {
  load: { table: "mdata.loads", sourceType: "load", labelSql: "load_number" },
  invoice: { table: "accounting.invoices", sourceType: "invoice", labelSql: "display_id" },
  bill: { table: "accounting.bills", sourceType: "bill", labelSql: "bill_number" },
  expense: { table: "accounting.expenses", sourceType: "expense", labelSql: "expense_number" },
  payment: { table: "accounting.payments", sourceType: "customer_payment", labelSql: "display_id" },
  bill_payment: { table: "accounting.bill_payments", sourceType: "bill_payment", labelSql: "COALESCE(check_number, reference_number)" },
  credit_memo: { table: "accounting.credit_memos", sourceType: "credit_memo", labelSql: "display_id" },
  vendor_credit: { table: "accounting.vendor_credits", sourceType: "vendor_credit", labelSql: "display_id" },
  driver_bill: { table: "driver_finance.driver_bills", sourceType: "driver_bill", labelSql: "bill_number" },
  settlement: { table: "driver_finance.driver_settlements", sourceType: "settlement", linkedType: "driver_settlement", labelSql: "display_id" },
} as const;

export type MoneyProofDocumentType = keyof typeof MONEY_PROOF_DOCUMENTS;

export function isMoneyProofDocumentType(value: string): value is MoneyProofDocumentType {
  return Object.prototype.hasOwnProperty.call(MONEY_PROOF_DOCUMENTS, value);
}

export async function getMoneyProofTrail(
  client: Queryable,
  operatingCompanyId: string,
  documentType: MoneyProofDocumentType,
  documentId: string,
) {
  const config = MONEY_PROOF_DOCUMENTS[documentType];
  const linkedType = "linkedType" in config ? config.linkedType : config.sourceType;
  const document = await client.query(
    `SELECT id::text, trace_no::text, trace_key, ${config.labelSql}::text AS display_id
       FROM ${config.table}
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [documentId, operatingCompanyId],
  );
  if (!document.rows[0]) return null;

  const traceKey = String(document.rows[0].trace_key ?? "");
  const postings = await client.query(
    `SELECT p.id::text AS posting_id, p.journal_entry_uuid::text AS journal_entry_id,
            je.memo, je.entry_date::text, je.status, p.account_id::text,
            a.account_number, a.account_name, p.debit_or_credit,
            p.amount_cents::bigint AS amount_cents, p.description,
            tsl.linked_object_type, tsl.linked_object_id, tsl.relationship_role
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
       LEFT JOIN catalogs.accounts a
         ON a.id = p.account_id AND a.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.transaction_source_links tsl
         ON tsl.journal_entry_posting_id = p.id AND tsl.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $2::uuid
        AND ((p.source_transaction_type = $3::text AND p.source_transaction_id = $1::text)
          OR (p.source_trace_key = $4::text AND $4::text <> '')
          OR (tsl.linked_object_type = $5::text AND tsl.linked_object_id = $1::text))
      ORDER BY je.entry_date DESC, p.id`,
    [documentId, operatingCompanyId, config.sourceType, traceKey, linkedType],
  );

  return {
    document_type: documentType,
    document_id: documentId,
    display_id: document.rows[0].display_id == null ? null : String(document.rows[0].display_id),
    trace_no: String(document.rows[0].trace_no ?? ""),
    trace_key: traceKey,
    postings: postings.rows.map((row) => ({
      ...row,
      amount_cents: Number(row.amount_cents ?? 0),
    })),
  };
}
