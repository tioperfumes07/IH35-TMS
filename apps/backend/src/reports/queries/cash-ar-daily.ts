import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type CashArDailyData = {
  cash_received_last_24h_cents: number;
  ar_current_cents: number;
  ar_1_30_cents: number;
  ar_31_60_cents: number;
  ar_61_90_cents: number;
  ar_91_plus_cents: number;
  ar_total_open_cents: number;
  open_invoice_count: number;
};

export async function cashArDailyQuery(context: QueryContext): Promise<ReportDataEnvelope<CashArDailyData>> {
  return runReportQuery(context, async (client) => {
    const arRes = await client.query(
      `
        SELECT
          COALESCE(SUM(current_cents), 0)::bigint AS ar_current_cents,
          COALESCE(SUM(bucket_1_30_cents), 0)::bigint AS ar_1_30_cents,
          COALESCE(SUM(bucket_31_60_cents), 0)::bigint AS ar_31_60_cents,
          COALESCE(SUM(bucket_61_90_cents), 0)::bigint AS ar_61_90_cents,
          COALESCE(SUM(bucket_91_plus_cents), 0)::bigint AS ar_91_plus_cents,
          COALESCE(SUM(total_open_cents), 0)::bigint AS ar_total_open_cents,
          COALESCE(SUM(open_invoice_count), 0)::int AS open_invoice_count
        FROM views.ar_aging
        WHERE operating_company_id = $1
      `,
      [context.operatingCompanyId]
    );

    const cashRes = await client.query(
      `
        SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cash_received_last_24h_cents
        FROM accounting.payments
        WHERE operating_company_id = $1
          AND voided_at IS NULL
          AND payment_date >= now() - interval '24 hours'
      `,
      [context.operatingCompanyId]
    );

    const data: CashArDailyData = {
      cash_received_last_24h_cents: Number(cashRes.rows[0]?.cash_received_last_24h_cents ?? 0),
      ar_current_cents: Number(arRes.rows[0]?.ar_current_cents ?? 0),
      ar_1_30_cents: Number(arRes.rows[0]?.ar_1_30_cents ?? 0),
      ar_31_60_cents: Number(arRes.rows[0]?.ar_31_60_cents ?? 0),
      ar_61_90_cents: Number(arRes.rows[0]?.ar_61_90_cents ?? 0),
      ar_91_plus_cents: Number(arRes.rows[0]?.ar_91_plus_cents ?? 0),
      ar_total_open_cents: Number(arRes.rows[0]?.ar_total_open_cents ?? 0),
      open_invoice_count: Number(arRes.rows[0]?.open_invoice_count ?? 0),
    };

    return {
      generatedAt: new Date().toISOString(),
      rowCount: data.open_invoice_count,
      summary: `Cash received 24h: ${data.cash_received_last_24h_cents}c · AR open: ${data.ar_total_open_cents}c`,
      data,
    };
  });
}

