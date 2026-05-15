import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createBodySchema = z.object({
  start_date: dateStr,
  end_date: dateStr,
  type: z.enum(["vacation", "sick", "personal"]),
  notes: z.string().max(2000).optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverTimeOffRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/time-off-requests", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;

    const rows = await withCurrentUser(req.user!.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('hr.time_off_requests') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];
      const res = await client.query(
        `
          SELECT id, start_date, end_date, type, status, notes, created_at, decided_at, decision_notes
          FROM hr.time_off_requests
          WHERE driver_id = $1
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [driver.id]
      );
      return res.rows;
    });
    return { requests: rows };
  });

  app.post("/api/v1/driver/time-off-requests", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const row = await withCurrentUser(req.user!.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('hr.time_off_requests') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;

      const oc = await client.query<{ operating_company_id: string }>(
        `SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`,
        [driver.id]
      );
      const operatingCompanyId = oc.rows[0]?.operating_company_id;
      if (!operatingCompanyId) return null;

      const res = await client.query(
        `
          INSERT INTO hr.time_off_requests (
            driver_id, operating_company_id, start_date, end_date, type, notes
          )
          VALUES ($1, $2, $3::date, $4::date, $5, $6)
          RETURNING id, start_date, end_date, type, status, created_at
        `,
        [driver.id, operatingCompanyId, body.data.start_date, body.data.end_date, body.data.type, body.data.notes ?? null]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(503).send({ error: "time_off_unavailable" });
    return row;
  });
}
