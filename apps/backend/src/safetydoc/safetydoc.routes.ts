import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export async function registerSafetyDocRoutes(app: FastifyInstance) {
  // POST /api/v1/safety-docs — create a document template
  app.post("/api/v1/safety-docs", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = z.object({
      operating_company_id: z.string().uuid(),
      title: z.string().min(1).max(300),
      body_html: z.string().min(1),
      doc_type: z.enum(["safety_policy", "drug_test_consent", "mvr_release", "onboarding", "custom"]).default("safety_policy"),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `INSERT INTO safetydoc.document (operating_company_id, title, body_html, doc_type, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.operating_company_id, input.title, input.body_html, input.doc_type, user.uuid]
      );
      return reply.status(201).send({ id: rows[0].id });
    });
  });

  // GET /api/v1/safety-docs — list document templates
  app.get("/api/v1/safety-docs", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);
      const result = await (client as Queryable).query(
        `SELECT id, title, doc_type, version, is_active, created_at
         FROM safetydoc.document
         WHERE operating_company_id = $1 AND is_active = true AND soft_deleted_at IS NULL
         ORDER BY created_at DESC`,
        [operating_company_id]
      );
      return reply.send({ documents: result.rows });
    });
  });

  // POST /api/v1/safety-docs/assign — send document to driver
  app.post("/api/v1/safety-docs/assign", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = z.object({
      operating_company_id: z.string().uuid(),
      document_id: z.string().uuid(),
      driver_id: z.string().uuid(),
      expires_at: z.string().datetime().optional(),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `INSERT INTO safetydoc.assignment
           (operating_company_id, document_id, driver_id, expires_at, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.operating_company_id, input.document_id, input.driver_id, input.expires_at ?? null, user.uuid]
      );
      return reply.status(201).send({ id: rows[0].id });
    });
  });

  // GET /api/v1/safety-docs/assignments/:driver_id — driver PWA fetches pending docs
  app.get("/api/v1/safety-docs/assignments/:driver_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { driver_id } = req.params as { driver_id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);
      const result = await (client as Queryable).query(
        `SELECT a.id, a.status, a.sent_at, a.read_at, a.signed_at, a.expires_at,
                d.title, d.body_html, d.doc_type
         FROM safetydoc.assignment a
         JOIN safetydoc.document d ON d.id = a.document_id
         WHERE a.operating_company_id = $1
           AND a.driver_id = $2
           AND a.is_active = true
           AND a.status IN ('sent','read')
         ORDER BY a.sent_at ASC`,
        [operating_company_id, driver_id]
      );
      return reply.send({ assignments: result.rows });
    });
  });

  // POST /api/v1/safety-docs/assignments/:id/read — driver marks as read
  app.post("/api/v1/safety-docs/assignments/:id/read", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE safetydoc.assignment
         SET status = 'read', read_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND status = 'sent'
         RETURNING id`,
        [id, operating_company_id]
      );
      if (rows.length === 0) return reply.status(404).send({ error: "Assignment not found or not in sent status" });
      return reply.send({ read: true });
    });
  });

  // POST /api/v1/safety-docs/assignments/:id/sign — driver e-signs (immutable after this)
  app.post("/api/v1/safety-docs/assignments/:id/sign", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const input = z.object({
      operating_company_id: z.string().uuid(),
      signature_data: z.string().min(1),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE safetydoc.assignment
         SET status = 'signed',
             signed_at = now(),
             signed_by_driver_id = $1,
             signature_data = $2,
             signature_ip = $3,
             signature_user_agent = $4
         WHERE id = $5 AND operating_company_id = $6 AND status IN ('sent','read')
         RETURNING id`,
        [
          user.uuid,
          input.signature_data,
          (req.headers["x-forwarded-for"] as string) ?? req.ip ?? null,
          req.headers["user-agent"] ?? null,
          id,
          input.operating_company_id,
        ]
      );
      if (rows.length === 0) return reply.status(404).send({ error: "Assignment not found or already signed" });
      return reply.send({ signed: true });
    });
  });

  // GET /api/v1/safety-docs/assignments/:id/evidence — office views signed record
  app.get("/api/v1/safety-docs/assignments/:id/evidence", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);
      const { rows } = await (client as Queryable).query(
        `SELECT a.id, a.status, a.sent_at, a.read_at, a.signed_at,
                a.signed_by_driver_id, a.signature_ip, a.signature_user_agent,
                a.spine_event_id, a.driver_id, a.expires_at,
                d.title, d.doc_type, d.version
         FROM safetydoc.assignment a
         JOIN safetydoc.document d ON d.id = a.document_id
         WHERE a.id = $1 AND a.operating_company_id = $2`,
        [id, operating_company_id]
      );
      if (rows.length === 0) return reply.status(404).send({ error: "Assignment not found" });
      return reply.send({ assignment: rows[0] });
    });
  });
}
