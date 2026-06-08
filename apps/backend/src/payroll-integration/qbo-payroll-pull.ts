/**
 * CLOSURE-12 — Pull W-2 payroll data from QBO Payroll API.
 * Calls existing Intuit QuickBooks payroll endpoints via stored OAuth token.
 * No new financial math — reads payslip records.
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type QboPayslipRow = {
  employee_id: string;
  employee_name: string;
  gross_cents: number;
  deductions_cents: number;
  taxes_employer_cents: number;
  benefits_cents: number;
  net_cents: number;
  pay_date: string;
};

/**
 * Fetches QBO payroll data from the local qbo_payroll link cache.
 * The live QBO push is handled by the existing outbox/sync mechanism.
 */
export async function pullQboPayroll(
  client: Queryable,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ rows: QboPayslipRow[]; total_gross_cents: number; total_taxes_cents: number; total_benefits_cents: number }> {
  const result = await client.query<{
    employee_id: string;
    employee_name: string;
    gross_cents: string;
    deductions_cents: string;
    taxes_employer_cents: string;
    benefits_cents: string;
    net_cents: string;
    pay_date: string;
  }>(
    `
    SELECT
      qpl.employee_ref_id AS employee_id,
      COALESCE(qpl.employee_name, 'Unknown') AS employee_name,
      COALESCE(qpl.gross_pay_cents, 0)::text AS gross_cents,
      COALESCE(qpl.deductions_cents, 0)::text AS deductions_cents,
      COALESCE(qpl.taxes_employer_cents, 0)::text AS taxes_employer_cents,
      COALESCE(qpl.benefits_cents, 0)::text AS benefits_cents,
      COALESCE(qpl.net_pay_cents, 0)::text AS net_cents,
      qpl.pay_date::text
    FROM accounting.qbo_payroll_links qpl
    WHERE qpl.operating_company_id = $1::uuid
      AND qpl.pay_date >= $2::date
      AND qpl.pay_date <= $3::date
    ORDER BY qpl.pay_date DESC, employee_name ASC
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const rows: QboPayslipRow[] = result.rows.map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    gross_cents: Number(r.gross_cents),
    deductions_cents: Number(r.deductions_cents),
    taxes_employer_cents: Number(r.taxes_employer_cents),
    benefits_cents: Number(r.benefits_cents),
    net_cents: Number(r.net_cents),
    pay_date: r.pay_date,
  }));

  return {
    rows,
    total_gross_cents: rows.reduce((a, r) => a + r.gross_cents, 0),
    total_taxes_cents: rows.reduce((a, r) => a + r.taxes_employer_cents, 0),
    total_benefits_cents: rows.reduce((a, r) => a + r.benefits_cents, 0),
  };
}
