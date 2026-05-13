import type { PoolClient } from "pg";

export async function generateWorkOrderNumber(
  tx: Pick<PoolClient, "query">,
  opts: { operatingCompanyId: string; linkedLoadId?: string | null }
): Promise<string> {
  if (opts.linkedLoadId) {
    const row = await tx.query<{ load_number: string | null }>(
      `SELECT load_number FROM mdata.loads WHERE id = $1 LIMIT 1`,
      [opts.linkedLoadId]
    );
    const loadNumber = String(row.rows[0]?.load_number ?? "").trim();
    const suffix = loadNumber.split("-").pop() ?? loadNumber;
    return `W-${suffix}`;
  }

  const yearMonth = new Date().toISOString().slice(0, 7);
  const ymCompact = yearMonth.replace("-", "");

  const row = await tx.query<{ last_seq: number }>(
    `
      INSERT INTO maintenance.work_order_seq_per_month (operating_company_id, year_month, last_seq)
      VALUES ($1, $2, 1)
      ON CONFLICT (operating_company_id, year_month) DO UPDATE
        SET last_seq = maintenance.work_order_seq_per_month.last_seq + 1,
            updated_at = now()
      RETURNING last_seq
    `,
    [opts.operatingCompanyId, yearMonth]
  );

  const seq = String(row.rows[0]?.last_seq ?? 1).padStart(4, "0");
  return `W-${ymCompact}-${seq}`;
}
