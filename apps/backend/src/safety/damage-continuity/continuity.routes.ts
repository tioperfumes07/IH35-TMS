import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  appendDamage,
  getChain,
  startChain,
  type Queryable,
} from "./continuity.service.js";
import { autoCreateClaimFromDamage, linkClaimToChain } from "./insurance-link.service.js";

const BLOCK_ID = "GAP-38-DAMAGE-INSURANCE-CONTINUITY";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const startContinuityBodySchema = companyQuerySchema;

const linkToChainBodySchema = companyQuerySchema.extend({
  chain_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerDamageContinuityRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/incidents/:id/start-continuity", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = startContinuityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const started = await startChain(client, {
        operatingCompanyId: body.data.operating_company_id,
        initialDamageId: params.data.id,
      });
      if (started.kind === "ok") {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.damage_continuity.chain_started",
          {
            resource_type: "safety.damage_continuity_chains",
            resource_id: started.chain.uuid,
            initial_damage_id: params.data.id,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          BLOCK_ID
        );
      }
      return started;
    });

    if (result.kind === "damage_not_found") return reply.code(404).send({ error: "damage_not_found" });
    if (result.kind === "already_in_chain") {
      return reply.code(409).send({ error: "already_in_chain", chain_id: result.chainId });
    }
    return reply.code(201).send({ chain: result.chain });
  });

  app.patch("/api/v1/safety/incidents/:id/link-to-chain", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = linkToChainBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const appended = await appendDamage(client, {
        operatingCompanyId: body.data.operating_company_id,
        chainId: body.data.chain_id,
        relatedDamageId: params.data.id,
      });
      if (appended.kind === "ok") {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.damage_continuity.damage_appended",
          {
            resource_type: "safety.damage_continuity_chains",
            resource_id: body.data.chain_id,
            related_damage_id: params.data.id,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          BLOCK_ID
        );
      }
      return appended;
    });

    if (result.kind === "chain_not_found") return reply.code(404).send({ error: "chain_not_found" });
    if (result.kind === "damage_not_found") return reply.code(404).send({ error: "damage_not_found" });
    if (result.kind === "already_in_other_chain") {
      return reply.code(409).send({ error: "already_in_other_chain", chain_id: result.chainId });
    }
    return reply.send({ chain: result.chain });
  });

  app.get("/api/v1/safety/incidents/:id/continuity-chain", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const incidentRes = await client.query<{ continuity_chain_id: string | null }>(
        `
          SELECT continuity_chain_id::text
          FROM safety.incidents
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const incident = incidentRes.rows[0];
      if (!incident) return { kind: "incident_not_found" as const };
      if (!incident.continuity_chain_id) return { kind: "no_chain" as const };
      return getChain(client, {
        operatingCompanyId: query.data.operating_company_id,
        chainId: incident.continuity_chain_id,
      });
    });

    if (result.kind === "incident_not_found") return reply.code(404).send({ error: "incident_not_found" });
    if (result.kind === "no_chain") return reply.code(404).send({ error: "no_continuity_chain" });
    if (result.kind === "chain_not_found") return reply.code(404).send({ error: "chain_not_found" });
    return reply.send({ chain: result.chain, damages: result.damages, claim: result.claim });
  });

  app.post("/api/v1/safety/incidents/:id/auto-create-claim", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = startContinuityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const created = await autoCreateClaimFromDamage(client, {
        operatingCompanyId: body.data.operating_company_id,
        damageIncidentId: params.data.id,
      });
      if (created.kind === "created") {
        const chainRes = await client.query<{ continuity_chain_id: string | null }>(
          `SELECT continuity_chain_id::text FROM safety.incidents WHERE id = $1::uuid LIMIT 1`,
          [params.data.id]
        );
        const chainId = chainRes.rows[0]?.continuity_chain_id ?? null;
        if (chainId) {
          await linkClaimToChain(client, {
            operatingCompanyId: body.data.operating_company_id,
            chainId,
            claimId: created.claim.id,
          });
        }
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.damage_continuity.claim_auto_created",
          {
            resource_type: "insurance.claim",
            resource_id: created.claim.id,
            damage_incident_id: params.data.id,
            amount_claimed_cents: created.claim.amount_claimed_cents,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          BLOCK_ID
        );
      }
      return created;
    });

    if (result.kind === "incident_not_found") return reply.code(404).send({ error: "incident_not_found" });
    if (result.kind === "already_linked") {
      return reply.code(409).send({ error: "claim_already_linked", claim_id: result.claimId });
    }
    if (result.kind === "below_threshold") {
      return reply.code(422).send({
        error: "below_auto_claim_threshold",
        damage_amount_cents: result.damageAmountCents,
        threshold_cents: result.thresholdCents,
      });
    }
    if (result.kind === "no_active_policy") {
      return reply.code(422).send({ error: "no_active_policy" });
    }
    return reply.code(201).send({ claim: result.claim });
  });
}
