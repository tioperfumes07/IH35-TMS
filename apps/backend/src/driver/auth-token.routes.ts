import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { issueDriverTokenPair, verifyDriverRefreshToken } from "./driver-jwt.js";
import { requireDriverSession } from "./auth.js";

const refreshBodySchema = z.object({
  refresh_token: z.string().min(10),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverAuthTokenRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/me", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const user = req.user;
    const driver = req.driver;
    if (!user || !driver) return reply.code(403).send({ error: "forbidden" });

    const row = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{
        operating_company_id: string | null;
        onboarding_completed_at: string | null;
      }>(
        `
          SELECT d.operating_company_id, u.onboarding_completed_at::text AS onboarding_completed_at
          FROM mdata.drivers d
          JOIN identity.users u ON u.id = d.identity_user_id
          WHERE d.id = $1
          LIMIT 1
        `,
        [driver.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row?.operating_company_id) {
      return reply.code(404).send({ error: "driver_company_not_found" });
    }

    return {
      driver: {
        id: driver.id,
        full_name: driver.full_name,
        status: driver.status,
        preferred_language: driver.preferred_language,
      },
      operating_company_id: row.operating_company_id,
      identity_user_id: user.uuid,
      onboarding_completed_at: row.onboarding_completed_at ?? null,
    };
  });

  app.patch("/api/v1/driver/me/onboarding", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const user = req.user;
    const driver = req.driver;
    if (!user || !driver) return reply.code(403).send({ error: "forbidden" });

    const parsed = z
      .object({ complete: z.boolean() })
      .strict()
      .safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        parsed.data.complete
          ? `UPDATE identity.users SET onboarding_completed_at = now() WHERE id = $1`
          : `UPDATE identity.users SET onboarding_completed_at = NULL WHERE id = $1`,
        [user.uuid]
      );
    });

    return { ok: true, onboarding_completed_at: parsed.data.complete ? new Date().toISOString() : null };
  });

  app.post("/api/v1/driver/auth/refresh", async (req, reply) => {
    const parsed = refreshBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const claims = verifyDriverRefreshToken(parsed.data.refresh_token);
    if (!claims) return reply.code(401).send({ error: "invalid_refresh_token" });

    const roleRow = await withCurrentUser(claims.sub, async (client) => {
      const res = await client.query<{ role: string; deactivated_at: string | null }>(
        `SELECT role, deactivated_at FROM identity.users WHERE id = $1 LIMIT 1`,
        [claims.sub]
      );
      return res.rows[0] ?? null;
    });

    if (!roleRow || roleRow.deactivated_at || roleRow.role !== "Driver") {
      return reply.code(403).send({ error: "driver_refresh_forbidden" });
    }

    const tokens = issueDriverTokenPair(claims.sub, "Driver");
    return reply.send(tokens);
  });
}
