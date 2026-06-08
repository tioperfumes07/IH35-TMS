import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });

const createTollBody = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid().optional().nullable(),
  toll_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  caseta: z.string().trim().min(1).max(200),
  amount_mxn: z.number().int().min(0).optional().nullable(),
  amount_usd_cents: z.number().int().min(0).optional().nullable(),
  exchange_rate_used: z.number().positive().optional().nullable(),
  payment_method: z.enum(["IAVE", "CASH", "TAG"]).default("CASH"),
  unit_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  receipt_url: z.string().url().optional().nullable(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

export async function mxTollsRoutes(app: FastifyInstance) {
  // GET /api/v1/mx-tolls
  app.get("/api/v1/mx-tolls", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      load_id: z.string().uuid().optional(),
      unit_id: z.string().uuid().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);

    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (q.load_id) { conditions.push(`t.load_id = $${idx++}`); params.push(q.load_id); }
      if (q.unit_id) { conditions.push(`t.unit_id = $${idx++}`); params.push(q.unit_id); }
      if (q.from_date) { conditions.push(`t.toll_date >= $${idx++}`); params.push(q.from_date); }
      if (q.to_date) { conditions.push(`t.toll_date <= $${idx++}`); params.push(q.to_date); }
      conditions.push("t.is_active = true");

      params.push(q.limit, q.offset);

      const { rows } = await client.query(`
        SELECT t.*,
               u.unit_number,
               d.first_name || ' ' || d.last_name AS driver_name
        FROM mdata.mx_tolls_ledger t
        LEFT JOIN mdata.units u ON u.id = t.unit_id
        LEFT JOIN mdata.drivers d ON d.id = t.driver_id
        ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
        ORDER BY t.toll_date DESC, t.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, params);
      return rows;
    });

    reply.send({ data: rows });
  });

  // GET /api/v1/mx-tolls/report — spend by unit
  app.get("/api/v1/mx-tolls/report", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);

    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const { rows } = await client.query(`
        SELECT u.unit_number,
               count(t.id) AS toll_count,
               sum(t.amount_mxn) AS total_mxn,
               sum(t.amount_usd_cents) AS total_usd_cents
        FROM mdata.mx_tolls_ledger t
        JOIN mdata.units u ON u.id = t.unit_id
        WHERE t.toll_date BETWEEN $1 AND $2 AND t.is_active = true
        GROUP BY u.id, u.unit_number
        ORDER BY total_usd_cents DESC NULLS LAST
      `, [q.from_date, q.to_date]);
      return rows;
    });

    reply.send({ data: rows });
  });

  // POST /api/v1/mx-tolls
  app.post("/api/v1/mx-tolls", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createTollBody.parse(req.body);

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const { rows } = await client.query(`
        INSERT INTO mdata.mx_tolls_ledger (
          operating_company_id, tenant_id,
          load_id, toll_date, caseta,
          amount_mxn, amount_usd_cents, exchange_rate_used,
          payment_method, unit_id, driver_id, receipt_url
        ) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `, [
        body.operating_company_id,
        body.load_id ?? null,
        body.toll_date,
        body.caseta,
        body.amount_mxn ?? null,
        body.amount_usd_cents ?? null,
        body.exchange_rate_used ?? null,
        body.payment_method,
        body.unit_id,
        body.driver_id,
        body.receipt_url ?? null,
      ]);
      return rows[0];
    });

    reply.code(201).send({ data: row });
  });

  // DELETE /api/v1/mx-tolls/:id
  app.delete("/api/v1/mx-tolls/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const { operating_company_id } = companyQuery.parse(req.query);

    await withCompany(user.uuid, operating_company_id, async (client) => {
      await client.query(
        `UPDATE mdata.mx_tolls_ledger SET is_active = false, updated_at = now() WHERE id = $1`,
        [id]
      );
    });

    reply.code(204).send();
  });
}
