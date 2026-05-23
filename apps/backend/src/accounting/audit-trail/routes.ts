import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import {
  decodeAuditTrailCursor,
  listAccountingAuditTrail,
  listAccountingSourceLineage,
} from "./service.js";

function canAccessAccountingAudit(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  source_transaction_type: z.string().trim().min(1).max(120).optional(),
  source_transaction_id: z.string().trim().min(1).max(200).optional(),
  account_id: z.string().uuid().optional(),
});

const lineageQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  source_transaction_type: z.string().trim().min(1).max(120),
  source_transaction_id: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function registerAccountingAuditTrailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/audit-trail", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccountingAudit(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const cursor = decodeAuditTrailCursor(query.data.cursor);
    if (query.data.cursor && !cursor) return reply.code(400).send({ error: "invalid_cursor" });

    return withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listAccountingAuditTrail(client, {
        operating_company_id: query.data.operating_company_id,
        limit: query.data.limit,
        cursor,
        source_transaction_type: query.data.source_transaction_type,
        source_transaction_id: query.data.source_transaction_id,
        account_id: query.data.account_id,
      }),
    );
  });

  app.get("/api/v1/accounting/audit-trail/source-lineage", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccountingAudit(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = lineageQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    return withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listAccountingSourceLineage(client, {
        operating_company_id: query.data.operating_company_id,
        source_transaction_type: query.data.source_transaction_type,
        source_transaction_id: query.data.source_transaction_id,
        limit: query.data.limit,
      }),
    );
  });
}
