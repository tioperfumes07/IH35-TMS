// E20 Part A (Lead spec, 2026-09-23) -- the Samsara Mapping Engine backend.
//
// One real driver may legitimately map to MANY Samsara telematics profiles (the root cause of
// the 65 duplicate-driver groups: mdata.drivers.samsara_driver_id used to be a single scalar
// column). integrations.samsara_drivers.local_driver_id is the mapping column (no unique
// constraint on it, by design); local_vendor_id (migration 202614280000) is its polymorphic
// sibling for an owner-operator paid as a vendor, never both set on one row
// (ck_samsara_drivers_one_target). NEVER AUTO-MAP: every write here is a human POST, and the
// resolver (resolver.service.ts) only ever suggests -- it never applies anything itself.
// UNMAPPED IS NOT A DEFECT: 663 of 758 USMCA profiles are unmapped today (shop tablets, yard
// trucks, drivers who left) and these routes never treat that as an error state.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../../../accounting/shared.js";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { resolveProfilesAgainstCandidates, type ResolverCandidate, type ResolverProfile } from "./resolver.service.js";

function officeRole(role: string) {
  return role !== "Driver";
}

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

function readSamsaraName(rawPayload: Record<string, unknown> | null): string {
  const raw = rawPayload ?? {};
  const explicit = typeof raw.name === "string" ? raw.name.trim() : "";
  if (explicit) return explicit;
  const firstName = typeof raw.firstName === "string" ? raw.firstName.trim() : "";
  const lastName = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
  return `${firstName} ${lastName}`.trim();
}

async function hasCompanyAccess(client: DbClient, userId: string, operatingCompanyId: string) {
  const access = await client.query(
    `SELECT 1 FROM org.user_company_access WHERE user_id = $1::uuid AND company_id = $2::uuid LIMIT 1`,
    [userId, operatingCompanyId]
  );
  return (access.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------------------------
// GET /api/v1/samsara/profiles
// ---------------------------------------------------------------------------------------------
const profilesQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["unmapped", "mapped", "all"]).default("all"),
  seen_since: z.string().datetime().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  cursor: z.coerce.number().int().min(0).default(0),
});

type ProfileRow = {
  samsara_driver_id: string;
  local_driver_id: string | null;
  local_vendor_id: string | null;
  driver_name: string | null;
  vendor_name: string | null;
  driver_status: string | null;
  vendor_deactivated_at: string | null;
  raw_payload: Record<string, unknown> | null;
  last_seen_at: string | null;
  driver_activation_status: string | null;
};

// ---------------------------------------------------------------------------------------------
// GET /api/v1/samsara/mapping-targets
// ---------------------------------------------------------------------------------------------
const targetsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  kind: z.enum(["driver", "vendor"]),
  filter: z.enum(["active", "past", "all"]).default("active"),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// ---------------------------------------------------------------------------------------------
// POST /api/v1/samsara/map · POST /api/v1/samsara/unmap
// ---------------------------------------------------------------------------------------------
const mapSchema = z.object({
  operating_company_id: z.string().uuid(),
  samsara_driver_ids: z.array(z.string().min(1)).min(1).max(200),
  target_kind: z.enum(["driver", "vendor"]),
  target_id: z.string().uuid(),
});

const unmapSchema = z.object({
  operating_company_id: z.string().uuid(),
  samsara_driver_ids: z.array(z.string().min(1)).min(1).max(200),
});

async function appendMappingAudit(
  client: DbClient,
  params: {
    actorUserUuid: string;
    operatingCompanyId: string;
    action: "map" | "unmap";
    samsaraDriverIds: string[];
    targetKind?: "driver" | "vendor";
    targetId?: string | null;
  }
) {
  await appendCrudAudit(
    client,
    params.actorUserUuid,
    `samsara.driver_mapping.${params.action}`,
    {
      operating_company_id: params.operatingCompanyId,
      samsara_driver_ids: params.samsaraDriverIds,
      target_kind: params.targetKind ?? null,
      target_id: params.targetId ?? null,
    },
    "info",
    "E20-SAMSARA-MAPPING-ENGINE"
  );
}

export async function registerSamsaraDriverMappingRoutes(app: FastifyInstance) {
  // GET /api/v1/samsara/profiles -- every Samsara profile, its current mapping (if any), and a
  // NEVER-AUTO-APPLIED resolver suggestion computed by exact normalized-name match only.
  app.get(
    "/api/v1/samsara/profiles",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = profilesQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const { operating_company_id, status, seen_since, q, limit, cursor } = parsed.data;

      const result = await withCompanyScope(user.uuid, operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, operating_company_id))) {
          return { status: "forbidden" as const };
        }

        const conditions = [`sd.operating_company_id = $1::uuid`];
        const params: unknown[] = [operating_company_id];
        if (status === "unmapped") conditions.push(`sd.local_driver_id IS NULL AND sd.local_vendor_id IS NULL`);
        if (status === "mapped") conditions.push(`(sd.local_driver_id IS NOT NULL OR sd.local_vendor_id IS NOT NULL)`);
        if (seen_since) {
          params.push(seen_since);
          conditions.push(`sd.last_seen_at >= $${params.length}::timestamptz`);
        }
        if (q) {
          params.push(`%${q.toLowerCase()}%`);
          conditions.push(
            `(lower(coalesce(sd.raw_payload->>'name','') || ' ' || coalesce(sd.raw_payload->>'firstName','') || ' ' || coalesce(sd.raw_payload->>'lastName','')) LIKE $${params.length} OR lower(sd.samsara_driver_id) LIKE $${params.length})`
          );
        }
        params.push(limit);
        const limitParam = params.length;
        params.push(cursor);
        const offsetParam = params.length;

        const rows = (await client.query(
          `
            SELECT
              sd.samsara_driver_id,
              sd.local_driver_id::text AS local_driver_id,
              sd.local_vendor_id::text AS local_vendor_id,
              (md.first_name || ' ' || md.last_name) AS driver_name,
              mv.vendor_name AS vendor_name,
              md.status AS driver_status,
              mv.deactivated_at::text AS vendor_deactivated_at,
              sd.raw_payload,
              sd.last_seen_at::text AS last_seen_at,
              sd.driver_activation_status
            FROM integrations.samsara_drivers sd
            LEFT JOIN mdata.drivers md ON md.id = sd.local_driver_id
            LEFT JOIN mdata.vendors mv ON mv.id = sd.local_vendor_id
            WHERE ${conditions.join(" AND ")}
            ORDER BY sd.last_seen_at DESC NULLS LAST, sd.samsara_driver_id ASC
            LIMIT $${limitParam} OFFSET $${offsetParam}
          `,
          params
        )) as { rows: ProfileRow[] };

        // Resolver suggestions: only for CURRENTLY UNMAPPED profiles, only against CURRENT
        // (Active/Probation) drivers -- the scope cut the whole engine is bound by. Never
        // computed against past/inactive drivers; never auto-applied.
        const unmappedProfiles: ResolverProfile[] = rows.rows
          .filter((r) => !r.local_driver_id && !r.local_vendor_id)
          .map((r) => ({ samsara_driver_id: r.samsara_driver_id, name: readSamsaraName(r.raw_payload) }))
          .filter((p) => p.name.length > 0);

        let suggestions = new Map<string, { status: string; target_id?: string; candidate_ids?: string[] }>();
        if (unmappedProfiles.length > 0) {
          const candidateRows = (await client.query(
            `
              SELECT id::text AS id, (first_name || ' ' || last_name) AS name
              FROM mdata.drivers
              WHERE operating_company_id = $1::uuid
                AND status IN ('Active', 'Probation')
            `,
            [operating_company_id]
          )) as { rows: ResolverCandidate[] };

          suggestions = resolveProfilesAgainstCandidates(unmappedProfiles, candidateRows.rows) as unknown as Map<
            string,
            { status: string; target_id?: string; candidate_ids?: string[] }
          >;
        }

        return {
          status: "ok" as const,
          profiles: rows.rows.map((r) => {
            const suggestion = suggestions.get(r.samsara_driver_id);
            return {
              samsara_driver_id: r.samsara_driver_id,
              samsara_name: readSamsaraName(r.raw_payload),
              mapped: Boolean(r.local_driver_id || r.local_vendor_id),
              local_driver_id: r.local_driver_id,
              local_vendor_id: r.local_vendor_id,
              driver_name: r.driver_name,
              vendor_name: r.vendor_name,
              driver_status: r.driver_status,
              mapped_target_deactivated: Boolean(
                (r.local_driver_id && r.driver_status && !["Active", "Probation"].includes(r.driver_status)) ||
                  (r.local_vendor_id && r.vendor_deactivated_at)
              ),
              last_seen_at: r.last_seen_at,
              // NEVER a pick: "matched" is the only status a caller may show as a suggestion;
              // "ambiguous" must show every candidate; "unmatched" is reported, not hidden.
              resolver_suggestion: suggestion ?? { status: "unmatched" },
            };
          }),
          next_cursor: rows.rows.length === limit ? cursor + limit : null,
        };
      });

      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(200).send(result);
    }
  );

  // GET /api/v1/samsara/mapping-targets -- pickable drivers or vendors for the map action.
  app.get(
    "/api/v1/samsara/mapping-targets",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = targetsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const { operating_company_id, kind, filter, q, limit } = parsed.data;

      const result = await withCompanyScope(user.uuid, operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, operating_company_id))) {
          return { status: "forbidden" as const };
        }

        if (kind === "driver") {
          const conditions = [`operating_company_id = $1::uuid`];
          const params: unknown[] = [operating_company_id];
          if (filter === "active") conditions.push(`status IN ('Active', 'Probation')`);
          if (filter === "past") conditions.push(`status NOT IN ('Active', 'Probation')`);
          if (q) {
            params.push(`%${q.toLowerCase()}%`);
            conditions.push(`lower(first_name || ' ' || last_name) LIKE $${params.length}`);
          }
          params.push(limit);
          const rows = await client.query<{ id: string; name: string; status: string }>(
            `
              SELECT id::text AS id, (first_name || ' ' || last_name) AS name, status
              FROM mdata.drivers
              WHERE ${conditions.join(" AND ")}
              ORDER BY last_name ASC, first_name ASC
              LIMIT $${params.length}
            `,
            params
          );
          return {
            status: "ok" as const,
            targets: rows.rows.map((r) => ({ id: r.id, name: r.name, kind: "driver" as const, active: ["Active", "Probation"].includes(r.status) })),
          };
        }

        const conditions = [`operating_company_id = $1::uuid`];
        const params: unknown[] = [operating_company_id];
        if (filter === "active") conditions.push(`deactivated_at IS NULL`);
        if (filter === "past") conditions.push(`deactivated_at IS NOT NULL`);
        if (q) {
          params.push(`%${q.toLowerCase()}%`);
          conditions.push(`lower(vendor_name) LIKE $${params.length}`);
        }
        params.push(limit);
        const rows = await client.query<{ id: string; name: string; deactivated_at: string | null }>(
          `
            SELECT id::text AS id, vendor_name AS name, deactivated_at::text AS deactivated_at
            FROM mdata.vendors
            WHERE ${conditions.join(" AND ")}
            ORDER BY vendor_name ASC
            LIMIT $${params.length}
          `,
          params
        );
        return {
          status: "ok" as const,
          targets: rows.rows.map((r) => ({ id: r.id, name: r.name, kind: "vendor" as const, active: !r.deactivated_at })),
        };
      });

      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(200).send(result);
    }
  );

  // POST /api/v1/samsara/map -- the ONLY write path that sets local_driver_id/local_vendor_id.
  // Idempotent: mapping an already-correctly-mapped profile to the same target is a no-op
  // success, not an error. Multi-select: many samsara_driver_ids to one target in one call,
  // matching "MANY PROFILES -> ONE DRIVER" by design.
  app.post(
    "/api/v1/samsara/map",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = mapSchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const { operating_company_id, samsara_driver_ids, target_kind, target_id } = parsed.data;
      const ids = Array.from(new Set(samsara_driver_ids));

      const result = await withCompanyScope(user.uuid, operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, operating_company_id))) {
          return { status: "forbidden" as const };
        }

        if (target_kind === "driver") {
          const target = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM mdata.drivers WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
            [operating_company_id, target_id]
          );
          if (target.rows.length === 0) return { status: "target_not_found" as const };
        } else {
          const target = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM mdata.vendors WHERE operating_company_id = $1::uuid AND id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
            [operating_company_id, target_id]
          );
          if (target.rows.length === 0) return { status: "target_not_found" as const };
        }

        const found = await client.query<{ samsara_driver_id: string }>(
          `SELECT samsara_driver_id FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id = ANY($2::text[])`,
          [operating_company_id, ids]
        );
        const foundIds = new Set(found.rows.map((r) => r.samsara_driver_id));
        const missing = ids.filter((id) => !foundIds.has(id));

        const updated = await client.query<{ samsara_driver_id: string }>(
          target_kind === "driver"
            ? `
                UPDATE integrations.samsara_drivers
                SET local_driver_id = $3::uuid, local_vendor_id = NULL, updated_at = now()
                WHERE operating_company_id = $1::uuid AND samsara_driver_id = ANY($2::text[])
                RETURNING samsara_driver_id
              `
            : `
                UPDATE integrations.samsara_drivers
                SET local_vendor_id = $3::uuid, local_driver_id = NULL, updated_at = now()
                WHERE operating_company_id = $1::uuid AND samsara_driver_id = ANY($2::text[])
                RETURNING samsara_driver_id
              `,
          [operating_company_id, ids, target_id]
        );

        await appendMappingAudit(client, {
          actorUserUuid: user.uuid,
          operatingCompanyId: operating_company_id,
          action: "map",
          samsaraDriverIds: updated.rows.map((r) => r.samsara_driver_id),
          targetKind: target_kind,
          targetId: target_id,
        });

        return { status: "ok" as const, mapped_count: updated.rowCount ?? 0, missing_samsara_driver_ids: missing };
      });

      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.status === "target_not_found") return reply.code(404).send({ error: "target_not_found" });
      return reply.code(200).send(result);
    }
  );

  // POST /api/v1/samsara/unmap -- clears both target columns. Idempotent: unmapping an
  // already-unmapped profile is a no-op success.
  app.post(
    "/api/v1/samsara/unmap",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = unmapSchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const { operating_company_id, samsara_driver_ids } = parsed.data;
      const ids = Array.from(new Set(samsara_driver_ids));

      const result = await withCompanyScope(user.uuid, operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, operating_company_id))) {
          return { status: "forbidden" as const };
        }

        const updated = await client.query<{ samsara_driver_id: string }>(
          `
            UPDATE integrations.samsara_drivers
            SET local_driver_id = NULL, local_vendor_id = NULL, updated_at = now()
            WHERE operating_company_id = $1::uuid AND samsara_driver_id = ANY($2::text[])
            RETURNING samsara_driver_id
          `,
          [operating_company_id, ids]
        );

        await appendMappingAudit(client, {
          actorUserUuid: user.uuid,
          operatingCompanyId: operating_company_id,
          action: "unmap",
          samsaraDriverIds: updated.rows.map((r) => r.samsara_driver_id),
        });

        return { status: "ok" as const, unmapped_count: updated.rowCount ?? 0 };
      });

      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(200).send(result);
    }
  );
}
