import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import {
  getFilingDraft,
  listFilings,
  markFilingFiled,
  ownerApproveFiling,
  prepareFiling,
  updateFilingOverrides,
} from "./quarterly-preparer.service.js";

const quarterSchema = z.string().regex(/^\d{4}-Q[1-4]$/i);

const prepareBodySchema = z.object({
  quarter: quarterSchema,
});

const uuidParamsSchema = z.object({
  uuid: z.string().uuid(),
});

const overridesBodySchema = z.object({
  miles_overrides: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
  fuel_overrides: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
});

const ownerApproveBodySchema = z.object({
  wf064_confirm: z.literal(true),
  confirm_phrase: z.literal("APPROVE"),
  hold_seconds_elapsed: z.coerce.number().min(5),
});

const markFiledBodySchema = z.object({
  confirmation_number: z.string().trim().min(1).max(120),
});

function isOwner(role: string | undefined) {
  return role === "Owner";
}

export async function registerReportsIftaRoutes(app: FastifyInstance) {
  app.post("/api/v1/reports/ifta/prepare", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = prepareBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      prepareFiling(client, query.data.operating_company_id, body.data.quarter.toUpperCase(), user.uuid)
    );
    return reply.code(201).send(row);
  });

  app.get("/api/v1/reports/ifta/draft/:uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = uuidParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      getFilingDraft(client, query.data.operating_company_id, params.data.uuid)
    );
    if (!row) return reply.code(404).send({ error: "filing_not_found" });
    return row;
  });

  app.patch("/api/v1/reports/ifta/draft/:uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = uuidParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = overridesBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        updateFilingOverrides(client, query.data.operating_company_id, params.data.uuid, body.data)
      );
      if (!row) return reply.code(404).send({ error: "filing_not_found" });
      return row;
    } catch (error) {
      if (error instanceof Error && error.message === "E_FILING_NOT_EDITABLE") {
        return reply.code(409).send({ error: "filing_not_editable" });
      }
      throw error;
    }
  });

  app.post("/api/v1/reports/ifta/draft/:uuid/owner-approve", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwner(user.role)) return reply.code(403).send({ error: "owner_only" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = uuidParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = ownerApproveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "wf064_confirmation_required" });

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      ownerApproveFiling(client, query.data.operating_company_id, params.data.uuid, user.uuid)
    );
    if (!row) return reply.code(404).send({ error: "filing_not_found_or_not_approvable" });
    return row;
  });

  app.post("/api/v1/reports/ifta/draft/:uuid/mark-filed", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwner(user.role)) return reply.code(403).send({ error: "owner_only" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = uuidParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = markFiledBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      markFilingFiled(client, query.data.operating_company_id, params.data.uuid, body.data.confirmation_number, user.uuid)
    );
    if (!row) return reply.code(404).send({ error: "filing_not_found_or_not_fileable" });
    return row;
  });

  app.get("/api/v1/reports/ifta/filings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listFilings(client, query.data.operating_company_id)
    );
    return { filings: rows };
  });
}
