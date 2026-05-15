import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { enqueueEmail } from "../email/queue.service.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function approveRoles(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

const decideBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["approved", "denied"]),
  decision_notes: z.string().max(2000).optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function resolveDriverEmail(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  driverId: string
): Promise<string | null> {
  const res = (await client.query(
    `
      SELECT iu.email
      FROM mdata.drivers d
      JOIN identity.users iu ON iu.id = d.identity_user_id
      WHERE d.id = $1
      LIMIT 1
    `,
    [driverId]
  )) as { rows: Array<{ email: string | null }> };
  const email = res.rows[0]?.email;
  return email && email.includes("@") ? email : null;
}

export async function registerHrTimeOffAdminRoutes(app: FastifyInstance) {
  app.get("/api/v1/hr/time-off-requests", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!approveRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const q = z.object({ operating_company_id: z.string().uuid(), status: z.enum(["pending", "approved", "denied"]).optional() }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('hr.time_off_requests') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];
      const filters: string[] = ["t.operating_company_id = $1"];
      const vals: unknown[] = [q.data.operating_company_id];
      if (q.data.status) {
        vals.push(q.data.status);
        filters.push(`t.status = $${vals.length}`);
      }
      const res = await client.query(
        `
          SELECT
            t.id,
            t.driver_id,
            concat_ws(' ', d.first_name, d.last_name) AS driver_name,
            t.start_date,
            t.end_date,
            t.type,
            t.status,
            t.notes,
            t.created_at,
            t.decided_at,
            t.decision_notes
          FROM hr.time_off_requests t
          JOIN mdata.drivers d ON d.id = t.driver_id
          WHERE ${filters.join(" AND ")}
          ORDER BY t.created_at DESC
          LIMIT 200
        `,
        vals
      );
      return res.rows;
    });
    return { requests: rows };
  });

  app.post("/api/v1/hr/time-off-requests/:id/decide", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!approveRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = decideBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('hr.time_off_requests') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return { err: "unavailable" as const };

      const cur = await client.query<{ id: string; driver_id: string; status: string; operating_company_id: string }>(
        `SELECT id, driver_id, status, operating_company_id FROM hr.time_off_requests WHERE id = $1 LIMIT 1`,
        [params.data.id]
      );
      const row = cur.rows[0];
      if (!row || row.operating_company_id !== body.data.operating_company_id) return { err: "not_found" as const };
      if (row.status !== "pending") return { err: "already_decided" as const };

      await client.query(
        `
          UPDATE hr.time_off_requests
          SET status = $2,
              decided_at = now(),
              decided_by = $3,
              decision_notes = $4
          WHERE id = $1
        `,
        [params.data.id, body.data.status, user.uuid, body.data.decision_notes ?? null]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "hr.time_off_decided",
        { request_id: params.data.id, status: body.data.status },
        "info",
        "P7-BLOCK-M"
      );

      const to = await resolveDriverEmail(client, row.driver_id);
      if (to) {
        const notes = body.data.decision_notes?.trim() ?? "";
        await enqueueEmail({
          operatingCompanyId: body.data.operating_company_id,
          toAddresses: [to],
          subject: `Time off ${body.data.status}`,
          templateKey: "notification-dispatch",
          templateVars: {
            title: `Time off ${body.data.status}`,
            bodyText: `Your time off request was ${body.data.status}.${notes ? `\n\n${notes}` : ""}`,
          },
          queuedByUserId: user.uuid,
        });
      }

      return { ok: true as const };
    });

    if ("err" in payload) {
      if (payload.err === "not_found") return reply.code(404).send({ error: "not_found" });
      if (payload.err === "already_decided") return reply.code(400).send({ error: "already_decided" });
      return reply.code(503).send({ error: "time_off_unavailable" });
    }
    return payload;
  });
}
