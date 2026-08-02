import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function officeRole(role: string) {
  return role !== "Driver";
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenDice(aRaw: string, bRaw: string) {
  const aTokens = normalizeName(aRaw).split(" ").filter(Boolean);
  const bTokens = normalizeName(bRaw).split(" ").filter(Boolean);
  if (aTokens.length === 0 && bTokens.length === 0) return 1;
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) overlap += 1;
  }
  return (2 * overlap) / (aTokens.length + bTokens.length);
}

function readSamsaraName(rawPayload: Record<string, unknown>) {
  const explicit = typeof rawPayload.name === "string" ? rawPayload.name.trim() : "";
  if (explicit) return explicit;
  const firstName = typeof rawPayload.firstName === "string" ? rawPayload.firstName.trim() : "";
  const lastName = typeof rawPayload.lastName === "string" ? rawPayload.lastName.trim() : "";
  return `${firstName} ${lastName}`.trim();
}

type NameMismatchRow = {
  samsara_driver_id: string;
  driver_id: string;
  qbo_vendor_id: string;
  qbo_display_name: string | null;
  qbo_company_name: string | null;
  raw_payload: Record<string, unknown>;
};

type UnmappedRow = {
  samsara_driver_id: string;
  local_driver_id: string | null;
  driver_name: string;
  reason: string;
};

type DuplicateRow = {
  samsara_driver_id: string;
  vendor_count: string;
  qbo_vendor_ids: string[] | null;
};

type MismatchView = {
  samsara_driver_id: string;
  driver_id: string;
  qbo_vendor_id: string;
  samsara_name: string;
  qbo_vendor_name: string;
  similarity_score: number;
};

export async function registerSamsaraVendorMappingIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/samsara/vendor-mapping-integrity", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const tablesExist = (await client.query(
        `
          SELECT
            to_regclass('integrations.samsara_drivers') IS NOT NULL AS samsara_ok,
            to_regclass('mdata.drivers') IS NOT NULL AS drivers_ok,
            to_regclass('mdata.qbo_vendors') IS NOT NULL AS vendors_ok
        `,
      )) as {
        rows: Array<{
          samsara_ok: boolean;
          drivers_ok: boolean;
          vendors_ok: boolean;
        }>;
      };
      const exists = tablesExist.rows[0];
      if (!exists?.samsara_ok || !exists.drivers_ok || !exists.vendors_ok) {
        return {
          status: "green" as const,
          totals: {
            unmapped_drivers: 0,
            duplicate_mapping: 0,
            name_mismatch: 0,
            major_drift: 0,
            total_issues: 0,
          },
          unmapped_drivers: [],
          duplicate_mapping: [],
          name_mismatch: [],
        };
      }

      const unmapped = (await client.query(
        `
          SELECT
            sd.samsara_driver_id,
            sd.local_driver_id::text AS local_driver_id,
            COALESCE(
              NULLIF(trim(sd.raw_payload->>'name'), ''),
              trim(concat_ws(' ', sd.raw_payload->>'firstName', sd.raw_payload->>'lastName')),
              md.first_name || ' ' || md.last_name,
              'Unknown Driver'
            ) AS driver_name,
            CASE
              WHEN sd.local_driver_id IS NULL THEN 'no_local_driver'
              WHEN md.id IS NULL THEN 'local_driver_missing'
              WHEN md.qbo_vendor_id IS NULL OR btrim(md.qbo_vendor_id) = '' THEN 'driver_missing_qbo_vendor_id'
              WHEN qv.id IS NULL THEN 'qbo_vendor_missing_or_cross_tenant'
              ELSE 'unknown'
            END AS reason
          FROM integrations.samsara_drivers sd
          LEFT JOIN mdata.drivers md
            ON md.id = sd.local_driver_id
            AND md.operating_company_id = $1::uuid
          LEFT JOIN mdata.qbo_vendors qv
            ON qv.operating_company_id = $1::uuid
            AND (qv.id::text = md.qbo_vendor_id OR qv.qbo_id = md.qbo_vendor_id)
          WHERE sd.operating_company_id = $1::uuid
            AND (
              sd.local_driver_id IS NULL
              OR md.id IS NULL
              OR md.qbo_vendor_id IS NULL
              OR btrim(md.qbo_vendor_id) = ''
              OR qv.id IS NULL
            )
          ORDER BY sd.last_seen_at DESC NULLS LAST
          LIMIT 200
        `,
        [parsed.data.operating_company_id],
      )) as { rows: UnmappedRow[] };

      const duplicate = (await client.query(
        `
          SELECT
            md.samsara_driver_id,
            count(DISTINCT md.qbo_vendor_id)::text AS vendor_count,
            array_agg(DISTINCT md.qbo_vendor_id) AS qbo_vendor_ids
          FROM mdata.drivers md
          JOIN integrations.samsara_drivers sd
            ON sd.operating_company_id = md.operating_company_id
            AND sd.samsara_driver_id = md.samsara_driver_id
          WHERE md.operating_company_id = $1::uuid
            AND md.samsara_driver_id IS NOT NULL
            AND md.qbo_vendor_id IS NOT NULL
            AND btrim(md.qbo_vendor_id) <> ''
          GROUP BY md.samsara_driver_id
          HAVING count(DISTINCT md.qbo_vendor_id) > 1
          ORDER BY count(DISTINCT md.qbo_vendor_id) DESC, md.samsara_driver_id ASC
          LIMIT 200
        `,
        [parsed.data.operating_company_id],
      )) as { rows: DuplicateRow[] };

      const mappedRows = (await client.query(
        `
          SELECT
            sd.samsara_driver_id,
            md.id::text AS driver_id,
            md.qbo_vendor_id,
            qv.display_name AS qbo_display_name,
            qv.company_name AS qbo_company_name,
            sd.raw_payload
          FROM integrations.samsara_drivers sd
          JOIN mdata.drivers md
            ON md.id = sd.local_driver_id
            AND md.operating_company_id = $1::uuid
          JOIN mdata.qbo_vendors qv
            ON qv.operating_company_id = $1::uuid
            AND (qv.id::text = md.qbo_vendor_id OR qv.qbo_id = md.qbo_vendor_id)
          WHERE sd.operating_company_id = $1::uuid
            AND md.qbo_vendor_id IS NOT NULL
            AND btrim(md.qbo_vendor_id) <> ''
          ORDER BY sd.last_seen_at DESC NULLS LAST
          LIMIT 1000
        `,
        [parsed.data.operating_company_id],
      )) as { rows: NameMismatchRow[] };

      const mismatch = mappedRows.rows
        .map((row: NameMismatchRow): MismatchView => {
          const samsaraName = readSamsaraName(row.raw_payload ?? {});
          const vendorName = String(row.qbo_display_name ?? row.qbo_company_name ?? "").trim();
          const score = tokenDice(samsaraName, vendorName);
          return {
            samsara_driver_id: row.samsara_driver_id,
            driver_id: row.driver_id,
            qbo_vendor_id: row.qbo_vendor_id,
            samsara_name: samsaraName,
            qbo_vendor_name: vendorName,
            similarity_score: Number(score.toFixed(3)),
          };
        })
        .filter((row: MismatchView) => row.similarity_score < 0.55)
        .sort((a: MismatchView, b: MismatchView) => a.similarity_score - b.similarity_score)
        .slice(0, 200);

      const majorDrift = mismatch.filter((row: MismatchView) => row.similarity_score < 0.35).length;
      const totalIssues = unmapped.rows.length + duplicate.rows.length + mismatch.length;
      const status =
        duplicate.rows.length > 0 || majorDrift > 0
          ? "red"
          : unmapped.rows.length > 0 || mismatch.length > 0
            ? "yellow"
            : "green";

      return {
        status,
        totals: {
          unmapped_drivers: unmapped.rows.length,
          duplicate_mapping: duplicate.rows.length,
          name_mismatch: mismatch.length,
          major_drift: majorDrift,
          total_issues: totalIssues,
        },
        unmapped_drivers: unmapped.rows,
        duplicate_mapping: duplicate.rows.map((row: DuplicateRow) => ({
          samsara_driver_id: row.samsara_driver_id,
          vendor_count: Number(row.vendor_count),
          qbo_vendor_ids: row.qbo_vendor_ids ?? [],
        })),
        name_mismatch: mismatch,
      };
    });

    return payload;
  });
}
