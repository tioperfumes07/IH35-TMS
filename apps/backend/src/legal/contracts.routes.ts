import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  contractSchemas,
  createContractInstance,
  getContractInstanceDetail,
  listContractInstances,
  sendContractSigningLink,
} from "./contracts.service.js";

const officeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant", "Dispatcher", "Safety", "Mechanic"]);
const writeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

const operatingCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = operatingCompanyQuerySchema.extend({
  status: z.enum(["draft", "sent", "viewed", "signed_electronically", "voided", "expired"]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function requireOfficeRole(reply: FastifyReply, role: string) {
  if (!officeRoles.has(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

function requireWriteRole(reply: FastifyReply, role: string) {
  if (!writeRoles.has(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function setOperatingCompany(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

function getAuditContext(req: FastifyRequest, authUser: NonNullable<FastifyRequest["user"]>) {
  return {
    actorUserId: authUser.uuid,
    actorName: null,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  };
}

export async function registerLegalContractRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/contracts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireOfficeRole(reply, String(authUser.role ?? ""))) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsed.data.operating_company_id);
      return listContractInstances(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        status: parsed.data.status,
        search: parsed.data.search,
      });
    });
    return { contracts: rows };
  });

  app.get("/api/v1/legal/contracts/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireOfficeRole(reply, String(authUser.role ?? ""))) return;
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return getContractInstanceDetail(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        contractInstanceId: parsedParams.data.id,
      });
    });
    if (!detail) return reply.code(404).send({ error: "legal_contract_instance_not_found" });
    return detail;
  });

  app.post("/api/v1/legal/contracts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireWriteRole(reply, String(authUser.role ?? ""))) return;
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = contractSchemas.contractCreateSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        await setOperatingCompany(client, parsedQuery.data.operating_company_id);
        return createContractInstance(client, {
          operatingCompanyId: parsedQuery.data.operating_company_id,
          payload: parsedBody.data,
          ...getAuditContext(req, authUser),
        });
      });
      return reply.code(201).send(created);
    } catch (error) {
      const message = String((error as Error).message ?? "legal_contract_create_failed");
      if (message === "legal_active_template_required") return reply.code(409).send({ error: message });
      if (message === "legal_missing_required_variables") {
        const details = (error as Error & { details?: unknown }).details ?? [];
        return reply.code(400).send({ error: message, missing_required: details });
      }
      return reply.code(500).send({ error: "legal_contract_create_failed" });
    }
  });

  app.post("/api/v1/legal/contracts/:id/send", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireWriteRole(reply, String(authUser.role ?? ""))) return;
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = contractSchemas.tokenSendSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      const sent = await withCurrentUser(authUser.uuid, async (client) => {
        await setOperatingCompany(client, parsedQuery.data.operating_company_id);
        return sendContractSigningLink(client, {
          operatingCompanyId: parsedQuery.data.operating_company_id,
          contractInstanceId: parsedParams.data.id,
          payload: parsedBody.data,
          ...getAuditContext(req, authUser),
        });
      });
      return sent;
    } catch (error) {
      const message = String((error as Error).message ?? "legal_contract_send_failed");
      if (
        [
          "legal_contract_instance_not_found",
          "legal_contract_send_invalid_status",
          "legal_signer_email_required",
          "legal_signer_phone_required",
        ].includes(message)
      ) {
        return reply.code(409).send({ error: message });
      }
      return reply.code(500).send({ error: "legal_contract_send_failed" });
    }
  });
}
