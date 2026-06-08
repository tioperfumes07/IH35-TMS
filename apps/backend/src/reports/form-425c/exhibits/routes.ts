import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../shared.js";
import { buildAllExhibits, getBuiltExhibits, getSingleExhibit } from "./exhibits-builder.service.js";

const buildBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
  filing_uuid: z.string().uuid().optional(),
});

const filingParamsSchema = z.object({
  filing_uuid: z.string().uuid(),
});

const exhibitParamsSchema = filingParamsSchema.extend({
  letter: z.enum(["a", "b", "c", "d", "e", "f"]),
});

function canAccess425cExhibits(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerForm425cExhibitsRoutes(app: FastifyInstance) {
  app.post("/api/v1/reports/form-425c/exhibits/build", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess425cExhibits(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = buildBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const built = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
      buildAllExhibits(client, {
        userId: user.uuid,
        operating_company_id: parsed.data.operating_company_id,
        period_start: parsed.data.period_start,
        period_end: parsed.data.period_end,
        filing_uuid: parsed.data.filing_uuid,
      })
    );

    return reply.code(200).send(built);
  });

  app.get("/api/v1/reports/form-425c/exhibits/:filing_uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess425cExhibits(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const params = filingParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const built = getBuiltExhibits(params.data.filing_uuid);
    if (!built) return reply.code(404).send({ error: "exhibits_not_found" });
    if (built.operating_company_id !== query.data.operating_company_id) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return built;
  });

  app.get("/api/v1/reports/form-425c/exhibits/:filing_uuid/exhibit/:letter", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess425cExhibits(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const params = exhibitParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const built = getBuiltExhibits(params.data.filing_uuid);
    if (!built) return reply.code(404).send({ error: "exhibits_not_found" });
    if (built.operating_company_id !== query.data.operating_company_id) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const exhibit = getSingleExhibit(params.data.filing_uuid, params.data.letter);
    if (!exhibit) return reply.code(404).send({ error: "exhibit_not_found" });

    return { filing_uuid: params.data.filing_uuid, letter: params.data.letter, exhibit };
  });
}
