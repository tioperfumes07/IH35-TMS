/**
 * expense-stranded-je-repair.service.ts — CC-1 E2 (2026-11-12, AUTH-477).
 *
 * Root cause: Five expense documents were voided before ACCT-F4431310 landed.  The old void path
 * (all four paths: single, bulk, shared void door, governance executor) reversed only
 * source_transaction_type='expense' lines and swallowed SOURCE_NOT_FOUND.  Expenses whose postings
 * carry source_transaction_type='fuel_event' (fuel receipts posted under the receipt identity) had
 * NO 'expense' lines — so the old path found nothing, got SOURCE_NOT_FOUND, swallowed it, and
 * completed the void stamp leaving the fuel JEs live.
 *
 * Fix: for every USMCA expense that is voided (voided_at IS NOT NULL) but has no reversal JE
 * (reversed_by_je_id IS NULL) and still carries live postings, call
 * reverseExpenseDocumentInClientTx (ACCT-F4431310 engine — handles both 'expense' and 'fuel_event'
 * sources), then link reversed_by_je_id.  After this runs, verify-void-is-whole baseline
 * shrinks from count=10 to count=1 (only the 1 silent-void on loads remains).
 *
 * Pattern: each expense is reversed in its own committed transaction (idempotent;
 * resolveExpenseDocumentLivePostings will return all-false for already-fixed documents).
 * Scope: USMCA only (AUTH-477).
 */
import { reverseExpenseDocumentInClientTx, resolveExpenseDocumentLivePostings } from "./expense-void-reversal.js";
import { withLuciaBypass } from "../auth/db.js";
import { todayIso } from "./void.service.js";

export const STRANDED_JE_REPAIR_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA only (AUTH-477)

export class StrandedJeRepairRefused extends Error {}

type StrandedExpense = {
  id: string;
  expense_number: string;
};

type RepairRowOutcome = "dry_run_skip" | "reversed" | "already_clean" | "reversal_failed";

export type StrandedJeRepairResult = {
  dry_run: boolean;
  found_stranded: number;
  reversed: number;
  already_clean: number;
  still_stranded: number;
  rows: Array<{
    expense_id: string;
    expense_number: string;
    outcome: RepairRowOutcome;
    reversing_je_id?: string | null;
    detail?: string;
  }>;
};

async function findCandidates(companyId: string): Promise<StrandedExpense[]> {
  const res = await withLuciaBypass(async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return client.query<StrandedExpense>(
      `SELECT e.id::text, e.expense_number::text
         FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NOT NULL
          AND e.reversed_by_je_id IS NULL
        ORDER BY e.transaction_date, e.expense_number`,
      [companyId]
    );
  }, { actorUserId: "system" });
  return res.rows;
}

export async function repairStrandedExpenseJes(input: {
  companyId: string;
  actorUserId: string;
  dryRun: boolean;
}): Promise<StrandedJeRepairResult> {
  if (input.companyId !== STRANDED_JE_REPAIR_COMPANY_ID) throw new StrandedJeRepairRefused("AUTH-477 scope is USMCA only");

  const candidates = await findCandidates(input.companyId);
  const rows: StrandedJeRepairResult["rows"] = [];
  let foundStranded = 0;
  let reversedCount = 0;
  let alreadyClean = 0;

  for (const exp of candidates) {
    // Check live postings for this expense (outside the repair tx — read-only check for idempotency).
    const live = await withLuciaBypass(async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      return resolveExpenseDocumentLivePostings(client as never, input.companyId, exp.id);
    }, { actorUserId: input.actorUserId });

    const hasLive = live.expense_source_live || live.fuel_event_sources.length > 0;
    if (!hasLive) {
      alreadyClean++;
      rows.push({ expense_id: exp.id, expense_number: exp.expense_number, outcome: "already_clean", detail: "voided, no reversal JE, but no live postings — guard will not flag this" });
      continue;
    }

    foundStranded++;

    if (input.dryRun) {
      rows.push({
        expense_id: exp.id,
        expense_number: exp.expense_number,
        outcome: "dry_run_skip",
        detail: `live expense_source=${live.expense_source_live} fuel_event_sources=[${live.fuel_event_sources.join(",")}]`,
      });
      continue;
    }

    try {
      const reversingJeId = await withLuciaBypass(async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [input.companyId]);
        const rev = await reverseExpenseDocumentInClientTx(client as never, {
          operatingCompanyId: input.companyId,
          expenseId: exp.id,
          actorUserId: input.actorUserId,
          currentBusinessDate: todayIso(),
          memo: `Stranded-JE repair: void reversal of expense ${exp.expense_number} (ACCT-F4431310 path missed at void time)`,
          expenseReverser: "source",
        });
        const jeId = rev.reversal_journal_entry_id;
        // Link the reversing JE back to the expense header (the original void left this NULL).
        await client.query(
          `UPDATE accounting.expenses
              SET reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
                  updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
          [exp.id, jeId, input.companyId]
        );
        return jeId;
      }, { actorUserId: input.actorUserId });

      reversedCount++;
      rows.push({ expense_id: exp.id, expense_number: exp.expense_number, outcome: "reversed", reversing_je_id: reversingJeId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rows.push({ expense_id: exp.id, expense_number: exp.expense_number, outcome: "reversal_failed", detail: msg });
    }
  }

  const stillStranded = rows.filter((r) => r.outcome === "reversal_failed").length;
  return {
    dry_run: input.dryRun,
    found_stranded: foundStranded,
    reversed: reversedCount,
    already_clean: alreadyClean,
    still_stranded: stillStranded,
    rows,
  };
}
