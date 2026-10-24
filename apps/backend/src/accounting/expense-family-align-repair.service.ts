/**
 * expense-family-align-repair.service.ts — OWNER RULING 443.288-A (AUTH-457, CC-2). The statement card credits / card
 * differences that were left on a load their receipt no longer belongs to (the receipt moved, the unlinked child did
 * not) are moved to their receipt's CURRENT load through THE family engine (moveExpenseFamilyToLoad: reclassify by load
 * — reversal + re-post, batch, audit — then the document follows). Amounts and accounts never change.
 * USMCA only · dry run rolls back · refuses unless TB is 0 before and after and the misplaced count reaches 0 · a rerun
 * finds nothing (idempotent). No DELETE.
 */
import { moveExpenseFamilyToLoad } from "./reclassify/reclassify.service.js";

type QueryClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export const EXPENSE_FAMILY_ALIGN_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const REASON = "OWNER RULING 443.288-A (AUTH-457): statement card difference moved to its receipt's load";

export class ExpenseFamilyAlignRefused extends Error {}

/** A live child on another load than its live parent receipt (a parent with no load is not a decision to copy). */
export const MISPLACED_CHILDREN_SQL = `
  SELECT c.id::text AS child_id, c.expense_number AS child_number, c.total_amount_cents::text AS cents,
         p.id::text AS parent_id, p.expense_number AS parent_number, p.load_id::text AS parent_load_id
    FROM accounting.expenses c
    JOIN accounting.expenses p ON p.operating_company_id = c.operating_company_id AND p.id = c.parent_expense_id
   WHERE c.operating_company_id = $1::uuid AND c.voided_at IS NULL AND p.voided_at IS NULL
     AND p.load_id IS NOT NULL AND c.load_id IS DISTINCT FROM p.load_id
   ORDER BY p.id, c.id`;

export type ExpenseFamilyAlignResult = {
  dry_run: boolean; misplaced_before: number; children_moved: number; misplaced_left: number; cents_moved: number;
  tb_before: { net: string; n: string }; tb_after: { net: string; n: string };
  rows: Array<{ child: string | null; parent: string | null; cents: number }>;
};

const tb = async (c: QueryClient, companyId: string) =>
  (await c.query<{ net: string; n: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net, count(*)::text AS n
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!;

export async function alignExpenseFamiliesInClientTx(
  c: QueryClient,
  input: { companyId: string; actorUserId: string; dryRun: boolean },
): Promise<ExpenseFamilyAlignResult> {
  if (input.companyId !== EXPENSE_FAMILY_ALIGN_COMPANY_ID) throw new ExpenseFamilyAlignRefused("AUTH-457 scope is USMCA only");
  await c.query("SAVEPOINT expense_family_align");
  const tbBefore = await tb(c, input.companyId);
  if (tbBefore.net !== "0") throw new ExpenseFamilyAlignRefused(`TB ${tbBefore.net} before`);
  const misplaced = (await c.query<{ child_id: string; child_number: string | null; cents: string; parent_id: string; parent_number: string | null; parent_load_id: string }>(
    MISPLACED_CHILDREN_SQL, [input.companyId])).rows;
  const byParent = new Map<string, string>();
  for (const m of misplaced) byParent.set(m.parent_id, m.parent_load_id);
  let moved = 0;
  for (const [parentId, loadId] of byParent) {
    const r = await moveExpenseFamilyToLoad(c as never, {
      operatingCompanyId: input.companyId, actorUserId: input.actorUserId, parentExpenseIds: [parentId], toLoadId: loadId, reason: REASON,
    });
    moved += r.children_moved;
  }
  const tbAfter = await tb(c, input.companyId);
  if (tbAfter.net !== "0") throw new ExpenseFamilyAlignRefused(`TB ${tbBefore.net} → ${tbAfter.net}`);
  const left = (await c.query(MISPLACED_CHILDREN_SQL, [input.companyId])).rows.length;
  if (left !== 0) throw new ExpenseFamilyAlignRefused(`${left} children still on another load than their receipt`);
  if (input.dryRun) await c.query("ROLLBACK TO SAVEPOINT expense_family_align");
  else await c.query("RELEASE SAVEPOINT expense_family_align");
  return {
    dry_run: input.dryRun, misplaced_before: misplaced.length, children_moved: moved,
    misplaced_left: input.dryRun ? misplaced.length : left,
    cents_moved: misplaced.reduce((s, m) => s + Number(m.cents), 0), tb_before: tbBefore, tb_after: tbAfter,
    rows: misplaced.map((m) => ({ child: m.child_number, parent: m.parent_number, cents: Number(m.cents) })),
  };
}
