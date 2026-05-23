import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

function officeRole(role: string) {
  return role !== "Driver";
}

const linkSchema = z.object({
  operating_company_id: z.string().uuid(),
  samsara_driver_id: z.string().min(1),
  qbo_vendor_id: z.string().min(1),
});

const dedupeSchema = z.object({
  operating_company_id: z.string().uuid(),
  samsara_driver_id: z.string().min(1),
  canonical_qbo_vendor_id: z.string().min(1),
  deprecated_qbo_vendor_ids: z.array(z.string().min(1)).min(1),
});

const confirmMismatchSchema = z.object({
  operating_company_id: z.string().uuid(),
  samsara_driver_id: z.string().min(1),
  qbo_vendor_id: z.string().min(1),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

async function hasCompanyAccess(client: DbClient, userId: string, operatingCompanyId: string) {
  const access = await client.query(
    `
      SELECT 1
      FROM org.user_company_access uca
      WHERE uca.user_id = $1::uuid
        AND uca.company_id = $2::uuid
      LIMIT 1
    `,
    [userId, operatingCompanyId],
  );
  return (access.rowCount ?? 0) > 0;
}

async function resolveVendorInTenant(client: DbClient, operatingCompanyId: string, qboVendorId: string) {
  const vendor = await client.query<{ id: string; qbo_id: string | null }>(
    `
      SELECT id::text AS id, qbo_id
      FROM mdata.qbo_vendors
      WHERE operating_company_id = $1::uuid
        AND (id::text = $2 OR qbo_id = $2)
      LIMIT 1
    `,
    [operatingCompanyId, qboVendorId],
  );
  return vendor.rows[0] ?? null;
}

async function appendResolutionAudit(
  client: DbClient,
  params: {
    operatingCompanyId: string;
    actorUserUuid: string;
    action: "link" | "dedupe" | "confirm";
    driverId: string;
    vendorId: string;
    samsaraDriverId: string;
    deprecatedVendorIds?: string[];
  },
) {
  const payload = {
    action: params.action,
    driver_id: params.driverId,
    vendor_id: params.vendorId,
    samsara_driver_id: params.samsaraDriverId,
    actor_user_uuid: params.actorUserUuid,
    ...(params.deprecatedVendorIds ? { deprecated_vendor_ids: params.deprecatedVendorIds } : {}),
  };

  await client.query(
    `
      SELECT audit.append_event(
        $1::text,
        $2::text,
        $3::jsonb,
        $4::uuid,
        $5::uuid
      )
    `,
    ["vendor_mapping_resolution", "info", JSON.stringify(payload), params.operatingCompanyId, params.actorUserUuid],
  );
}

export async function registerSamsaraVendorMappingActionsRoutes(app: FastifyInstance) {
  app.post("/api/v1/samsara/vendor-mapping/link", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = linkSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }

      const resolvedVendor = await resolveVendorInTenant(client, parsed.data.operating_company_id, parsed.data.qbo_vendor_id);
      if (!resolvedVendor) return { status: "vendor_missing" as const };

      const driver = await client.query<{ driver_id: string; qbo_vendor_id: string | null }>(
        `
          SELECT
            md.id::text AS driver_id,
            md.qbo_vendor_id
          FROM integrations.samsara_drivers sd
          JOIN mdata.drivers md
            ON md.id = sd.local_driver_id
            AND md.operating_company_id = $1::uuid
          WHERE sd.operating_company_id = $1::uuid
            AND sd.samsara_driver_id = $2
          LIMIT 1
        `,
        [parsed.data.operating_company_id, parsed.data.samsara_driver_id],
      );
      const target = driver.rows[0];
      if (!target) return { status: "driver_missing" as const };

      await client.query(
        `
          UPDATE mdata.drivers
          SET qbo_vendor_id = $3
          WHERE operating_company_id = $1::uuid
            AND id = $2::uuid
        `,
        [parsed.data.operating_company_id, target.driver_id, resolvedVendor.id],
      );

      await appendResolutionAudit(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        actorUserUuid: user.uuid,
        action: "link",
        driverId: target.driver_id,
        vendorId: resolvedVendor.id,
        samsaraDriverId: parsed.data.samsara_driver_id,
      });

      return {
        status: "ok" as const,
        before_vendor_id: target.qbo_vendor_id,
        after_vendor_id: resolvedVendor.id,
        driver_id: target.driver_id,
      };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (result.status === "vendor_missing") return reply.code(404).send({ error: "vendor_not_found" });
    if (result.status === "driver_missing") return reply.code(404).send({ error: "driver_not_found" });
    return reply.code(200).send(result);
  });

  app.post("/api/v1/samsara/vendor-mapping/dedupe", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = dedupeSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const deprecatedRaw = Array.from(new Set(parsed.data.deprecated_qbo_vendor_ids));
    const deprecatedWithoutCanonical = deprecatedRaw.filter((id) => id !== parsed.data.canonical_qbo_vendor_id);
    if (deprecatedWithoutCanonical.length === 0) {
      return reply.code(400).send({ error: "deprecated_qbo_vendor_ids_required" });
    }

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }

      const canonicalVendor = await resolveVendorInTenant(client, parsed.data.operating_company_id, parsed.data.canonical_qbo_vendor_id);
      if (!canonicalVendor) return { status: "canonical_vendor_missing" as const };

      const deprecatedVendors = await client.query<{ id: string; qbo_id: string | null }>(
        `
          SELECT id::text AS id, qbo_id
          FROM mdata.qbo_vendors
          WHERE operating_company_id = $1::uuid
            AND (id::text = ANY($2::text[]) OR qbo_id = ANY($2::text[]))
        `,
        [parsed.data.operating_company_id, deprecatedWithoutCanonical],
      );
      if ((deprecatedVendors.rowCount ?? 0) !== deprecatedWithoutCanonical.length) {
        return { status: "deprecated_vendor_missing" as const };
      }

      const vendorAliases = [canonicalVendor.id, ...(canonicalVendor.qbo_id ? [canonicalVendor.qbo_id] : [])];
      const dedupeCandidates = deprecatedVendors.rows.flatMap((row: { id: string; qbo_id: string | null }) => [
        row.id,
        ...(row.qbo_id ? [row.qbo_id] : []),
      ]);
      const affectedVendorIds = Array.from(new Set([...vendorAliases, ...dedupeCandidates]));

      const touched = await client.query<{ id: string }>(
        `
          UPDATE mdata.drivers
          SET qbo_vendor_id = $3
          WHERE operating_company_id = $1::uuid
            AND samsara_driver_id = $2
            AND qbo_vendor_id = ANY($4::text[])
          RETURNING id::text AS id
        `,
        [parsed.data.operating_company_id, parsed.data.samsara_driver_id, canonicalVendor.id, affectedVendorIds],
      );
      if ((touched.rowCount ?? 0) === 0) return { status: "driver_mapping_missing" as const };

      await appendResolutionAudit(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        actorUserUuid: user.uuid,
        action: "dedupe",
        driverId: touched.rows[0]?.id ?? "",
        vendorId: canonicalVendor.id,
        samsaraDriverId: parsed.data.samsara_driver_id,
        deprecatedVendorIds: deprecatedWithoutCanonical,
      });

      return {
        status: "ok" as const,
        canonical_vendor_id: canonicalVendor.id,
        touched_rows: touched.rowCount ?? 0,
      };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (result.status === "canonical_vendor_missing") return reply.code(404).send({ error: "canonical_vendor_not_found" });
    if (result.status === "deprecated_vendor_missing") return reply.code(404).send({ error: "deprecated_vendor_not_found" });
    if (result.status === "driver_mapping_missing") return reply.code(404).send({ error: "driver_mapping_not_found" });
    return reply.code(200).send(result);
  });

  app.post("/api/v1/samsara/vendor-mapping/confirm-mismatch", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = confirmMismatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }

      const mapped = await client.query<{ driver_id: string; vendor_id: string }>(
        `
          SELECT
            md.id::text AS driver_id,
            qv.id::text AS vendor_id
          FROM integrations.samsara_drivers sd
          JOIN mdata.drivers md
            ON md.id = sd.local_driver_id
            AND md.operating_company_id = $1::uuid
          JOIN mdata.qbo_vendors qv
            ON qv.operating_company_id = $1::uuid
            AND (qv.id::text = md.qbo_vendor_id OR qv.qbo_id = md.qbo_vendor_id)
          WHERE sd.operating_company_id = $1::uuid
            AND sd.samsara_driver_id = $2
            AND (qv.id::text = $3 OR qv.qbo_id = $3)
          LIMIT 1
        `,
        [parsed.data.operating_company_id, parsed.data.samsara_driver_id, parsed.data.qbo_vendor_id],
      );
      const target = mapped.rows[0];
      if (!target) return { status: "mapping_missing" as const };

      await appendResolutionAudit(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        actorUserUuid: user.uuid,
        action: "confirm",
        driverId: target.driver_id,
        vendorId: target.vendor_id,
        samsaraDriverId: parsed.data.samsara_driver_id,
      });

      return { status: "ok" as const, driver_id: target.driver_id, vendor_id: target.vendor_id };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (result.status === "mapping_missing") return reply.code(404).send({ error: "mapping_not_found" });
    return reply.code(200).send(result);
  });
}
