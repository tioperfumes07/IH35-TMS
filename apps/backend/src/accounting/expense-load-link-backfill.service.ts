/**
 * LEAD 443.112 #1 (Codex audit, Lead-verified on prod) — every load-attributed expense has its
 * expense_attribution.expense_load_links row.
 *
 * WHY: until G13 (#26629) the Settlement Creator wrote its company expenses directly, skipping the shared expense writer
 * (createExpenseInClientTx), so they carry a load and a load-spine number but no link row (prod 2026-10-12: 64 live USMCA
 * expenses, every one numbered on its own load's spine). The forward path is fixed; this is the Owner engine path for
 * the expenses already written.
 *
 * WHAT IT WRITES: only the link row, through insertExpenseLoadLink — the one writer the shared expense writer uses — with
 * the expense's EXISTING number and the spine sequence that number stands for. It never changes the expense, its lines,
 * amounts, accounts, number or postings. The load's sequence counter is raised to at least that sequence so the next
 * number on the load cannot collide (never lowered).
 *
 * REFUSALS (reported, nothing written): the load belongs to another company; the expense number is not on its load's
 * spine; the number is already held by another link row.
 *
 * Owner only (refusal audited). dryRun returns the plan and writes nothing. Each expense is linked inside its own
 * SAVEPOINT. One audit row per linked expense. Idempotent: a second run considers 0.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { seqFromLoadExpenseNumber } from "../expense-attribution/expense-number.js";
import { linkExpenseToLoadInClientTx } from "./expense-writer.service.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export class ExpenseLoadLinkBackfillError extends Error {
  constructor(public readonly code: "owner_only", message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ExpenseLoadLinkBackfillError";
  }
}

export type ExpenseLoadLinkRow = {
  expense_id: string;
  expense_number: string | null;
  load_number: string | null;
  outcome: "planned" | "linked" | "refused";
  reason?: string;
};

export type ExpenseLoadLinkResult = {
  dry_run: boolean;
  operating_company_id: string;
  considered: number;
  linked: number;
  refused: number;
  expenses: ExpenseLoadLinkRow[];
};

const AUDIT_EVENT = "expense.load_link_backfilled";

/** Owner gate: anyone else is refused with 403 and the refusal is audited. */
export async function refuseNonOwnerExpenseLoadLink(client: Queryable, actor: { userId: string; role?: string | null }, opco: string): Promise<void> {
  if (actor.role === "Owner") return;
  await appendCrudAudit(
    client as never,
    actor.userId,
    "expense.load_link_backfill_refused_non_owner",
    { resource_type: "expense_attribution.expense_load_links", operating_company_id: opco, role: actor.role ?? null },
    "warning",
    "LEAD-443.112-OWNER-ONLY"
  );
  throw new ExpenseLoadLinkBackfillError("owner_only", "Only the Owner can backfill expense load links.", 403);
}

type Candidate = {
  expense_id: string;
  expense_number: string | null;
  load_id: string;
  load_number: string | null;
  load_company_id: string | null;
};

export async function linkExpensesToLoads(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; actorRole?: string | null; dryRun: boolean }
): Promise<ExpenseLoadLinkResult> {
  const opco = input.operatingCompanyId;
  await refuseNonOwnerExpenseLoadLink(client, { userId: input.actorUserId, role: input.actorRole ?? "Owner" }, opco);

  const candidates = (
    await client.query<Candidate>(
      `
        SELECT e.id::text AS expense_id, e.expense_number, e.load_id::text AS load_id,
               l.load_number, l.operating_company_id::text AS load_company_id
          FROM accounting.expenses e
          -- Same-company join: an expense whose load is another company's finds no row here and is refused below.
          LEFT JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
         WHERE e.operating_company_id = $1::uuid
           AND e.load_id IS NOT NULL
           AND e.voided_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM expense_attribution.expense_load_links k
              WHERE k.expense_source = 'accounting' AND k.expense_id = e.id
           )
         ORDER BY e.expense_number NULLS LAST, e.id
      `,
      [opco]
    )
  ).rows;

  const result: ExpenseLoadLinkResult = { dry_run: input.dryRun, operating_company_id: opco, considered: candidates.length, linked: 0, refused: 0, expenses: [] };

  for (const c of candidates) {
    const row: ExpenseLoadLinkRow = { expense_id: c.expense_id, expense_number: c.expense_number, load_number: c.load_number, outcome: "planned" };
    result.expenses.push(row);
    const refuse = (reason: string) => {
      row.outcome = "refused";
      row.reason = reason;
      result.refused += 1;
    };
    if (c.load_company_id !== opco) {
      refuse("load_of_another_company");
      continue;
    }
    const seq = seqFromLoadExpenseNumber(String(c.load_number ?? ""), c.expense_number);
    if (seq === null) {
      refuse("expense_number_not_on_load_spine");
      continue;
    }
    const taken = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM expense_attribution.expense_load_links WHERE operating_company_id = $1::uuid AND expense_number = $2`,
      [opco, c.expense_number]
    );
    if (Number(taken.rows[0]?.n ?? 0) > 0) {
      refuse("expense_number_held_by_another_link");
      continue;
    }
    if (input.dryRun) continue;

    await client.query("SAVEPOINT expense_load_link_backfill");
    try {
      // 443.182 C — the load link is written by the one expense engine.
      await linkExpenseToLoadInClientTx(client as never, {
        operatingCompanyId: opco,
        expenseId: c.expense_id,
        loadId: c.load_id,
        loadNumber: String(c.load_number),
        seq,
        expenseNumber: String(c.expense_number),
        method: "user_assigned",
        confidence: "high",
        reason: "LEAD 443.112 #1: link backfilled from the expense's own load and load-spine number",
        userId: input.actorUserId,
      });
      // The load's counter never sits behind a number already on its spine (raised only, never lowered).
      await client.query(
        `
          INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq) VALUES ($1::uuid, $2)
          ON CONFLICT (load_id) DO UPDATE SET last_seq = GREATEST(expense_attribution.expense_seq_per_load.last_seq, EXCLUDED.last_seq),
                                              updated_at = now()
        `,
        [c.load_id, seq]
      );
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        AUDIT_EVENT,
        {
          resource_type: "accounting.expenses",
          resource_id: c.expense_id,
          operating_company_id: opco,
          expense_number: c.expense_number,
          load_id: c.load_id,
          load_number: c.load_number,
          before: { expense_load_link: null },
          after: { expense_load_link: { load_id: c.load_id, expense_seq: seq, expense_number: c.expense_number } },
        },
        "info",
        "LEAD-443.112-1"
      );
      await client.query("RELEASE SAVEPOINT expense_load_link_backfill");
      row.outcome = "linked";
      result.linked += 1;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT expense_load_link_backfill");
      refuse(`refused_by_database: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    }
  }
  return result;
}
