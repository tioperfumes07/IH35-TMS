import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

/** Patterns archived by migration 0396 and guarded in production listings. */
export const TEST_USER_EMAIL_ARCHIVE_PATTERNS = [
  "@test.invalid",
  "@example.com",
  "integration.",
] as const;

export function isArchivedTestUserEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith("@test.invalid") ||
    normalized.endsWith("@example.com") ||
    normalized.startsWith("integration.")
  );
}

export function identityUsersArchiveFilterSql(includeArchived: boolean, alias = "u"): string {
  return includeArchived ? "TRUE" : `${alias}.archived_at IS NULL`;
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  operating_company_id: z.string().uuid().optional(),
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
  include_archived: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

type IdentityUserRow = {
  id: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  default_company_id: string | null;
  created_at: string;
  deactivated_at: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  last_login_at?: string | null;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isOwnerRole(role: string) {
  return role === "Owner";
}

function isAdminRole(role: string) {
  return role === "Owner" || role === "Administrator";
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapIdentityUser(row: IdentityUserRow) {
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
    deactivated_at: row.deactivated_at,
    archived_at: row.archived_at,
    archived_reason: row.archived_reason,
    last_login_at: row.last_login_at ?? null,
    is_archived_test_seed: Boolean(row.archived_at && isArchivedTestUserEmail(row.email)),
  };
}

async function listIdentityUsersWithArchivePolicy(req: FastifyRequest, reply: FastifyReply) {
  const authUser = currentAuthUser(req, reply);
  if (!authUser) return;

  const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

  const { limit, offset, include_inactive, include_archived } = parsedQuery.data;
  if (include_inactive && !isAdminRole(authUser.role)) {
    return reply.code(403).send({ error: "forbidden" });
  }
  if (include_archived && !isOwnerRole(authUser.role)) {
    return reply.code(403).send({ error: "forbidden" });
  }

  const users = await withCurrentUser(authUser.uuid, async (client) => {
    const filters: string[] = [
      identityUsersArchiveFilterSql(include_archived),
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
    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;
    const res = await client.query<IdentityUserRow>(
      `
        SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.default_company_id, u.created_at,
          u.deactivated_at, u.archived_at::text AS archived_at, u.archived_reason,
          u.last_login_at::text AS last_login_at
        FROM identity.users u
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${limitIdx}
        OFFSET $${offsetIdx}
      `,
      values
    );
    return res.rows.map(mapIdentityUser);
  });

  return { users };
}

/**
 * Install onRoute hook so GET /api/v1/identity/users honors ?include_archived=true for Owner.
 * Must be registered before registerIdentityRoutes(app).
 */
export async function registerArchiveTestUsersRoutes(app: FastifyInstance) {
  app.addHook("onRoute", (routeOptions) => {
    if (routeOptions.method !== "GET" || routeOptions.url !== "/api/v1/identity/users") return;

    const originalHandler = routeOptions.handler;
    routeOptions.handler = async function archiveAwareIdentityUsersHandler(req, reply) {
      const parsed = listQuerySchema.safeParse(req.query ?? {});
      const includeArchived = parsed.success && parsed.data.include_archived;
      if (includeArchived) {
        return listIdentityUsersWithArchivePolicy(req, reply);
      }
      if (typeof originalHandler === "function") {
        return originalHandler.call(this, req, reply);
      }
      return reply.code(500).send({ error: "identity_users_handler_missing" });
    };
  });
}

export default fp(
  async (app) => {
    await registerArchiveTestUsersRoutes(app);
  },
  { name: "identity.registerArchiveTestUsersRoutes" }
);
