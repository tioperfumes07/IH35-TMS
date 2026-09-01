import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withSavepoint, type SavepointQueryClient } from "../auth/db.js";
import { afterCommitMark, afterCommitRollbackTo } from "../lib/after-commit.js";
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

export class FleetBulkTargetMismatchError extends Error {
  readonly code = "fleet_bulk_target_mismatch";
  constructor(
    readonly requestedCount: number,
    readonly matchedCount: number,
    readonly stage: "pre_update" | "post_update"
  ) {
    super(`Fleet bulk update expected ${requestedCount} targets but matched ${matchedCount} during ${stage}`);
    this.name = "FleetBulkTargetMismatchError";
  }
}

export function assertExactFleetBulkTargetCount(
  requestedCount: number,
  matchedCount: number,
  stage: "pre_update" | "post_update"
) {
  if (matchedCount !== requestedCount) {
    throw new FleetBulkTargetMismatchError(requestedCount, matchedCount, stage);
  }
}

export function sendFleetBulkTargetMismatch(reply: FastifyReply, error: FleetBulkTargetMismatchError) {
  return reply.code(409).send({
    error: error.code,
    stage: error.stage,
    requested_count: error.requestedCount,
    matched_count: error.matchedCount,
  });
}

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
  /**
   * When true, the first per-row failure rolls back the entire batch (no partial succeed).
   * Prefer atomicFailStopActions for action-scoped fail-stop (bulk void only).
   */
  atomicFailStop?: boolean;
  /** Actions that use atomic fail-stop (e.g. ["void"]). */
  atomicFailStopActions?: string[];
  /**
   * Optional per-action role gate. Return a 403 body to reject before processing.
   * Used so bulk `void` can allow Accountant (canVoidCancel) without opening other destructive ops.
   */
  actionRoleGate?: (
    role: string,
    action: string
  ) => { ok: true } | { ok: false; code: string; message: string };
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

/**
 * EXP-POSTED-NO-JE-01 fix (b) — thrown when the pre-validation pass (atomicFailStop actions
 * only) finds one or more rows that would fail the real run. Carries EVERY blocked row, not just
 * the first, so the caller can report and let the user deselect them before resubmitting — the
 * real pass never runs at all when this fires.
 */
export class BulkPreValidationError extends Error {
  readonly code = "bulk_pre_validation_failed";
  constructor(
    readonly failures: BulkUpdateFailure[],
    readonly attemptedCount: number
  ) {
    super(
      `Bulk pre-validation blocked ${failures.length}/${attemptedCount} row(s): ${failures.map((f) => `${f.id} (${f.code})`).join(", ")}`
    );
    this.name = "BulkPreValidationError";
  }
}

export class BulkFailStopError extends Error {
  readonly code = "bulk_fail_stop";
  constructor(
    readonly failure: BulkUpdateFailure,
    readonly attemptedIndex: number,
    readonly attemptedCount: number
  ) {
    super(
      `Bulk fail-stop at ${attemptedIndex + 1}/${attemptedCount}: ${failure.code} — ${failure.message}`
    );
    this.name = "BulkFailStopError";
  }
}

export async function processBulkPerId<TPayload>(
  client: SavepointQueryClient,
  ids: string[],
  handler: (ctx: BulkPerEntityContext<TPayload>) => Promise<BulkPerEntityResult>,
  baseCtx: Omit<BulkPerEntityContext<TPayload>, "id" | "client">,
  options: { atomicFailStop?: boolean } = {}
): Promise<{ succeeded: string[]; failed: BulkUpdateFailure[]; auditLogIds: string[] }> {
  const succeeded: string[] = [];
  const failed: BulkUpdateFailure[] = [];
  const auditLogIds: string[] = [];
  const atomicFailStop = options.atomicFailStop === true;

  if (atomicFailStop) {
    // EXP-POSTED-NO-JE-01 fix (b) — owner-verified live 2026-09-01: fail-stop atomic is the
    // right call for money (never a partial void batch), but running the real pass blind meant
    // ONE unreversible row rolled back all 11 bills the owner selected — "0 of 11 succeeded; 1
    // failed", discovered only by losing the whole batch, with no visibility into which OTHER
    // rows (if any) would also have blocked. PRE-VALIDATE every row first, in a savepoint that is
    // ALWAYS rolled back regardless of outcome (success or failure) — the identical handler, no
    // duplicated per-action validation logic, just run once to find out and once for real. If
    // ANY row would fail, report ALL of them (by id, with each one's own reason) and never touch
    // the real pass at all — the caller can deselect the blocked rows and resubmit.
    const preValidationFailures: BulkUpdateFailure[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]!;
      const probeSavepoint = `bulk_probe_${i}`;
      const safeProbe = probeSavepoint.replace(/[^a-z0-9_]/gi, "_");
      // Same after-commit-queue bookkeeping withSavepoint uses — a rolled-back probe must not
      // leave a deferred money side-effect queued to fire after the real (later) COMMIT.
      const mark = afterCommitMark(client);
      await client.query(`SAVEPOINT ${safeProbe}`);
      try {
        const result = await handler({ ...baseCtx, id, client });
        if (!result.ok) preValidationFailures.push({ id, code: result.code, message: result.message });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bulk row processing failed";
        preValidationFailures.push({ id, code: "E_INTERNAL", message });
      } finally {
        // Unconditional rollback — this pass never persists, success or failure alike.
        await client.query(`ROLLBACK TO SAVEPOINT ${safeProbe}`).catch(() => {});
        afterCommitRollbackTo(client, mark);
      }
    }
    if (preValidationFailures.length > 0) {
      throw new BulkPreValidationError(preValidationFailures, ids.length);
    }
  }

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;

    if (atomicFailStop) {
      // No savepoint: first failure aborts the whole transaction (never a partial batch). Pre-
      // validation above already confirmed every row passes, so this only fires on a genuine
      // race (e.g. concurrent modification between the probe and the real pass) — a real
      // fail-stop, correctly, not a discoverable-in-advance one.
      let result: BulkPerEntityResult;
      try {
        result = await handler({ ...baseCtx, id, client });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bulk row processing failed";
        throw new BulkFailStopError({ id, code: "E_INTERNAL", message }, i, ids.length);
      }
      if (!result.ok) {
        throw new BulkFailStopError(
          { id, code: result.code, message: result.message },
          i,
          ids.length
        );
      }
      succeeded.push(id);
      if (result.auditLogId) auditLogIds.push(result.auditLogId);
      continue;
    }

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

  options.app.post(
    options.path,
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentBulkAuthUser(req, reply);
    if (!authUser) return reply;

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

      if (options.actionRoleGate) {
        const gated = options.actionRoleGate(String(authUser.role ?? ""), action);
        if (!gated.ok) {
          return reply.code(403).send({ error: "forbidden", code: gated.code, message: gated.message });
        }
      }

      const parsedPayload = actionSchema.safeParse(payload);
      if (!parsedPayload.success) return sendBulkValidationError(reply, parsedPayload.error);

      const bulkCallId = randomUUID();
      const operatingCompanyId = parsedQuery.data.operating_company_id;

      try {
        const response = await withCurrentUser(authUser.uuid, async (client) => {
          await setScopedCompanyContext(client, authUser.uuid, operatingCompanyId);

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
              actorRole: String(authUser.role ?? ""),
              bulkCallId,
            },
            { atomicFailStop: options.atomicFailStop === true || (options.atomicFailStopActions ?? []).includes(action) }
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
      } catch (err) {
        if (err instanceof BulkPreValidationError) {
          const body: BulkUpdateResponse = {
            requested: ids.length,
            succeeded: [],
            failed: err.failures,
            audit_log_ids: [],
            bulk_call_id: bulkCallId,
          };
          return reply.code(409).send({
            ...body,
            error: "bulk_pre_validation_failed",
            message: err.message,
          });
        }
        if (err instanceof BulkFailStopError) {
          const body: BulkUpdateResponse = {
            requested: ids.length,
            succeeded: [],
            failed: [err.failure],
            audit_log_ids: [],
            bulk_call_id: bulkCallId,
          };
          return reply.code(409).send({
            ...body,
            error: "bulk_fail_stop",
            message: err.message,
            fail_index: err.attemptedIndex,
          });
        }
        throw err;
      }
    } finally {
      releaseBulkInFlight(authUser.uuid);
    }
  }
  );
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
  if (!authUser) return reply;
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
