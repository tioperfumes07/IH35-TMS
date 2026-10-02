// Owner ruling 2026-10-02 (00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md): "The spine is
// accounting.transaction_source_links, written by writeTransactionSourceLink ... Repoint the per-customer reserve table to
// join through the spine on linked_object_type = invoice."
//
// Every factoring leg that belongs to an invoice gets its spine link on the SAME transaction as the posting:
//   leg stamped source 'invoice'            -> link invoice
//   leg stamped source 'faro_reserve_entry' -> link faro_reserve_entry (its document) + invoice (resolved through the
//                                              purchase line that carries the entry's Faro invoice number, when there is one)
// Idempotent (writeTransactionSourceLink ON CONFLICT DO NOTHING).
import { writeTransactionSourceLink } from "../accounting/accounting-spine-emit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function writeFactoringSpineLinks(client: DbClient, oci: string, journalEntryId: string, relationshipRole: string) {
  const legs = await client.query<{ id: string; source_transaction_type: string | null; source_transaction_id: string | null; invoice_id: string | null }>(
    `SELECT p.id::text, p.source_transaction_type, p.source_transaction_id::text,
            CASE
              WHEN p.source_transaction_type = 'invoice' THEN p.source_transaction_id::text
              WHEN p.source_transaction_type = 'faro_reserve_entry' THEN (
                SELECT l.invoice_id::text
                  FROM accounting.faro_reserve_entries e
                  JOIN accounting.factoring_purchase_lines l
                    ON l.operating_company_id = e.operating_company_id AND l.faro_invoice_number = e.faro_invoice_number AND l.voided_at IS NULL
                 WHERE e.id::text = p.source_transaction_id::text AND e.operating_company_id = $2::uuid)
            END AS invoice_id
       FROM accounting.journal_entry_postings p
      WHERE p.journal_entry_uuid = $1::uuid AND p.operating_company_id = $2::uuid`,
    [journalEntryId, oci]
  );
  let links = 0;
  for (const leg of legs.rows) {
    if (leg.source_transaction_type === "faro_reserve_entry" && leg.source_transaction_id) {
      await writeTransactionSourceLink(client as never, {
        operating_company_id: oci,
        journal_entry_posting_id: leg.id,
        linked_object_type: "faro_reserve_entry",
        linked_object_id: leg.source_transaction_id,
        relationship_role: "source_transaction",
      });
      links += 1;
    }
    if (leg.invoice_id) {
      await writeTransactionSourceLink(client as never, {
        operating_company_id: oci,
        journal_entry_posting_id: leg.id,
        linked_object_type: "invoice",
        linked_object_id: leg.invoice_id,
        relationship_role: relationshipRole,
      });
      links += 1;
    }
  }
  return links;
}
