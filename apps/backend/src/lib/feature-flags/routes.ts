import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  createFlag,
  isEnabled,
  listFlags,
  listOverrides,
  removeOverride,
  setOverride,
  updateFlag,
} from "./service.js";

const checkQuerySchema = z.object({
  key: z.string().min(1),
  operating_company_id: z.string().uuid().optional(),
});

const createFlagSchema = z.object({
  flag_key: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  default_enabled: z.boolean().optional(),
  rollout_pct: z.number().min(0).max(100).optional(),
});

const updateFlagSchema = z.object({
  description: z.string().max(2000).optional(),
  default_enabled: z.boolean().optional(),
  rollout_pct: z.number().min(0).max(100).optional(),
});

const overrideBodySchema = z.object({
  flag_key: z.string().min(1),
  operating_company_id: z.string().uuid().optional(),
  user_uuid: z.string().uuid().optional(),
  enabled: z.boolean(),
  expires_at: z.string().datetime().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ownerUser(req: FastifyRequest, reply: FastifyReply) {
  const user = authUser(req, reply);
  if (!user) return null;
  if (user.role !== "Owner") {
    void reply.code(403).send({ error: "owner_only" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerFeatureFlagRoutes(app: FastifyInstance) {
  app.get("/api/feature-flags/check", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = checkQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const enabled = await withCurrentUser(user.uuid, async (client) =>
      isEnabled(client, parsed.data.key, {
        operating_company_id: parsed.data.operating_company_id ?? null,
        user_uuid: user.uuid,
      })
    );

    return reply.send({ flag_key: parsed.data.key, enabled });
  });

  app.get("/api/feature-flags", async (req, reply) => {
    const user = ownerUser(req, reply);
    if (!user) return;

    const payload = await withCurrentUser(user.uuid, async (client) => {
      const [flags, overrides] = await Promise.all([listFlags(client), listOverrides(client)]);
      return { flags, overrides };
    });
    return reply.send(payload);
  });

  app.post("/api/feature-flags", async (req, reply) => {
    const user = ownerUser(req, reply);
    if (!user) return;
    const parsed = createFlagSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    try {
      const flag = await withCurrentUser(user.uuid, async (client) => createFlag(client, parsed.data));
      return reply.code(201).send({ flag });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes("duplicate key")) return reply.code(409).send({ error: "flag_exists" });
      throw err;
    }
  });

  app.patch<{ Params: { flag_key: string } }>("/api/feature-flags/:flag_key", async (req, reply) => {
    const user = ownerUser(req, reply);
    if (!user) return;
    const parsed = updateFlagSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const flagKey = String(req.params.flag_key ?? "").trim();
    if (!flagKey) return reply.code(400).send({ error: "validation_error" });

    const flag = await withCurrentUser(user.uuid, async (client) => updateFlag(client, flagKey, parsed.data));
    if (!flag) return reply.code(404).send({ error: "flag_not_found" });
    return reply.send({ flag });
  });

  app.post("/api/feature-flags/overrides", async (req, reply) => {
    const user = ownerUser(req, reply);
    if (!user) return;
    const parsed = overrideBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    if (!parsed.data.operating_company_id && !parsed.data.user_uuid) {
      return reply.code(400).send({ error: "override_target_required" });
    }

    try {
      const override = await withCurrentUser(user.uuid, async (client) =>
        setOverride(client, {
          ...parsed.data,
          set_by_user_uuid: user.uuid,
        })
      );
      return reply.code(201).send({ override });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes("override_target_required")) {
        return reply.code(400).send({ error: "override_target_required" });
      }
      throw err;
    }
  });

  app.delete<{ Params: { uuid: string } }>("/api/feature-flags/overrides/:uuid", async (req, reply) => {
    const user = ownerUser(req, reply);
    if (!user) return;
    const overrideUuid = String(req.params.uuid ?? "").trim();
    if (!overrideUuid) return reply.code(400).send({ error: "validation_error" });

    const removed = await withCurrentUser(user.uuid, async (client) => removeOverride(client, overrideUuid));
    if (!removed) return reply.code(404).send({ error: "override_not_found" });
    return reply.send({ ok: true, uuid: removed.uuid });
  });
}
