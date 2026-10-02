/**
 * ROUND 326 queue item 10 (G-05) — SETTLEMENT-LINE CATEGORIZATION ENGINE. Settlement lines reached close with
 * item_id, posting_account_id and category all NULL: sixteen writers insert settlement_lines and only some set
 * any of the three, and the account backfill ran only on the load-bookended close. This is the ONE categorizer,
 * run on the settlement's own lines before every close (closeSettlementPayRun and the load-bookended close):
 *
 *   posting_account_id — backfillExistingSettlementLineAccounts (the existing per-line-type role rules: driver
 *                        pay, per-type reimbursement, extra pay, the driver's own escrow, per-deduction recovery);
 *                        one rule set, never a second.
 *   category           — settlementLineCategory(): the source row's own type (reimbursement_type,
 *                        deduction_type) or the line type's PDF section ("loaded_miles", "empty_miles", ...).
 *   item_id            — the catalog map (settlement-pdf-item-map, queue item 8, read BY ID): the printed
 *                        category in the line's description, else the reimbursement type when it names exactly
 *                        one PDF category (scale, toll). Never a name lookup, never a guess; a line the map does
 *                        not cover keeps item_id NULL and is reported. A line that gains an item gets
 *                        quantity 1 @ rate = amount ('each') when it carried no quantity (the
 *                        settlement_lines_item_qty_rate_amount_check all-four-or-none rule).
 * UPDATE-only on NULL columns of the settlement's active lines: never creates a line, never changes an amount.
 */
import { backfillExistingSettlementLineAccounts, type BackfillExistingLinesResult } from "./settlement-lines-materialize.service.js";
import { matchSettlementPdfItem } from "../catalogs/settlement-pdf-item-map.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

const LINE_TYPE_CATEGORY: Record<string, string> = {
  earnings: "loaded_miles",
  deadhead_pay: "empty_miles",
  detention_pay: "detention",
  extra_pay: "extra_pay",
  team_split_primary: "team_split",
  team_split_secondary: "team_split",
  escrow_contribution: "escrow",
  advance_recovery: "advance",
};

/** Reimbursement types that name exactly one printed PDF category (fuel / parking / lumper / other do not). */
const REIMBURSEMENT_TYPE_PDF_CATEGORY: Record<string, string> = {
  scale: "Driver Reimbursement-TPE-Scale Expense",
  toll: "Driver Reimbursement-TPE-Toll Expense",
};

/** Pure: the category a line carries — the source row's own type first, else its line type's PDF section. */
export function settlementLineCategory(line: { line_type: string; reimbursement_type?: string | null; deduction_type?: string | null }): string {
  if (line.line_type === "reimbursement" && line.reimbursement_type) return line.reimbursement_type;
  if (line.line_type === "deduction" && line.deduction_type) return line.deduction_type;
  return LINE_TYPE_CATEGORY[line.line_type] ?? line.line_type;
}

/** Pure: the catalog item for a line, by the map only (description first, then an unambiguous reimbursement type). */
export function settlementLineItemId(operatingCompanyId: string, line: { line_type: string; description: string | null; reimbursement_type?: string | null }): string | null {
  const byText = matchSettlementPdfItem(operatingCompanyId, { description: line.description ?? "" });
  if (byText) return byText.itemId;
  const cat = line.line_type === "reimbursement" && line.reimbursement_type ? REIMBURSEMENT_TYPE_PDF_CATEGORY[line.reimbursement_type] : undefined;
  return cat ? matchSettlementPdfItem(operatingCompanyId, { description: cat })?.itemId ?? null : null;
}

export type CategorizeSettlementLinesResult = {
  accounts: BackfillExistingLinesResult;
  categorized: number;
  itemsAssigned: number;
  itemsUnmapped: number;
};

export async function categorizeSettlementLines(client: Q, input: { settlementId: string; operatingCompanyId: string }): Promise<CategorizeSettlementLinesResult> {
  const accounts = await backfillExistingSettlementLineAccounts(client, input);
  const lines = (await client.query<{ id: string; line_type: string; description: string | null; category: string | null; item_id: string | null; quantity: string | null; reimbursement_type: string | null; deduction_type: string | null }>(
    `SELECT sl.id::text, sl.line_type, sl.description, sl.category, sl.item_id::text, sl.quantity::text,
            dr.reimbursement_type, dsd.deduction_type
       FROM driver_finance.settlement_lines sl
       LEFT JOIN driver_finance.driver_reimbursements dr
         ON sl.source_table = 'driver_finance.driver_reimbursements' AND dr.id::text = sl.source_reference_id::text
       LEFT JOIN driver_finance.driver_settlement_deductions dsd
         ON sl.source_table = 'driver_finance.driver_settlement_deductions' AND dsd.id::text = sl.source_reference_id::text
      WHERE sl.settlement_id = $1::uuid AND sl.operating_company_id = $2::uuid AND sl.is_active = true AND sl.voided_at IS NULL
        AND (sl.category IS NULL OR sl.item_id IS NULL)`,
    [input.settlementId, input.operatingCompanyId]
  )).rows;
  let categorized = 0;
  let itemsAssigned = 0;
  let itemsUnmapped = 0;
  for (const l of lines) {
    if (l.category == null) {
      await client.query(
        `UPDATE driver_finance.settlement_lines SET category = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid AND category IS NULL`,
        [l.id, input.operatingCompanyId, settlementLineCategory(l).slice(0, 50)]
      );
      categorized += 1;
    }
    if (l.item_id == null) {
      const itemId = settlementLineItemId(input.operatingCompanyId, l);
      if (!itemId) { itemsUnmapped += 1; continue; }
      await client.query(
        `UPDATE driver_finance.settlement_lines
            SET item_id = $3::uuid,
                quantity = COALESCE(quantity, 1),
                rate_cents = COALESCE(rate_cents, round(amount * 100)),
                unit_of_measure = COALESCE(unit_of_measure, 'each')
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND item_id IS NULL
            AND (quantity IS NULL OR (rate_cents IS NOT NULL AND unit_of_measure IS NOT NULL))`,
        [l.id, input.operatingCompanyId, itemId]
      );
      itemsAssigned += 1;
    }
  }
  return { accounts, categorized, itemsAssigned, itemsUnmapped };
}
