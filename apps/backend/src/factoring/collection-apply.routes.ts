import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope as _withCompanyScope } from "../accounting/shared.js";
import { applyFaroCollection, CollectionApplyError } from "./collection-apply.service.js";

const applyBodySchema = z.object({
  invoice_id: z.string().uuid(),
  amount_paid_cents: z.coerce.number().int().positive(),
  date_paid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remittance_ref: z.string().trim().min(1).max(200),
  operating_company_id: z.string().uuid(),
});

export async function registerCollectionApplyRoutes(app: FastifyInstance) {
  // POST /api/v1/factoring/collection-apply
  // Records a Faro collection: customer paid Faro, so we close A/R and relieve the advance liability.
  app.post(
    "/api/v1/factoring/collection-apply",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const body = applyBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await applyFaroCollection({
          operating_company_id: body.data.operating_company_id,
          invoice_id: body.data.invoice_id,
          amount_paid_cents: body.data.amount_paid_cents,
          date_paid: body.data.date_paid,
          remittance_ref: body.data.remittance_ref,
          actor_user_id: user.uuid,
          actor_role: user.role,
        });

        const status = result.already_applied ? 200 : 201;
        return reply.code(status).send(result);
      } catch (err) {
        if (err instanceof CollectionApplyError) {
          return reply.code(err.status).send({ error: err.code });
        }
        throw err;
      }
    }
  );
}
