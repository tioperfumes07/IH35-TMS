import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_ids: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    )
    .refine((ids) => ids.length > 0, { message: "operating_company_ids must contain at least one company" })
    .refine((ids) => ids.every((id) => /^[0-9a-f-]{36}$/i.test(id)), { message: "operating_company_ids must be UUIDs" }),
  start: z.string().date(),
  end: z.string().date(),
});

function currentAuthUser(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canReadMultiEntity(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export async function assertAccessibleCompanyScope(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, input: {
  user_id: string;
  role: string;
  operating_company_ids: string[];
}) {
  const res = await client.query(
    `
      SELECT c.id::text
      FROM org.companies c
      WHERE c.id = ANY($1::uuid[])
        AND c.is_active = true
        AND c.deactivated_at IS NULL
        AND (
          $3::text = 'Owner'
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access a
            WHERE a.user_id = $2::uuid
              AND a.company_id = c.id
              AND a.deactivated_at IS NULL
          )
        )
    `,
    [input.operating_company_ids, input.user_id, input.role]
  );
  const allowed = new Set(res.rows.map((row) => String(row.id)));
  return input.operating_company_ids.every((id) => allowed.has(id));
}

export async function registerMultiEntityAccountingRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/multi-entity/summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReadMultiEntity(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const payload = await withCurrentUser(user.uuid, async (client) => {
      const companyIds = Array.from(new Set(query.data.operating_company_ids));
      const scopeOk = await assertAccessibleCompanyScope(client, {
        user_id: user.uuid,
        role: user.role,
        operating_company_ids: companyIds,
      });
      if (!scopeOk) return { error: "forbidden_company_scope" as const };

      const perCompany = await client.query<{
        operating_company_id: string;
        company_name: string;
        revenue_cents: number;
        expense_cents: number;
        net_income_cents: number;
      }>(
        `
          WITH lines AS (
            SELECT
              je.operating_company_id::text AS operating_company_id,
              a.account_type::text AS account_type,
              jep.debit_or_credit::text AS side,
              jep.amount_cents::bigint AS amount_cents
            FROM accounting.journal_entry_postings jep
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
            JOIN catalogs.accounts a ON a.id = jep.account_id
            WHERE je.operating_company_id = ANY($1::uuid[])
              AND je.entry_date BETWEEN $2::date AND $3::date
          )
          SELECT
            l.operating_company_id,
            COALESCE(c.short_name, c.legal_name)::text AS company_name,
            COALESCE(SUM(
              CASE
                WHEN l.account_type IN ('Income', 'OtherIncome') AND l.side = 'credit' THEN l.amount_cents
                WHEN l.account_type IN ('Income', 'OtherIncome') AND l.side = 'debit' THEN -l.amount_cents
                ELSE 0
              END
            ), 0)::bigint AS revenue_cents,
            COALESCE(SUM(
              CASE
                WHEN l.account_type IN ('Expense', 'OtherExpense', 'CostOfGoodsSold') AND l.side = 'debit' THEN l.amount_cents
                WHEN l.account_type IN ('Expense', 'OtherExpense', 'CostOfGoodsSold') AND l.side = 'credit' THEN -l.amount_cents
                ELSE 0
              END
            ), 0)::bigint AS expense_cents,
            COALESCE(SUM(
              CASE
                WHEN l.account_type IN ('Income', 'OtherIncome') AND l.side = 'credit' THEN l.amount_cents
                WHEN l.account_type IN ('Income', 'OtherIncome') AND l.side = 'debit' THEN -l.amount_cents
                WHEN l.account_type IN ('Expense', 'OtherExpense', 'CostOfGoodsSold') AND l.side = 'debit' THEN -l.amount_cents
                WHEN l.account_type IN ('Expense', 'OtherExpense', 'CostOfGoodsSold') AND l.side = 'credit' THEN l.amount_cents
                ELSE 0
              END
            ), 0)::bigint AS net_income_cents
          FROM lines l
          JOIN org.companies c ON c.id::text = l.operating_company_id
          GROUP BY l.operating_company_id, c.short_name, c.legal_name
          ORDER BY company_name ASC
        `,
        [companyIds, query.data.start, query.data.end]
      );

      const consolidated = perCompany.rows.reduce(
        (acc, row) => ({
          revenue_cents: acc.revenue_cents + Number(row.revenue_cents ?? 0),
          expense_cents: acc.expense_cents + Number(row.expense_cents ?? 0),
          net_income_cents: acc.net_income_cents + Number(row.net_income_cents ?? 0),
        }),
        { revenue_cents: 0, expense_cents: 0, net_income_cents: 0 }
      );

      const accounts = await client.query<{
        account_id: string;
        account_number: string | null;
        account_name: string;
        account_type: string;
        debit_cents: number;
        credit_cents: number;
      }>(
        `
          SELECT
            a.id::text AS account_id,
            a.account_number::text AS account_number,
            a.account_name::text AS account_name,
            a.account_type::text AS account_type,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS debit_cents,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS credit_cents
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE je.operating_company_id = ANY($1::uuid[])
            AND je.entry_date BETWEEN $2::date AND $3::date
          GROUP BY a.id, a.account_number, a.account_name, a.account_type
          ORDER BY a.account_number NULLS LAST, a.account_name
          LIMIT 800
        `,
        [companyIds, query.data.start, query.data.end]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.multi_entity_summary.viewed",
        {
          operating_company_ids: companyIds,
          period_start: query.data.start,
          period_end: query.data.end,
        },
        "info",
        "BLOCK-36-MULTI-ENTITY"
      );

      return {
        period: { start: query.data.start, end: query.data.end },
        companies: companyIds,
        consolidated,
        by_company: perCompany.rows,
        accounts: accounts.rows,
      };
    });

    if ("error" in payload) {
      return reply.code(403).send({ error: payload.error });
    }
    return payload;
  });
}
