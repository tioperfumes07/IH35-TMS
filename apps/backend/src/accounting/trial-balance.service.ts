import { withCurrentUser } from "../auth/db.js";

type TrialBalanceRowDb = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

export type TrialBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: number;
  total_credits: number;
  net_balance: number;
};

export type TrialBalanceSummary = {
  grand_total_debits: number;
  grand_total_credits: number;
  balanced: boolean;
};

export async function getTrialBalanceReport(input: {
  userId: string;
  operating_company_id: string;
  from_date?: string;
  to_date?: string;
}): Promise<{ rows: TrialBalanceRow[]; summary: TrialBalanceSummary }> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const values: unknown[] = [input.operating_company_id];
    const dateFilters: string[] = [];

    if (input.from_date) {
      values.push(input.from_date);
      dateFilters.push(`je.entry_date >= $${values.length}::date`);
    }
    if (input.to_date) {
      values.push(input.to_date);
      dateFilters.push(`je.entry_date <= $${values.length}::date`);
    }

    const dateSql = dateFilters.length > 0 ? `\n          AND ${dateFilters.join("\n          AND ")}` : "";

    const res = await client.query<TrialBalanceRowDb>(
      `
        SELECT
          p.account_id::text AS account_id,
          COALESCE(a.account_number, '') AS account_code,
          COALESCE(a.account_name, '') AS account_name,
          COALESCE(a.account_type, '') AS account_type,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.accounts a
          ON a.id = p.account_id
        WHERE p.operating_company_id = $1::uuid
          AND je.status <> 'voided'
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))${dateSql}
        GROUP BY p.account_id, a.account_number, a.account_name, a.account_type
        ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
      `,
      values
    );

    const rows: TrialBalanceRow[] = res.rows.map((row) => {
      const totalDebits = Number(row.total_debits ?? 0);
      const totalCredits = Number(row.total_credits ?? 0);
      return {
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        total_debits: totalDebits,
        total_credits: totalCredits,
        net_balance: totalDebits - totalCredits,
      };
    });

    const grandTotalDebits = rows.reduce((sum, row) => sum + row.total_debits, 0);
    const grandTotalCredits = rows.reduce((sum, row) => sum + row.total_credits, 0);
    const summary: TrialBalanceSummary = {
      grand_total_debits: grandTotalDebits,
      grand_total_credits: grandTotalCredits,
      balanced: grandTotalDebits === grandTotalCredits,
    };

    return { rows, summary };
  });
}
