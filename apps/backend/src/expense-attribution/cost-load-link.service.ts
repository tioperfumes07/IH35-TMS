import type { PoolClient } from "pg";
import { generateExpenseNumber } from "./expense-number.js";

type CostSource = "accounting" | "driver_finance";

/**
 * Canonical writer for the forward/reverse load-cost edge.
 *
 * The document header's load_id is not enough: load-cost and feed parity read the durable
 * expense_attribution edge.  This function mints from the one load-scoped sequence, inserts the
 * edge idempotently, then reads it back and fails loud if a prior writer linked the same document
 * to a different load/number.  It never repoints historical money.
 */
export async function linkCostDocumentToLoad(
  client: Pick<PoolClient, "query">,
  input: {
    operatingCompanyId: string;
    source: CostSource;
    documentId: string;
    loadId: string;
    actorUserId?: string | null;
    reason: string;
    numbered?: { number: string; seq: number; loadNumber: string };
  },
): Promise<{ expenseNumber: string; loadNumber: string; sequence: number }> {
  const numbered = input.numbered ?? await generateExpenseNumber(client, input.loadId, input.operatingCompanyId);

  await client.query(
    `INSERT INTO expense_attribution.expense_load_links (
       operating_company_id, expense_id, expense_source, load_id, load_number,
       expense_seq, expense_number, attribution_method, attribution_confidence,
       attribution_reason, attributed_by_user_id
     ) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,'user_assigned','high',$8,$9::uuid)
     ON CONFLICT (expense_source, expense_id) DO NOTHING`,
    [
      input.operatingCompanyId,
      input.documentId,
      input.source,
      input.loadId,
      numbered.loadNumber,
      numbered.seq,
      numbered.number,
      input.reason,
      input.actorUserId ?? null,
    ],
  );

  const linked = await client.query<{
    load_id: string;
    load_number: string;
    expense_number: string;
    expense_seq: number;
  }>(
    `SELECT load_id::text, load_number, expense_number, expense_seq
       FROM expense_attribution.expense_load_links
      WHERE operating_company_id = $1::uuid
        AND expense_source = $2
        AND expense_id = $3::uuid
      LIMIT 1`,
    [input.operatingCompanyId, input.source, input.documentId],
  );
  const row = linked.rows[0];
  if (!row || row.load_id !== input.loadId || row.load_number !== numbered.loadNumber) {
    throw new Error(`cost_load_link_conflict:${input.source}:${input.documentId}`);
  }

  return {
    expenseNumber: row.expense_number,
    loadNumber: row.load_number,
    sequence: Number(row.expense_seq),
  };
}
