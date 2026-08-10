import { withLuciaBypass } from "../../auth/db.js";

export type JournalEntrySyncHeader = {
  id: string;
  entry_date: string;
  memo: string | null;
  status: "posted" | "voided";
};

export type JournalEntrySyncLine = {
  line_sequence: number;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  qbo_account_id: string | null;
  qbo_class_id: string | null;
  entity_uuid: string | null;
  driver_qbo_vendor_id: string | null;
};

export async function loadJournalEntryForSync(operatingCompanyId: string, journalEntryId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const headerRes = await client.query<JournalEntrySyncHeader>(
      `
        SELECT id, entry_date::text, memo, status
        FROM accounting.journal_entries
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [journalEntryId, operatingCompanyId]
    );
    const header = headerRes.rows[0] ?? null;
    if (!header) return null;
    const linesRes = await client.query<JournalEntrySyncLine>(
      `
        SELECT
          p.line_sequence,
          p.debit_or_credit,
          p.amount_cents::int,
          p.description,
          a.qbo_account_id,
          c.qbo_class_id,
          p.entity_uuid::text,
          d.qbo_vendor_id AS driver_qbo_vendor_id
        FROM accounting.journal_entry_postings p
        -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED). Same shape as ACCT-F136 in
        -- sync-outbound-accounting.entities.ts: these resolve the QuickBooks identifiers a posting is
        -- pushed OUT with (qbo_account_id, qbo_class_id, driver qbo_vendor_id). An unscoped match sends
        -- another entity's QBO id to QuickBooks. The posting p is scoped; these were not.
        LEFT JOIN catalogs.accounts a ON a.id = p.account_id
                                     AND a.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.classes c ON c.id = p.class_id
                                    AND c.operating_company_id = p.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = p.entity_uuid
                                 AND d.operating_company_id = p.operating_company_id
        WHERE p.journal_entry_uuid = $1
          AND p.operating_company_id = $2
        ORDER BY p.line_sequence ASC
      `,
      [journalEntryId, operatingCompanyId]
    );
    return { header, lines: linesRes.rows };
  });
}

export function mapJournalEntryToQboPayload(context: { header: JournalEntrySyncHeader; lines: JournalEntrySyncLine[] }) {
  return {
    TxnDate: context.header.entry_date.slice(0, 10),
    PrivateNote: context.header.memo ?? "",
    Line: context.lines.map((line) => {
      const detail: Record<string, unknown> = {
        PostingType: line.debit_or_credit === "debit" ? "Debit" : "Credit",
      };
      if (line.qbo_account_id) detail.AccountRef = { value: line.qbo_account_id };
      if (line.qbo_class_id) detail.ClassRef = { value: line.qbo_class_id };
      if (line.driver_qbo_vendor_id) {
        detail.Entity = {
          Type: "Vendor",
          EntityRef: { value: line.driver_qbo_vendor_id },
        };
      }
      return {
        Amount: Math.abs(Number(line.amount_cents || 0)) / 100,
        Description: line.description ?? `Line ${line.line_sequence}`,
        DetailType: "JournalEntryLineDetail",
        JournalEntryLineDetail: detail,
      };
    }),
  };
}
