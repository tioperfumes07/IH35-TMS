import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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
  operating_company_id: z.string().uuid().optional(),
});

const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

const tenantQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const patchUserBodySchema = z.object({
  role: roleSchema,
});

const createUserBodySchema = z.object({
  email: z.string().email().refine((email) => email === email.toLowerCase(), {
    message: "email must be lowercase",
  }),
  role: roleSchema,
});

type IdentityUserRow = {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
  deactivated_at: string | null;
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
    created_at: row.created_at,
    deactivated_at: row.deactivated_at,
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
          SELECT id, email, role, created_at, deactivated_at
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

  app.get("/api/v1/identity/users", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedQuery = paginationSchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    const { limit, offset } = parsedQuery.data;
    const users = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters = [
        `(u.default_company_id IN (SELECT org.user_accessible_company_ids()) OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = u.id
              AND uca.company_id IN (SELECT org.user_accessible_company_ids())
          ))`,
      ];
      if (parsedQuery.data.operating_company_id) {
        values.push(parsedQuery.data.operating_company_id);
        filters.push(`(
          u.default_company_id = $${values.length}::uuid
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = u.id
              AND uca.company_id = $${values.length}::uuid
          )
        )`);
      }
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      values.push(limit, offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, created_at, deactivated_at
          FROM identity.users u
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
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
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [parsedParams.data.id];
      const filters = [
        "id = $1",
        `(default_company_id IN (SELECT org.user_accessible_company_ids()) OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = identity.users.id
              AND uca.company_id IN (SELECT org.user_accessible_company_ids())
          ))`,
      ];
      if (parsedQuery.data.operating_company_id) {
        values.push(parsedQuery.data.operating_company_id);
        filters.push(`(
          default_company_id = $${values.length}::uuid
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = identity.users.id
              AND uca.company_id = $${values.length}::uuid
          )
        )`);
      }
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, created_at, deactivated_at
          FROM identity.users
          WHERE ${filters.join(" AND ")}
          LIMIT 1
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({ error: "identity_user_not_found" });
    }

    return mapIdentityUser(row);
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
          SELECT id, email, role, created_at, deactivated_at
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
          RETURNING id, email, role, created_at, deactivated_at
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
        const res = await client.query<IdentityUserRow>(
          `
            INSERT INTO identity.users (email, role)
            VALUES ($1, $2)
            RETURNING id, email, role, created_at, deactivated_at
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
        return row;
      });
      return reply.code(201).send(mapIdentityUser(created));
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
