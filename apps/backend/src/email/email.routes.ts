import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { createEmailProviderFromEnv } from "./factory.js";
import { assertAllowedTemplateKey, deriveTextFallback, renderEmailTemplate } from "./render.js";

function ownerAdministrator(role: string) {
  return ["Owner", "Administrator"].includes(role);
}

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const testEmailBodySchema = companyBodySchema.extend({
  to: z.array(z.string().email()).min(1).max(20),
  subject: z.string().trim().min(3).max(200),
  template_key: z.string().trim().min(3).max(120),
  template_vars: z.record(z.string(), z.unknown()).optional(),
});

const queueQuerySchema = companyBodySchema.extend({
  status: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const acknowledgeBodySchema = companyBodySchema;

function decodeCursor(raw: string | undefined): { created_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { created_at?: string; id?: string };
    if (!json.created_at || !json.id) return null;
    return { created_at: json.created_at, id: json.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: string | Date; id: string }) {
  const payload = JSON.stringify({ created_at: new Date(row.created_at).toISOString(), id: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export async function registerEmailRoutes(app: FastifyInstance) {
  app.post("/api/v1/email/test", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = testEmailBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    try {
      assertAllowedTemplateKey(parsed.data.template_key);
      const provider = createEmailProviderFromEnv();
      const rendered = renderEmailTemplate(parsed.data.template_key, parsed.data.template_vars ?? {});
      const text =
        rendered.text ??
        deriveTextFallback(
          rendered.html,
          typeof parsed.data.template_vars?.textBody === "string" ? parsed.data.template_vars.textBody : undefined
        );
      const sent = await provider.send({
        to: parsed.data.to,
        subject: parsed.data.subject,
        html: rendered.html,
        text,
      });
      return { ok: true, message_id: sent.messageId, provider: provider.kind };
    } catch (error) {
      const message = error instanceof Error ? error.message : "email_test_failed";
      return reply.code(400).send({ error: "email_test_failed", message });
    }
  });

  app.get("/api/v1/email/queue", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = queueQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('email.email_queue') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return { items: [] as unknown[], next_cursor: null as string | null };

      const cursor = decodeCursor(parsed.data.cursor);
      const values: unknown[] = [parsed.data.operating_company_id];
      const where: string[] = [`operating_company_id = $1`];

      if (parsed.data.status) {
        values.push(parsed.data.status);
        where.push(`status = $${values.length}`);
      }

      if (cursor) {
        values.push(cursor.created_at, cursor.id);
        where.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }

      const fetchLimit = parsed.data.limit + 1;
      values.push(fetchLimit);

      const sql = `
        SELECT *
        FROM email.email_queue
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length}
      `;

      const res = await client.query(sql, values);
      const hasMore = res.rows.length > parsed.data.limit;
      const rows = hasMore ? res.rows.slice(0, parsed.data.limit) : res.rows;
      const next = hasMore ? encodeCursor(rows[rows.length - 1] as { created_at: string; id: string }) : null;
      return { items: rows, next_cursor: next };
    });

    return payload;
  });

  app.post("/api/v1/email/queue/:id/retry-now", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE email.email_queue
          SET status = 'queued',
              next_retry_at = NULL,
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status IN ('failed','queued','sending')
          RETURNING id
        `,
        [params.data.id, body.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "queue_item_not_found_or_not_retryable" });
    return { ok: true, id: params.data.id };
  });

  app.post("/api/v1/email/alerts/:id/acknowledge", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE email.email_alerts
          SET acknowledged_at = now(),
              acknowledged_by_user_id = $3::uuid,
              resolved_at = COALESCE(resolved_at, now())
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id
        `,
        [params.data.id, body.data.operating_company_id, user.uuid]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "alert_not_found" });
    return { ok: true, id: params.data.id };
  });
}
