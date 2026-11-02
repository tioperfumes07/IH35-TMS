import { postValidatedPostingLinesInClientTx } from "../src/accounting/posting-engine.service.js";
import type { PostingLineWrite, PostingWriterClient } from "../src/accounting/posting-line-writer.js";

/** Local integration fixtures must exercise the complete balanced entry door, never a line-level bypass. */
export async function postBalancedSourceLine(client: PostingWriterClient, line: PostingLineWrite): Promise<string> {
  const header = await client.query<{ id: string }>(
    `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo)
      VALUES ($1::uuid, CURRENT_DATE, 'TST balanced source invariant') RETURNING id::text`, [line.operating_company_id]);
  const primary = { ...line, journal_entry_uuid: header.rows[0].id, line_sequence: 1 };
  const ids = await postValidatedPostingLinesInClientTx(client, [primary, {
    ...primary, line_sequence: 2, debit_or_credit: primary.debit_or_credit === "debit" ? "credit" : "debit",
  }]);
  return ids[0];
}
