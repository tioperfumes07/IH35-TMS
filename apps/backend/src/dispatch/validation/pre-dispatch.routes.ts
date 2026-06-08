import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { validatePreDispatch } from "./pre-dispatch-validator.service.js";

// GAP-14: Pre-Dispatch Validation route — read-only.

const preDispatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_uuid: z.string().uuid().optional().nullable(),
  unit_uuid: z.string().uuid().optional().nullable(),
  trailer_uuid: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
});

export async function registerPreDispatchValidationRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/validation/pre-dispatch", async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const user = req.user!;
    const parsed = preDispatchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { operating_company_id, driver_uuid, unit_uuid, trailer_uuid, customer_id } = parsed.data;

    const result = await validatePreDispatch({
      operating_company_id,
      driver_uuid: driver_uuid ?? null,
      unit_uuid: unit_uuid ?? null,
      trailer_uuid: trailer_uuid ?? null,
      customer_id: customer_id ?? null,
      requesting_user_uuid: user.uuid,
    });

    return reply.send(result);
  });
}
