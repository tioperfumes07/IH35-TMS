import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverBillsForSettlementPeriod } from "./settlements.service.js";

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function hasSettlementSchema(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function registerWeeklyCloseRoutes(app: FastifyInstance) {
  app.post("/api/v1/settlements/weekly-close", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const weekStart = parsed.data.weekStart;
    const weekEnd = addDays(weekStart, 6);

    const created = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      const driversRes = await client.query(
        `
          SELECT DISTINCT d.id
          FROM mdata.drivers d
          INNER JOIN mdata.driver_company_authorizations a
            ON a.driver_id = d.id
           AND a.company_id = $1::uuid
           AND a.is_authorized = true
           AND a.deactivated_at IS NULL
          WHERE d.status::text IN ('Active','Probation','OnLeave')
        `,
        [parsed.data.operating_company_id]
      );

      const results: Array<{ driverId: string; draftSettlementId: string }> = [];

      for (const row of driversRes.rows) {
        const driverId = String(row.id);
        const bills = await listDriverBillsForSettlementPeriod(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          driverId,
          periodStart: weekStart,
          periodEnd: weekEnd,
        });

        const grossCents = bills.reduce((sum, b) => sum + Math.max(Number(b.gross_amount_cents ?? 0), 0), 0);
        const grossPay = grossCents / 100;

        const displayRes = await client.query(`SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`, [
          parsed.data.operating_company_id,
          weekStart,
        ]);
        const displayId =
          (displayRes.rows[0] as { next_id?: string } | undefined)?.next_id ?? `S-${new Date(weekStart).getUTCFullYear()}-0001`;

        const settlementRes = await client.query(
          `
            INSERT INTO driver_finance.driver_settlements (
              operating_company_id, display_id, driver_id, period_start, period_end, status,
              gross_pay, deductions_total, reimbursements_total, net_pay
            )
            VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9)
            RETURNING id::text AS id
          `,
          [
            parsed.data.operating_company_id,
            displayId,
            driverId,
            weekStart,
            weekEnd,
            grossPay,
            0,
            0,
            grossPay,
          ]
        );

        const settlementId = String((settlementRes.rows[0] as { id?: string } | undefined)?.id ?? "");
        if (!settlementId) continue;

        for (const bill of bills) {
          const cents = Number(bill.gross_amount_cents ?? 0) / 100;
          await client.query(
            `
              INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
              VALUES ($1::uuid,'earnings',$2,$3)
            `,
            [settlementId, `Driver bill ${bill.bill_number ?? bill.load_number ?? bill.id}`, cents]
          );
        }

        await appendCrudAudit(client, user.uuid, "driver_finance.settlement.weekly_close_draft", {
          operating_company_id: parsed.data.operating_company_id,
          driver_id: driverId,
          settlement_id: settlementId,
          week_start: weekStart,
          week_end: weekEnd,
        });

        results.push({ driverId, draftSettlementId: settlementId });
      }

      return { rows: results };
    });

    if ("unavailable" in created) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    return reply.code(201).send(created.rows);
  });
}
