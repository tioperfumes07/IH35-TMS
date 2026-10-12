import type { PoolClient } from "pg";

/**
 * Load-scoped expense identity (owner 2026-09-01 USMCA chain).
 * First diesel on load 12225 is `12225`. Second is `12225-1`, third `12225-2`.
 * Do not emit `12225-1` as the first number.
 */
export function formatLoadExpenseNumber(loadNumber: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("expense_sequence_failed");
  }
  if (seq === 1) return loadNumber;
  return `${loadNumber}-${seq - 1}`;
}

export async function generateExpenseNumber(
  tx: Pick<PoolClient, "query">,
  loadId: string,
  operatingCompanyId: string
): Promise<{ number: string; seq: number; loadNumber: string }> {
  await tx.query(
    `
      INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq)
      VALUES ($1, 0)
      ON CONFLICT (load_id) DO NOTHING
    `,
    [loadId]
  );

  const seqRes = await tx.query<{ last_seq: number }>(
    `
      UPDATE expense_attribution.expense_seq_per_load
      SET last_seq = last_seq + 1,
          updated_at = now()
      WHERE load_id = $1
      RETURNING last_seq
    `,
    [loadId]
  );

  const seq = Number(seqRes.rows[0]?.last_seq ?? 0);
  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error("expense_sequence_failed");
  }

  const loadRow = await tx.query<{ load_number: string }>(
    `
      SELECT load_number
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [loadId, operatingCompanyId]
  );

  const loadNumber = String(loadRow.rows[0]?.load_number ?? "");
  if (!loadNumber) throw new Error("load_number_missing");

  // R-178: the counter can sit behind numbers already taken on the load (hand-numbered, reissued, voided —
  // voided numbers stay taken). Skip every taken number instead of colliding with
  // uq_accounting_expenses_company_expense_number.
  let s = seq;
  let number = formatLoadExpenseNumber(loadNumber, s);
  for (let i = 0; i < 1000; i += 1) {
    const taken = await tx.query<{ n: number }>(
      `
        SELECT (SELECT count(*) FROM accounting.expenses WHERE operating_company_id = $1::uuid AND expense_number = $2)
             + (SELECT count(*) FROM expense_attribution.expense_load_links WHERE operating_company_id = $1::uuid AND expense_number = $2) AS n
      `,
      [operatingCompanyId, number]
    );
    if (Number(taken.rows[0]?.n ?? 0) === 0) break;
    const bump = await tx.query<{ last_seq: number }>(
      `UPDATE expense_attribution.expense_seq_per_load SET last_seq = last_seq + 1, updated_at = now() WHERE load_id = $1 RETURNING last_seq`,
      [loadId]
    );
    s = Number(bump.rows[0]?.last_seq ?? s + 1);
    number = formatLoadExpenseNumber(loadNumber, s);
  }
  return { number, seq: s, loadNumber };
}

/**
 * LEAD 443.112 #1 — the ONE writer of an expense's expense_attribution.expense_load_links row. The shared expense writer
 * (createExpenseInClientTx, both its auto-attributed and explicit-load branches) and the Owner link backfill
 * (expense-load-link-backfill.service.ts) all write the row through here, so the column set, the CHECK-valid method /
 * confidence literals and the company scope have one definition.
 */
export async function insertExpenseLoadLink(
  tx: Pick<PoolClient, "query">,
  link: {
    operatingCompanyId: string;
    expenseId: string;
    loadId: string;
    loadNumber: string;
    seq: number;
    expenseNumber: string;
    method: "auto_timestamp" | "auto_location" | "manual_override" | "user_assigned";
    confidence: "high" | "medium" | "low";
    reason: string | null;
    userId: string | null;
    /** Reattribution only: the number the expense carried before it moved to this load. */
    overriddenFromExpenseNumber?: string | null;
  }
): Promise<void> {
  await tx.query(
    `
      INSERT INTO expense_attribution.expense_load_links (
        operating_company_id,
        expense_id,
        expense_source,
        load_id,
        load_number,
        expense_seq,
        expense_number,
        attribution_method,
        attribution_confidence,
        attribution_reason,
        attributed_by_user_id,
        overridden_from_expense_number
      )
      VALUES ($1,$2,'accounting',$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      link.operatingCompanyId,
      link.expenseId,
      link.loadId,
      link.loadNumber,
      link.seq,
      link.expenseNumber,
      link.method,
      link.confidence,
      link.reason,
      link.userId,
      link.overriddenFromExpenseNumber ?? null,
    ]
  );
}

/**
 * The load-spine sequence an existing expense number stands for on its load (inverse of formatLoadExpenseNumber):
 * `<load>` -> 1, `<load>-k` -> k + 1. Anything else is not on that load's spine -> null.
 */
export function seqFromLoadExpenseNumber(loadNumber: string, expenseNumber: string | null | undefined): number | null {
  if (!loadNumber || !expenseNumber) return null;
  if (expenseNumber === loadNumber) return 1;
  const prefix = `${loadNumber}-`;
  if (!expenseNumber.startsWith(prefix)) return null;
  const rest = expenseNumber.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(rest)) return null;
  return Number(rest) + 1;
}
