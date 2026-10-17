import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { getPrefs } from "../identity/user-preferences.service.js";

const tableIdQuerySchema = z.object({
  table_id: z.string().trim().min(1).max(120),
});

// LEAD 443.181 (owner law: no capability lost) — a table's saved view (column order / visibility /
// widths / page size / density) is stored server-side so it follows the user to every device. The
// PATCH used to accept column_widths only, so ListView's saved_view writes were rejected (400) and
// never stored. Either key may be sent; each is written to its own branch of the prefs document.
const savedViewSchema = z
  .object({
    columnOrder: z.array(z.string().max(120)).max(200).optional(),
    columnWidths: z.record(z.string().max(120), z.number().min(0).max(2000)).optional(),
    visibleColumns: z.record(z.string().max(120), z.boolean()).optional(),
    pageSize: z.number().int().min(1).max(100000).optional(),
    density: z.enum(["regular", "compact", "ultra"]).optional(),
  })
  .strict();

export const patchBodySchema = z
  .object({
    table_id: z.string().trim().min(1).max(120),
    column_widths: z.record(z.string(), z.number().min(60).max(800)).optional(),
    saved_view: savedViewSchema.optional(),
  })
  .refine((body) => body.column_widths != null || body.saved_view != null, {
    message: "column_widths or saved_view is required",
  });

const tenantQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function readSavedView(preferences: Record<string, unknown>, tableId: string) {
  const root = preferences.table_saved_views;
  if (!root || typeof root !== "object") return null;
  const view = (root as Record<string, unknown>)[tableId];
  return view && typeof view === "object" ? (view as Record<string, unknown>) : null;
}

function readTableWidths(preferences: Record<string, unknown>, tableId: string) {
  const root = preferences.table_column_widths;
  if (!root || typeof root !== "object") return {};
  const widths = (root as Record<string, unknown>)[tableId];
  if (!widths || typeof widths !== "object") return {};
  return widths as Record<string, number>;
}

export async function registerTableColumnPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/users/me/table-preferences", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsedQuery = tableIdQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    const tenant = tenantQuerySchema.safeParse(req.query ?? {});
    const preferences = await getPrefs(user.uuid, tenant.success ? tenant.data.operating_company_id ?? null : null);
    return {
      table_id: parsedQuery.data.table_id,
      column_widths: readTableWidths(preferences, parsedQuery.data.table_id),
      saved_view: readSavedView(preferences, parsedQuery.data.table_id),
    };
  });

  app.patch("/api/v1/users/me/table-preferences", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const tenant = tenantQuerySchema.safeParse(req.query ?? {});
    const opCoId = tenant.success ? (tenant.data.operating_company_id ?? null) : null;
    // TABLE-PREFS-DEEP-MERGE: write only the targeted table's widths using jsonb_set so other
    // tables' saved widths are never overwritten. The previous updatePrefs shallow-merge replaced
    // the whole table_column_widths object on every PATCH, causing persistent width loss and
    // triggering save-error banners when rapid navigations raced the debounced writes.
    const preferences = await withCurrentUser(user.uuid, async (client) => {
      if (opCoId) await setScopedCompanyContext(client, user.uuid, opCoId);
      let latest: Record<string, unknown> = {};
      for (const [branch, value] of [
        ["table_column_widths", parsed.data.column_widths],
        ["table_saved_views", parsed.data.saved_view],
      ] as const) {
        if (value == null) continue;
        const result = await client.query<{ preferences: Record<string, unknown> }>(
          `INSERT INTO identity.user_preferences (user_id, preferences, updated_at)
           VALUES ($1, jsonb_build_object($4::text, jsonb_build_object($2::text, $3::jsonb)), now())
           ON CONFLICT (user_id) DO UPDATE
             SET preferences = jsonb_set(
               jsonb_set(
                 COALESCE(identity.user_preferences.preferences, '{}'::jsonb),
                 ARRAY[$4::text],
                 COALESCE(identity.user_preferences.preferences -> $4::text, '{}'::jsonb),
                 true
               ),
               ARRAY[$4::text, $2::text],
               $3::jsonb,
               true
             ),
             updated_at = now()
           RETURNING preferences`,
          [user.uuid, parsed.data.table_id, JSON.stringify(value), branch]
        );
        latest = result.rows[0]?.preferences ?? latest;
      }
      return latest;
    });
    return {
      table_id: parsed.data.table_id,
      column_widths: readTableWidths(preferences, parsed.data.table_id),
      saved_view: readSavedView(preferences, parsed.data.table_id),
    };
  });
}
