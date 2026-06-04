import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withSavepoint, type SavepointQueryClient } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { enforceBulkRateLimit, releaseBulkInFlight } from "./bulk-rate-limit.js";
import type {
  BulkPerEntityContext,
  BulkPerEntityResult,
  BulkUpdateFailure,
  BulkUpdateRequest,
  BulkUpdateResponse,
} from "./bulk.types.js";

export const BULK_OPS_SOURCE_TAG = "BULK-OPS";
export const DEFAULT_BULK_MAX_IDS = 200;
export const FLEET_BULK_MAX_IDS = 100;

const bulkQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const bulkBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().optional(),
});

export function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export function isOwnerOrAdmin(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

export function assertBulkActionAllowed(
  role: string,
  action: string,
  destructiveActions: string[] = []
): { ok: true } | { ok: false; code: string; message: string } {
  if (!isWriteRole(role)) {
    return { ok: false, code: "E_FORBIDDEN", message: "Insufficient role for bulk update" };
  }
  if (destructiveActions.includes(action) && !isOwnerOrAdmin(role)) {
    return { ok: false, code: "E_FORBIDDEN", message: "Owner or Administrator required for this bulk action" };
  }
  return { ok: true };
}

export function currentBulkAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function sendBulkValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(422).send({ error: "bulk_validation_error", details: error.flatten() });
}

export function sendBulkRequestError(reply: FastifyReply, code: string, message: string) {
  return reply.code(422).send({ error: code, message });
}

export type RegisterBulkRouteOptions<TPayload> = {
  app: FastifyInstance;
  path: string;
  domain: string;
  resource: string;
  entityType: string;
  maxIds?: number;
  requireReasonActions?: string[];
  destructiveActions?: string[];
  actionMap: Record<string, z.ZodType<TPayload>>;
  perEntityHandler: (ctx: BulkPerEntityContext<TPayload>) => Promise<BulkPerEntityResult>;
};

export async function appendBulkCrudAudit(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  actorUserId: string,
  entityType: string,
  action: string,
  bulkCallId: string,
  payload: Record<string, unknown>,
  severity: "info" | "warning" = "info"
) {
  await appendCrudAudit(
    client,
    actorUserId,
    `${entityType}.bulk_${action}`,
    {
      ...payload,
      bulk_call_id: bulkCallId,
      action_source: "bulk",
      action,
    },
    severity,
    BULK_OPS_SOURCE_TAG
  );
}

export async function processBulkPerId<TPayload>(
  client: SavepointQueryClient,
  ids: string[],
  handler: (ctx: BulkPerEntityContext<TPayload>) => Promise<BulkPerEntityResult>,
  baseCtx: Omit<BulkPerEntityContext<TPayload>, "id" | "client">
): Promise<{ succeeded: string[]; failed: BulkUpdateFailure[]; auditLogIds: string[] }> {
  const succeeded: string[] = [];
  const failed: BulkUpdateFailure[] = [];
  const auditLogIds: string[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;
    const savepoint = `bulk_id_${i}`;
    const result = await withSavepoint(
      client,
      savepoint,
      () =>
        handler({
          ...baseCtx,
          id,
          client,
        }),
      { ok: false, code: "E_INTERNAL", message: "Bulk row processing failed" } as BulkPerEntityResult
    );

    if (result.ok) {
      succeeded.push(id);
      if (result.auditLogId) auditLogIds.push(result.auditLogId);
    } else {
      failed.push({ id, code: result.code, message: result.message });
    }
  }

  return { succeeded, failed, auditLogIds };
}

export function registerBulkRoute<TPayload>(options: RegisterBulkRouteOptions<TPayload>) {
  const maxIds = options.maxIds ?? DEFAULT_BULK_MAX_IDS;
  const requireReasonActions = new Set(options.requireReasonActions ?? []);
  const destructiveActions = options.destructiveActions ?? [];

  options.app.post(options.path, async (req, reply) => {
    const authUser = currentBulkAuthUser(req, reply);
    if (!authUser) return;

    if (!(await enforceBulkRateLimit(authUser.uuid, reply))) return;

    try {
      const parsedQuery = bulkQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendBulkValidationError(reply, parsedQuery.error);

      const parsedBody = bulkBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendBulkValidationError(reply, parsedBody.error);

      const { ids, action, payload, reason } = parsedBody.data;
      if (ids.length > maxIds) {
        return sendBulkRequestError(reply, "too_many_ids", `Maximum ${maxIds} IDs per bulk call`);
      }

      const actionSchema = options.actionMap[action];
      if (!actionSchema) {
        return sendBulkRequestError(reply, "unknown_bulk_action", `Unknown action: ${action}`);
      }

      if (requireReasonActions.has(action)) {
        if (!reason || reason.trim().length < 10) {
          return sendBulkRequestError(reply, "reason_required", "reason must be at least 10 characters");
        }
      }

      const permission = assertBulkActionAllowed(authUser.role, action, destructiveActions);
      if (!permission.ok) return reply.code(403).send({ error: "forbidden", code: permission.code });

      const parsedPayload = actionSchema.safeParse(payload);
      if (!parsedPayload.success) return sendBulkValidationError(reply, parsedPayload.error);

      const bulkCallId = randomUUID();
      const operatingCompanyId = parsedQuery.data.operating_company_id;

      const response = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

        return processBulkPerId(
          client,
          ids,
          (ctx) =>
            options.perEntityHandler({
              ...ctx,
              payload: parsedPayload.data,
            }),
          {
            action,
            payload: parsedPayload.data,
            reason,
            operatingCompanyId,
            actorUserId: authUser.uuid,
            bulkCallId,
          }
        );
      });

      const body: BulkUpdateResponse = {
        requested: ids.length,
        succeeded: response.succeeded,
        failed: response.failed,
        audit_log_ids: response.auditLogIds,
        bulk_call_id: bulkCallId,
      };
      return reply.code(200).send(body);
    } finally {
      releaseBulkInFlight(authUser.uuid);
    }
  });
}

export type LegacyBulkAuditParams = {
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> };
  actorUserId: string;
  eventClass: string;
  bulkCallId: string;
  payload: Record<string, unknown>;
  severity?: "info" | "warning";
};

export async function appendLegacyFleetBulkAudit(params: LegacyBulkAuditParams) {
  await appendCrudAudit(
    params.client,
    params.actorUserId,
    params.eventClass,
    {
      ...params.payload,
      bulk_call_id: params.bulkCallId,
      action_source: "bulk",
    },
    params.severity ?? "info",
    BULK_OPS_SOURCE_TAG
  );
}

export async function withLegacyBulkRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  run: (ctx: { authUser: NonNullable<ReturnType<typeof currentBulkAuthUser>>; bulkCallId: string }) => Promise<unknown>
) {
  const authUser = currentBulkAuthUser(req, reply);
  if (!authUser) return;
  if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
  if (!(await enforceBulkRateLimit(authUser.uuid, reply))) return;

  const bulkCallId = randomUUID();
  try {
    return await run({ authUser, bulkCallId });
  } finally {
    releaseBulkInFlight(authUser.uuid);
  }
}

export function parseCanonicalBulkBody(body: unknown) {
  return bulkBodySchema.safeParse(body);
}
