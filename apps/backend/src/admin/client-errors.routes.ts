import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { withLuciaBypass } from "../auth/db.js";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  stack: z.string().max(50_000).optional(),
  component_stack: z.string().max(50_000).optional(),
  url: z.string().max(2000).optional(),
  user_agent: z.string().max(1000).optional(),
});

export async function registerAdminClientErrorRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/client-errors", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const envelope = {
      message: parsed.data.message,
      stack: parsed.data.stack ?? null,
      component_stack: parsed.data.component_stack ?? null,
      url: parsed.data.url ?? null,
      user_agent: parsed.data.user_agent ?? null,
      role: user.role ?? null,
    };

    const id = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string | null }>(
        `
          SELECT audit.append_event($1::text, $2::text, $3::jsonb, $4::uuid, $5::text) AS id
        `,
        ["web.client_error", "warning", JSON.stringify(envelope), user.uuid, "frontend-error-boundary"]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!id) return reply.code(500).send({ error: "append_failed" });
    return { ok: true, id };
  });
}
