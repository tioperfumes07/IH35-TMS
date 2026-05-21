import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  getAdminJobById,
  getLatestCompletedAdminJob,
  resolveDefaultOperatingCompanyIdForUser,
  type AdminJobOperation,
} from "./admin-jobs.service.js";

const adminRoles = new Set(["Owner", "Administrator"]);
const LATEST_QUERY_ALLOWED_OPS: AdminJobOperation[] = ["admin.health.deep.refresh"];

function currentAdminUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!adminRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerAdminJobsRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/jobs/:jobId", async (req, reply) => {
    const user = currentAdminUser(req, reply);
    if (!user) return;

    const params = z.object({ jobId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const row = await getAdminJobById(params.data.jobId);
    if (!row) return reply.code(404).send({ error: "job_not_found" });

    return {
      jobId: row.id,
      operation: row.operation,
      status: row.status,
      enqueuedAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
      error: row.last_error_message,
      attempts: row.attempt_count,
      maxAttempts: row.max_attempts,
      operating_company_id: row.operating_company_id,
    };
  });

  app.get("/api/v1/admin/jobs/latest", async (req, reply) => {
    const user = currentAdminUser(req, reply);
    if (!user) return;

    const query = z
      .object({
        operation: z.string().min(1),
        operating_company_id: z.string().uuid().optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const operation = query.data.operation as AdminJobOperation;
    if (!LATEST_QUERY_ALLOWED_OPS.includes(operation)) {
      return reply.code(400).send({ error: "operation_not_allowed_for_latest_query" });
    }

    const operatingCompanyId = query.data.operating_company_id ?? (await resolveDefaultOperatingCompanyIdForUser(user.uuid));
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    const row = await getLatestCompletedAdminJob(operation, operatingCompanyId);
    if (!row) return reply.code(404).send({ error: "job_not_found" });

    return {
      jobId: row.id,
      operation: row.operation,
      status: row.status,
      enqueuedAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
      error: row.last_error_message,
      attempts: row.attempt_count,
      maxAttempts: row.max_attempts,
      operating_company_id: row.operating_company_id,
    };
  });
}
