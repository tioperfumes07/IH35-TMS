import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { findReturningDispatcherMatches } from "../mdata/dispatcher-safety-events.routes.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { FIXTURE_USER_EMAIL_RE } from "./fixture-email-pattern.js";
import { officePasswordSchema } from "./office-password-policy.js";
import { EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL } from "../mdata/test-seed-archive.js";

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
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

const tenantQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});


/** Application-layer company isolation for identity users (RLS alone is role-only).
 * Same predicate as GET list/detail — mutations MUST reuse it or admins can cross-tenant mutate. */
const TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL = `(default_company_id IN (SELECT org.user_accessible_company_ids()) OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = identity.users.id
              AND uca.company_id IN (SELECT org.user_accessible_company_ids())
          ))`;

function activeCompanyFilterSql(values: unknown[], operatingCompanyId: string | undefined): string | null {
  if (!operatingCompanyId) return null;
  values.push(operatingCompanyId);
  const idx = values.length;
  return `(
          default_company_id = $${idx}::uuid
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = identity.users.id
              AND uca.company_id = $${idx}::uuid
          )
        )`;
}

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
  name: z.string().trim().min(1).max(160),
  email: z.string().email().transform((email) => email.toLowerCase()),
  role: roleSchema,
  operating_company_id: z.string().uuid().optional(),
  override_returning_warning: z.boolean().optional().default(false),
  initial_password: z.string().optional(),
  send_password_setup_invite: z.boolean().optional().default(false),
});

// USERS-1 fixture-user guard (see the create handler). The FIXTURE_USER_EMAIL_RE pattern is the shared
// single source of truth in ./fixture-email-pattern.js (also used by the admin deactivate-probe-accounts
// job). Enforced only in production so CI/test fixtures work.
const IS_PROD_ENV = process.env.NODE_ENV === "production";

type IdentityUserRow = {
  id: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  google_user_id?: string | null;
  password_hash?: string | null;
  default_company_id: string | null;
  created_at: string;
  deactivated_at: string | null;
  last_login_at?: string | null;
  onboarding_completed_at?: string | null;
};

const argon2id = new Argon2id();

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
  const firstName = String(row.first_name ?? "").trim();
  const lastName = String(row.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const hasGoogle = Boolean(row.google_user_id);
  const hasPassword = Boolean(row.password_hash);
  const authMethod = hasGoogle && hasPassword ? "Google + Password" : hasGoogle ? "Google" : hasPassword ? "Password" : "Invite pending";
  return {
    id: String(row.id),
    name: fullName || (row.email ? row.email.split("@")[0] : "User"),
    first_name: firstName || null,
    last_name: lastName || null,
    email: row.email,
    role: String(row.role),
    auth_method: authMethod,
    default_company_id: row.default_company_id ?? null,
    created_at: row.created_at,
    deactivated_at: row.deactivated_at,
    last_login_at: row.last_login_at ?? null,
    onboarding_completed_at: row.onboarding_completed_at ?? null,
  };
}

type AssignableUserRow = {
  id: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  default_company_id: string | null;
  created_at: string;
};

// USERS-2: minimal projection for assignee pickers (tasks, work orders, chat mentions). Deliberately
// omits the auth-sensitive fields the full directory exposes — google_user_id/password_hash (→ auth
// method, an auth-enumeration signal) and last_login_at (activity tracking). Names + role only.
function mapAssignableUser(row: AssignableUserRow) {
  const firstName = String(row.first_name ?? "").trim();
  const lastName = String(row.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: String(row.id),
    name: fullName || (row.email ? row.email.split("@")[0] : "User"),
    first_name: firstName || null,
    last_name: lastName || null,
    email: row.email,
    role: String(row.role),
    default_company_id: row.default_company_id ?? null,
    created_at: row.created_at,
    deactivated_at: null,
  };
}

function splitName(fullNameRaw: string): { firstName: string; lastName: string | null } {
  const fullName = fullNameRaw.trim().replace(/\s+/g, " ");
  const [firstName = "", ...rest] = fullName.split(" ");
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(" ") : null,
  };
}

function frontendResetConfirmUrl(token: string): string {
  const base = (process.env.FRONTEND_BASE_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
  return `${base}/login/reset/confirm?token=${encodeURIComponent(token)}`;
}

export async function registerIdentityRoutes(app: FastifyInstance) {
  const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
  const RL_MUTATE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;

  app.get("/api/v1/identity/me", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at,
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

  app.patch("/api/v1/identity/me/onboarding", RL_MUTATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
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
          SELECT id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at,
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

  app.get("/api/v1/identity/users", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    // USERS-2 (security, audit 2026-07-05): the full user directory (email, auth method, last-login
    // activity) is a user-management surface. Previously gated only by requireAuth, so ANY authenticated
    // role — including low-privilege Driver — could enumerate every user in the org. Restrict the full
    // directory read to Owner/Administrator, matching the create/patch/deactivate mutations
    // (isAdminRole). Assignee pickers used by non-admin roles read the minimal-fields /users/assignable
    // endpoint below instead of the full directory.
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedQuery = paginationSchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    const { limit, offset, include_inactive } = parsedQuery.data;
    if (include_inactive && !isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const { users, totalCount } = await withCurrentUser(authUser.uuid, async (client) => {
      const filters: string[] = [
        EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL,
        `(u.default_company_id IN (SELECT org.user_accessible_company_ids()) OR EXISTS (
            SELECT 1
            FROM org.user_company_access uca
            WHERE uca.user_id = u.id
              AND uca.company_id IN (SELECT org.user_accessible_company_ids())
          ))`,
      ];
      const values: unknown[] = [];
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
      if (!include_inactive) filters.push("u.deactivated_at IS NULL");
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      // USERS-LIST-SILENT-50-CAP: the response used to return only `{ users }` — the paginated
      // page, with no total. Users.tsx (frontend) treated that page as the complete roster and
      // computed every KPI/tab count from it; with more real users than the default limit=50 (or
      // even the max limit=200), those counts silently undercounted with zero indication of
      // truncation. A single COUNT(*) over the identical WHERE clause fixes that at the source.
      const countRes = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM identity.users u ${whereClause}`,
        values
      );
      values.push(limit, offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;
      const res = await client.query<IdentityUserRow>(
        `
          SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.google_user_id, u.password_hash, u.default_company_id, u.created_at, u.deactivated_at,
            u.last_login_at::text AS last_login_at
          FROM identity.users u
          ${whereClause}
          ORDER BY u.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );
      return { users: res.rows.map(mapIdentityUser), totalCount: Number(countRes.rows[0]?.total ?? 0) };
    });

    return { users, total_count: totalCount };
  });

  // USERS-2 minimal directory for assignee pickers. Every office role may read it (never Driver), but it
  // returns names + role only — no email auth method, no last-login. Active users only, no pagination
  // knob, capped, so it can never be turned into a full-directory dump by a low-privilege caller.
  app.get("/api/v1/identity/users/assignable", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (authUser.role === "Driver") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    const users = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [
        EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL,
        "u.deactivated_at IS NULL",
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
      const res = await client.query<AssignableUserRow>(
        `
          SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.default_company_id, u.created_at
          FROM identity.users u
          ${whereClause}
          ORDER BY u.first_name ASC, u.last_name ASC
          LIMIT 500
        `,
        values
      );
      return res.rows.map(mapAssignableUser);
    });

    return { users };
  });

  app.get("/api/v1/identity/users/:id", RL_READ, async (req, reply) => {
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
          SELECT id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at
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

  app.get("/api/v1/identity/users/:id/detail", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const parsedParams = userIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
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
      const userRes = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at
          FROM identity.users
          WHERE ${filters.join(" AND ")}
          LIMIT 1
        `,
        values
      );
      const user = userRes.rows[0] ?? null;
      if (!user) return null;

      const hasDriverRecordRes = await client.query<{ has_driver_record: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM mdata.drivers d
            WHERE d.identity_user_id = $1
              AND (
                $2::uuid IS NULL
                OR d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                  FROM mdata.driver_company_authorizations user_detail_dca
                  WHERE user_detail_dca.driver_id = d.id
                    AND user_detail_dca.company_id = $2::uuid
                    AND user_detail_dca.is_authorized = true
                    AND user_detail_dca.deactivated_at IS NULL
                )
              )
          ) AS has_driver_record
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id ?? null]
      );
      const hasDriverRecord = Boolean(hasDriverRecordRes.rows[0]?.has_driver_record);

      // Always include the target's default company when the *actor* can see it
      // (org.user_accessible_company_ids), even if there is no explicit
      // org.user_company_access grant for that company. Visibility of the user
      // already accepts default_company_id OR a grant; the label must match.
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
              OR (
                $3::uuid IS NOT NULL
                AND c.id = $3::uuid
                AND c.id IN (SELECT org.user_accessible_company_ids())
              )
            )
          ORDER BY c.legal_name
        `,
        [parsedParams.data.id, user.role, user.default_company_id]
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

  app.patch("/api/v1/identity/users/:id", RL_MUTATE, async (req, reply) => {
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
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }
    const parsedBody = patchUserBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      // USER-S05: mutations must use the same company-scope predicate as GET detail — RLS alone is role-only.
      const values: unknown[] = [parsedParams.data.id];
      const filters = ["id = $1", TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL];
      const activeFilter = activeCompanyFilterSql(values, parsedQuery.data.operating_company_id);
      if (activeFilter) filters.push(activeFilter);

      const oldRes = await client.query<IdentityUserRow>(
        `
          SELECT id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at
          FROM identity.users
          WHERE ${filters.join(" AND ")}
          LIMIT 1
        `,
        values
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;

      // G1-1 anti-escalation (LIVE-EXPLOITABLE fix — audit 2026-07-04): the PATCH was gated only by
      // isAdminRole, so ANY Administrator could set role=Owner on themselves or anyone (full escalation to
      // the money tier). Enforce: (1) only an Owner may grant the Owner role or re-role an existing Owner,
      // (2) no one may change their OWN role, (3) never demote the last active Owner.
      const newRole = parsedBody.data.role;
      if (newRole !== undefined && newRole !== oldRow.role) {
        const callerIsOwner = authUser.role === "Owner";
        if ((newRole === "Owner" || oldRow.role === "Owner") && !callerIsOwner) {
          return { roleGuard: "owner_role_requires_owner" as const };
        }
        if (parsedParams.data.id === authUser.uuid) {
          return { roleGuard: "cannot_change_own_role" as const };
        }
        if (oldRow.role === "Owner" && newRole !== "Owner") {
          const owners = await client.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM identity.users WHERE role = 'Owner' AND deactivated_at IS NULL AND id <> $1::uuid`,
            [oldRow.id]
          );
          if (Number(owners.rows[0]?.n ?? 0) === 0) return { roleGuard: "cannot_demote_last_owner" as const };
        }
      }

      const updateValues: unknown[] = [parsedBody.data.role, parsedParams.data.id];
      const updateFilters = ["id = $2", TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL];
      const updateActive = activeCompanyFilterSql(updateValues, parsedQuery.data.operating_company_id);
      if (updateActive) updateFilters.push(updateActive);

      const res = await client.query<IdentityUserRow>(
        `
          UPDATE identity.users
          SET role = $1
          WHERE ${updateFilters.join(" AND ")}
          RETURNING id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at
        `,
        updateValues
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

    if (updated && typeof updated === "object" && "roleGuard" in updated) {
      return reply.code(403).send({ error: updated.roleGuard });
    }
    if (!updated) {
      return reply.code(404).send({ error: "identity_user_not_found" });
    }

    return mapIdentityUser(updated);
  });

  app.post("/api/v1/identity/users", RL_MUTATE, async (req, reply) => {
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
    // USERS-1 (2026-07-03): probe/CI harness artifacts (m2-probe*/m2-stop*/*+verifyfix@…/*@example.com)
    // once landed as ACTIVE Owner accounts on PROD — standing privileged access with no human behind them.
    // Reject fixture-pattern emails on the create path in production so a harness can never do it again.
    if (IS_PROD_ENV && FIXTURE_USER_EMAIL_RE.test(parsedBody.data.email)) {
      return reply.code(400).send({ error: "fixture_email_forbidden_in_prod" });
    }
    if (parsedBody.data.initial_password) {
      const passwordParsed = officePasswordSchema.safeParse(parsedBody.data.initial_password);
      if (!passwordParsed.success) return sendValidationError(reply, passwordParsed.error);
    }
    if (!parsedBody.data.initial_password && !parsedBody.data.send_password_setup_invite) {
      return reply.code(400).send({ error: "initial_password_or_invite_required" });
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
        const { firstName, lastName } = splitName(parsedBody.data.name);
        const passwordHash = parsedBody.data.initial_password ? await argon2id.hash(parsedBody.data.initial_password) : null;
        const setupToken = !passwordHash && parsedBody.data.send_password_setup_invite ? randomUUID() : null;

        const creatorRes = await client.query<{ default_company_id: string | null }>(
          `SELECT default_company_id FROM identity.users WHERE id = $1 LIMIT 1`,
          [authUser.uuid]
        );
        const requestedCompanyId = parsedBody.data.operating_company_id ?? creatorRes.rows[0]?.default_company_id ?? null;
        // USER-S05: never mint a user into a company the actor cannot access (RLS insert is role-only).
        if (!requestedCompanyId) {
          return { error: "operating_company_required" as const };
        }
        const accessRes = await client.query<{ ok: boolean }>(
          `SELECT ($1::uuid IN (SELECT org.user_accessible_company_ids())) AS ok`,
          [requestedCompanyId]
        );
        if (!accessRes.rows[0]?.ok) {
          return { error: "operating_company_forbidden" as const };
        }
        const inheritedCompanyId = requestedCompanyId;

        const res = await client.query<IdentityUserRow>(
          `
            INSERT INTO identity.users (email, role, first_name, last_name, password_hash, default_company_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, role, first_name, last_name, google_user_id, password_hash, default_company_id, created_at, deactivated_at
          `,
          [parsedBody.data.email, parsedBody.data.role, firstName, lastName, passwordHash, inheritedCompanyId]
        );
        const row = res.rows[0];
        if (setupToken) {
          await client.query(
            `
              INSERT INTO identity.password_reset_tokens (token, user_id, expires_at, created_ip)
              VALUES ($1::uuid, $2::uuid, now() + interval '24 hours', $3::inet)
            `,
            [setupToken, row.id, req.ip ?? null]
          );
          await enqueueOutboxEvent(
            client,
            "identity.user.password_setup_invite",
            { aggregate_type: "identity.users", aggregate_id: row.id },
            {
              operating_company_id: inheritedCompanyId,
              to: parsedBody.data.email,
              user_name: parsedBody.data.name,
              confirm_url: frontendResetConfirmUrl(setupToken),
              recipient_user_id: row.id,
              actor_user_id: authUser.uuid,
            }
          );
        }
        await appendCrudAudit(client, authUser.uuid, "identity.users.created", {
          resource_id: row.id,
          resource_type: "identity.users",
          id: row.id,
          name: parsedBody.data.name,
          email: row.email,
          role: row.role,
          auth_method: passwordHash ? "Password" : "Invite pending",
          password_setup_invite_issued: Boolean(setupToken),
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

        return { row, setupToken };
      });

      if (created && typeof created === "object" && "error" in created && created.error === "returning_dispatcher_detected") {
        return reply.code(409).send({
          error: "returning_dispatcher_detected",
          ...created.detection,
        });
      }
      if (created && typeof created === "object" && "error" in created && created.error === "operating_company_required") {
        return reply.code(400).send({ error: "operating_company_required" });
      }
      if (created && typeof created === "object" && "error" in created && created.error === "operating_company_forbidden") {
        return reply.code(403).send({ error: "operating_company_forbidden" });
      }

      const createdResult = created as { row: IdentityUserRow; setupToken: string | null };

      return reply.code(201).send(mapIdentityUser(createdResult.row));
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        return reply.code(409).send({ error: "identity_user_conflict" });
      }
      throw err;
    }
  });

  app.post("/api/v1/identity/users/:id/deactivate", RL_MUTATE, async (req, reply) => {
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
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        // USER-S05: same company-scope as GET — prevent cross-tenant deactivate by UUID.
        const values: unknown[] = [parsedParams.data.id];
        const filters = ["id = $1", TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL];
        const activeFilter = activeCompanyFilterSql(values, parsedQuery.data.operating_company_id);
        if (activeFilter) filters.push(activeFilter);

        const oldRes = await client.query<{ id: string; deactivated_at: string | null }>(
          `
            SELECT id, deactivated_at
            FROM identity.users
            WHERE ${filters.join(" AND ")}
            LIMIT 1
          `,
          values
        );
        const oldRow = oldRes.rows[0];
        if (!oldRow) return null;

        let deactivatedAt = oldRow.deactivated_at;
        let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
        if (!wasAlreadyDeactivated) {
          const updateValues: unknown[] = [parsedParams.data.id];
          const updateFilters = ["id = $1", "deactivated_at IS NULL", TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL];
          const updateActive = activeCompanyFilterSql(updateValues, parsedQuery.data.operating_company_id);
          if (updateActive) updateFilters.push(updateActive);
          const res = await client.query<{ id: string; deactivated_at: string }>(
            `
              UPDATE identity.users
              SET deactivated_at = now()
              WHERE ${updateFilters.join(" AND ")}
              RETURNING id, deactivated_at
            `,
            updateValues
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
