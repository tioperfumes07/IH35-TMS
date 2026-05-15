import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { findReturningDispatcherMatches } from "../mdata/dispatcher-safety-events.routes.js";

const roleSchema = z.enum([
  "Owner",
  "Administrator",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Safety",
  "Driver",
  "Mechanic",
]);

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

const patchUserBodySchema = z.object({
  role: roleSchema,
});

const onboardingPatchSchema = z
  .object({
    /** When true, stamp completion; when false, clear so the tour runs again. */
    complete: z.boolean(),
  })
  .strict();

const createUserBodySchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  role: roleSchema,
  override_returning_warning: z.boolean().optional().default(false),
});

type IdentityUserRow = {
  id: string;
  email: string | null;
  role: string;
  default_company_id: string | null;
  created_at: string;
  deactivated_at: string | null;
  onboarding_completed_at?: string | null;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) {
    return null;
  }
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "validation_error",
    details: error.flatten(),
  });
}

function isAdminRole(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

function mapIdentityUser(row: IdentityUserRow) {
  return {
    id: String(row.id),
    email: row.email,
    role: String(row.role),
    default_company_id: row.default_company_id ?? null,
    created_at: row.created_at,
    deactivated_at: row.deactivated_at,
    onboarding_completed_at: row.onboarding_completed_at ?? null,
  };
}

export async function registerIdentityRoutes(app: FastifyInstance) {
  app.get("/api/v1/identity/me", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, default_company_id, created_at, deactivated_at,
            onboarding_completed_at::text AS onboarding_completed_at
          FROM identity.users
          WHERE id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({ error: "identity_user_not_found" });
    }

    return mapIdentityUser(row);
  });

  app.patch("/api/v1/identity/me/onboarding", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = onboardingPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(
        parsed.data.complete
          ? `UPDATE identity.users SET onboarding_completed_at = now() WHERE id = $1`
          : `UPDATE identity.users SET onboarding_completed_at = NULL WHERE id = $1`,
        [authUser.uuid]
      );
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, default_company_id, created_at, deactivated_at,
            onboarding_completed_at::text AS onboarding_completed_at
          FROM identity.users
          WHERE id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "identity_user_not_found" });
    return mapIdentityUser(row);
  });

  app.get("/api/v1/identity/users", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedQuery = paginationSchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    const { limit, offset, include_inactive } = parsedQuery.data;
    if (include_inactive && !isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const users = await withCurrentUser(authUser.uuid, async (client) => {
      const filters: string[] = [];
      if (!include_inactive) filters.push("u.deactivated_at IS NULL");
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query<IdentityUserRow>(
        `
          SELECT u.id, u.email, u.role, u.default_company_id, u.created_at, u.deactivated_at
          FROM identity.users u
          ${whereClause}
          ORDER BY u.created_at DESC
          LIMIT $1
          OFFSET $2
        `,
        [limit, offset]
      );
      return res.rows.map(mapIdentityUser);
    });

    return { users };
  });

  app.get("/api/v1/identity/users/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedParams = userIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, default_company_id, created_at, deactivated_at
          FROM identity.users
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({ error: "identity_user_not_found" });
    }

    return mapIdentityUser(row);
  });

  app.get("/api/v1/identity/users/:id/detail", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = userIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      const userRes = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, default_company_id, created_at, deactivated_at
          FROM identity.users
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const user = userRes.rows[0] ?? null;
      if (!user) return null;

      const hasDriverRecordRes = await client.query<{ has_driver_record: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM mdata.drivers d
            WHERE d.identity_user_id = $1
          ) AS has_driver_record
        `,
        [parsedParams.data.id]
      );
      const hasDriverRecord = Boolean(hasDriverRecordRes.rows[0]?.has_driver_record);

      const companyRes = await client.query(
        `
          SELECT c.id, c.code, c.legal_name, c.short_name
          FROM org.companies c
          WHERE c.is_active = true
            AND c.deactivated_at IS NULL
            AND (
              $2 = 'Owner'
              OR EXISTS (
                SELECT 1
                FROM org.user_company_access a
                WHERE a.user_id = $1
                  AND a.company_id = c.id
              )
            )
          ORDER BY c.legal_name
        `,
        [parsedParams.data.id, user.role]
      );

      return {
        user: mapIdentityUser(user),
        has_driver_record: hasDriverRecord,
        accessible_companies: companyRes.rows,
      };
    });

    if (!detail) return reply.code(404).send({ error: "identity_user_not_found" });
    return detail;
  });

  app.patch("/api/v1/identity/users/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedParams = userIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }
    const parsedBody = patchUserBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, default_company_id, created_at, deactivated_at
          FROM identity.users
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;

      const res = await client.query<IdentityUserRow>(
        `
          UPDATE identity.users
          SET role = $1
          WHERE id = $2
          RETURNING id, email, role, default_company_id, created_at, deactivated_at
        `,
        [parsedBody.data.role, parsedParams.data.id]
      );
      const updatedRow = res.rows[0] ?? null;
      if (!updatedRow) return null;

      const changes = buildPatchChanges(
        { role: parsedBody.data.role },
        oldRow as unknown as Record<string, unknown>,
        updatedRow as unknown as Record<string, unknown>
      );
      const roleChanged = Object.prototype.hasOwnProperty.call(changes, "role");
      await appendCrudAudit(
        client,
        authUser.uuid,
        "identity.users.updated",
        {
          resource_id: updatedRow.id,
          resource_type: "identity.users",
          changes,
          ...(roleChanged
            ? {
                role_changed_from: oldRow.role,
                role_changed_to: updatedRow.role,
              }
            : {}),
        },
        roleChanged ? "warning" : "info"
      );

      return updatedRow;
    });

    if (!updated) {
      return reply.code(404).send({ error: "identity_user_not_found" });
    }

    return mapIdentityUser(updated);
  });

  app.post("/api/v1/identity/users", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedBody = createUserBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const shouldCheckReturning = parsedBody.data.role !== "Owner" && parsedBody.data.role !== "Driver";
        let returningDetection: Awaited<ReturnType<typeof findReturningDispatcherMatches>> | null = null;
        if (shouldCheckReturning) {
          returningDetection = await findReturningDispatcherMatches(client, parsedBody.data.email);
          if (returningDetection.returning_dispatcher && !parsedBody.data.override_returning_warning) {
            return {
              error: "returning_dispatcher_detected" as const,
              detection: returningDetection,
            };
          }
        }

        const res = await client.query<IdentityUserRow>(
          `
            INSERT INTO identity.users (email, role)
            VALUES ($1, $2)
            RETURNING id, email, role, default_company_id, created_at, deactivated_at
          `,
          [parsedBody.data.email, parsedBody.data.role]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "identity.users.created", {
          resource_id: row.id,
          resource_type: "identity.users",
          id: row.id,
          email: row.email,
          role: row.role,
        });

        if (returningDetection?.returning_dispatcher && parsedBody.data.override_returning_warning) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.dispatcher_safety_events.returning_dispatcher_override",
            {
              resource_id: row.id,
              resource_type: "identity.users",
              matched_events: returningDetection.matched_events,
              severity_summary: returningDetection.severity_summary,
            },
            "warning",
            "BT-1-DISPATCHER-SAFETY-FILE"
          );
        }

        return row;
      });

      if (created && typeof created === "object" && "error" in created && created.error === "returning_dispatcher_detected") {
        return reply.code(409).send({
          error: "returning_dispatcher_detected",
          ...created.detection,
        });
      }

      return reply.code(201).send(mapIdentityUser(created as IdentityUserRow));
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        return reply.code(409).send({ error: "identity_user_conflict" });
      }
      throw err;
    }
  });

  app.post("/api/v1/identity/users/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedParams = userIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query<{ id: string; deactivated_at: string | null }>(
          `
            SELECT id, deactivated_at
            FROM identity.users
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0];
        if (!oldRow) return null;

        let deactivatedAt = oldRow.deactivated_at;
        let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
        if (!wasAlreadyDeactivated) {
          const res = await client.query<{ id: string; deactivated_at: string }>(
            `
              UPDATE identity.users
              SET deactivated_at = now()
              WHERE id = $1
                AND deactivated_at IS NULL
              RETURNING id, deactivated_at
            `,
            [parsedParams.data.id]
          );
          deactivatedAt = res.rows[0]?.deactivated_at ?? oldRow.deactivated_at;
          wasAlreadyDeactivated = false;
        }

        await appendCrudAudit(client, authUser.uuid, "identity.users.deactivated", {
          resource_id: oldRow.id,
          resource_type: "identity.users",
          was_already_deactivated: wasAlreadyDeactivated,
        });

        return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
      });

      if (!updated) {
        return reply.code(404).send({ error: "identity_user_not_found" });
      }

      return {
        id: updated.id,
        deactivated_at: updated.deactivated_at,
        was_already_deactivated: updated.was_already_deactivated,
      };
    } catch (err) {
      const msg = String((err as { message?: string })?.message || "");
      if (msg.includes("cannot deactivate the last active Owner")) {
        return reply.code(400).send({ error: "cannot_deactivate_last_owner" });
      }
      throw err;
    }
  });
}
