import type { PoolClient } from "pg";

export async function generateExpenseNumber(
  tx: Pick<PoolClient, "query">,
  loadId: string
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
      LIMIT 1
    `,
    [loadId]
  );

  const loadNumber = String(loadRow.rows[0]?.load_number ?? "");
  if (!loadNumber) throw new Error("load_number_missing");

  const number = `${loadNumber}-${seq}`;
  return { number, seq, loadNumber };
}
