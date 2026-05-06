import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const manualJeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        account_id: z.string().uuid(),
        dr_amount: z.number().min(0).default(0),
        cr_amount: z.number().min(0).default(0),
      })
    )
    .min(2),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export async function registerBankingManualJeRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/manual-je", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Accountant"].includes(user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = manualJeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const totalDr = b.lines.reduce((sum, line) => sum + Number(line.dr_amount || 0), 0);
    const totalCr = b.lines.reduce((sum, line) => sum + Number(line.cr_amount || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.0001) {
      return reply.code(400).send({ error: "journal_entry_not_balanced", total_dr: totalDr, total_cr: totalCr });
    }

    const created = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const jeRes = await client.query(
        `
          INSERT INTO accounting.journal_entries (
            operating_company_id, entry_date, memo, created_by_user_id
          )
          VALUES ($1, $2::date, $3, $4)
          RETURNING *
        `,
        [b.operating_company_id, b.date, b.memo ?? null, user.uuid]
      );
      const je = jeRes.rows[0];

      for (const line of b.lines) {
        await client.query(
          `
            INSERT INTO accounting.journal_entry_lines (
              journal_entry_id, account_id, dr_amount, cr_amount
            )
            VALUES ($1, $2, $3, $4)
          `,
          [je.id, line.account_id, line.dr_amount, line.cr_amount]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.manual_je.created",
        {
          resource_type: "accounting.journal_entries",
          resource_id: je.id,
          operating_company_id: b.operating_company_id,
          total_dr: totalDr,
          total_cr: totalCr,
          line_count: b.lines.length,
        },
        "info",
        "BT-3-BANKING-REBUILD"
      );

      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "accounting.journal_entries",
          je.id,
          "accounting.manual_je.created",
          JSON.stringify({
            journal_entry_id: je.id,
            operating_company_id: b.operating_company_id,
          }),
        ]
      );
      return je;
    });

    return reply.code(201).send(created);
  });
}
