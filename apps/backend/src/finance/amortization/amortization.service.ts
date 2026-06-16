/**
 * FH-3 Amortization engine — create loans + generate/store amortization schedules.
 * Reuses FH-2 loan-math for the schedule. Writes ONLY to finance.* (its own tables); performs
 * NO GL posting (no accounting.* writes, no posting engine). Posting the principal/interest split
 * is a LATER gated step behind FINANCE_HUB_AMORTIZATION_POST_ENABLED — not built here.
 */
import { z } from "zod";
import { buildAmortizationSchedule, classifyLoanType, type AmortizationRow } from "../loan-wizard/loan-math.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const createLoanInputSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  lender: z.string().trim().max(200).nullable().optional(),
  original_principal_cents: z.number().int().positive(),
  interest_rate_bps: z.number().int().min(0).max(100000), // 100000 bps = 1000%
  term_months: z.number().int().positive().max(600),
  first_payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gl_liability_account_id: z.string().uuid().nullable().optional(),
  gl_interest_expense_account_id: z.string().uuid().nullable().optional(),
  payment_account_id: z.string().uuid().nullable().optional(),
});
export type CreateLoanInput = z.infer<typeof createLoanInputSchema>;

export type LoanRecord = {
  id: string;
  name: string;
  lender: string | null;
  original_principal_cents: number;
  interest_rate_bps: number;
  term_months: number;
  first_payment_date: string;
  loan_type: "note_payable" | "loan_payable";
  status: string;
};

/** bps → annual percent (650 bps → 6.5). */
const bpsToPct = (bps: number) => bps / 100;

/** Create a loan and generate+persist its amortization schedule (finance.* only; no GL posting). */
export async function createLoanWithSchedule(
  client: DbClient,
  actorUserId: string,
  input: CreateLoanInput
): Promise<{ loan: LoanRecord; rows: AmortizationRow[] }> {
  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO finance.loans (
        operating_company_id, name, lender, original_principal_cents, interest_rate_bps,
        term_months, first_payment_date, gl_liability_account_id, gl_interest_expense_account_id,
        payment_account_id, created_by_user_id, updated_by_user_id
      ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11::uuid,$11::uuid)
      RETURNING id::text
    `,
    [
      input.operating_company_id, input.name, input.lender ?? null, input.original_principal_cents,
      input.interest_rate_bps, input.term_months, input.first_payment_date,
      input.gl_liability_account_id ?? null, input.gl_interest_expense_account_id ?? null,
      input.payment_account_id ?? null, actorUserId,
    ]
  );
  const loanId = ins.rows[0]?.id;
  if (!loanId) throw new Error("loan_create_failed");

  const rows = buildAmortizationSchedule({
    principalCents: input.original_principal_cents,
    annualRatePct: bpsToPct(input.interest_rate_bps),
    termMonths: input.term_months,
    firstPaymentDate: input.first_payment_date,
  });

  for (const r of rows) {
    await client.query(
      `
        INSERT INTO finance.loan_amortization_rows (
          operating_company_id, loan_id, payment_number, due_date, payment_cents,
          principal_cents, interest_cents, remaining_balance_cents, created_by_user_id, updated_by_user_id
        ) VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9::uuid,$9::uuid)
      `,
      [input.operating_company_id, loanId, r.period, r.date, r.payment_cents, r.principal_cents, r.interest_cents, r.balance_cents, actorUserId]
    );
  }

  // Audit the loan creation (mutating service must emit to the audit spine).
  await appendCrudAudit(
    client,
    actorUserId,
    "finance.loan.created",
    {
      loan_id: loanId,
      operating_company_id: input.operating_company_id,
      name: input.name,
      original_principal_cents: input.original_principal_cents,
      interest_rate_bps: input.interest_rate_bps,
      term_months: input.term_months,
      amortization_rows: rows.length,
    },
    "info"
  );

  return {
    loan: {
      id: loanId,
      name: input.name,
      lender: input.lender ?? null,
      original_principal_cents: input.original_principal_cents,
      interest_rate_bps: input.interest_rate_bps,
      term_months: input.term_months,
      first_payment_date: input.first_payment_date,
      loan_type: classifyLoanType(input.term_months),
      status: "active",
    },
    rows,
  };
}

export async function listLoans(client: DbClient, operatingCompanyId: string): Promise<LoanRecord[]> {
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT id::text, name, lender, original_principal_cents::bigint, interest_rate_bps::int,
             term_months::int, first_payment_date::text, status
      FROM finance.loans
      WHERE operating_company_id = $1::uuid AND is_active = true
      ORDER BY created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({
    id: String(r.id), name: String(r.name), lender: (r.lender as string) ?? null,
    original_principal_cents: Number(r.original_principal_cents), interest_rate_bps: Number(r.interest_rate_bps),
    term_months: Number(r.term_months), first_payment_date: String(r.first_payment_date),
    loan_type: classifyLoanType(Number(r.term_months)), status: String(r.status),
  }));
}

export async function getLoanSchedule(client: DbClient, operatingCompanyId: string, loanId: string) {
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT payment_number::int, due_date::text, payment_cents::bigint, principal_cents::bigint,
             interest_cents::bigint, remaining_balance_cents::bigint, posted
      FROM finance.loan_amortization_rows
      WHERE operating_company_id = $1::uuid AND loan_id = $2::uuid AND is_active = true
      ORDER BY payment_number ASC
    `,
    [operatingCompanyId, loanId]
  );
  return res.rows.map((r) => ({
    payment_number: Number(r.payment_number), due_date: String(r.due_date),
    payment_cents: Number(r.payment_cents), principal_cents: Number(r.principal_cents),
    interest_cents: Number(r.interest_cents), remaining_balance_cents: Number(r.remaining_balance_cents),
    posted: Boolean(r.posted),
  }));
}
