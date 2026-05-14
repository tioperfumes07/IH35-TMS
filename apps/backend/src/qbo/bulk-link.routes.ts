import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canAccess(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

const mappingSchema = z.object({
  entity_id: z.string().uuid(),
  qbo_vendor_id: z.string().trim().min(1).max(120).nullable().optional(),
  qbo_class_id: z.string().trim().min(1).max(120).nullable().optional(),
});

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  type: z.enum(["drivers", "assets"]),
  mappings: z.array(mappingSchema).min(1).max(500),
});

export async function registerQboBulkLinkRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo/bulk-link", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const ignoreRaw = z.enum(["true", "false"]).safeParse(String((req.query as { ignore_errors?: string })?.ignore_errors ?? "false"));
    const ignoreErrors = ignoreRaw.success ? ignoreRaw.data === "true" : false;

    const errors: Array<{ entity_id: string; error_message: string }> = [];
    let applied = 0;

    const runBatch = async () => {
      await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);

        const applyAudit = async (payload: Record<string, unknown>) => {
          await appendCrudAudit(client, user.uuid, "qbo.entity_linked", payload, "info", "P6-T11196");
        };

        const maybeBegin = async () => {
          await client.query("BEGIN");
        };

        const finalizeOk = async () => {
          await client.query("COMMIT");
        };

        const finalizeBad = async () => {
          await client.query("ROLLBACK");
        };

        await maybeBegin();

        try {
          for (const map of parsed.data.mappings) {
            const vendorId = map.qbo_vendor_id ?? null;
            const classId = map.qbo_class_id ?? null;
            if (!vendorId && !classId) {
              throw new Error("mapping_requires_vendor_or_class");
            }

            try {
              if (parsed.data.type === "drivers") {
                const cur = await client.query<{
                  qbo_vendor_id: string | null;
                  qbo_class_id: string | null;
                }>(
                  `
                    SELECT qbo_vendor_id, qbo_class_id
                    FROM mdata.drivers
                    WHERE id = $1
                      AND operating_company_id = $2::uuid
                    LIMIT 1
                    FOR UPDATE
                  `,
                  [map.entity_id, parsed.data.operating_company_id]
                );
                if (!cur.rows[0]) throw new Error("entity_not_found");

                await client.query(
                  `
                    UPDATE mdata.drivers
                    SET
                      qbo_vendor_id = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE qbo_vendor_id END,
                      qbo_class_id = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE qbo_class_id END,
                      updated_at = now()
                    WHERE id = $1
                      AND operating_company_id = $2::uuid
                  `,
                  [map.entity_id, parsed.data.operating_company_id, vendorId, classId]
                );

                await applyAudit({
                  entity_type: "driver",
                  entity_id: map.entity_id,
                  qbo_vendor_id: vendorId,
                  qbo_class_id: classId,
                  source: "bulk_link",
                  operating_company_id: parsed.data.operating_company_id,
                });
                applied += 1;
              } else {
                const unitRes = await client.query<{ id: string }>(
                  `
                    UPDATE mdata.units
                    SET
                      qbo_vendor_id = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE qbo_vendor_id END,
                      qbo_class_id = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE qbo_class_id END,
                      updated_at = now()
                    WHERE id = $1
                      AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
                    RETURNING id
                  `,
                  [map.entity_id, parsed.data.operating_company_id, vendorId, classId]
                );

                if (unitRes.rows[0]?.id) {
                  await applyAudit({
                    entity_type: "unit",
                    entity_id: map.entity_id,
                    qbo_vendor_id: vendorId,
                    qbo_class_id: classId,
                    source: "bulk_link",
                    operating_company_id: parsed.data.operating_company_id,
                  });
                  applied += 1;
                  continue;
                }

                const equipRes = await client.query<{ id: string }>(
                  `
                    UPDATE mdata.equipment
                    SET
                      qbo_vendor_id = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE qbo_vendor_id END,
                      qbo_class_id = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE qbo_class_id END,
                      updated_at = now()
                    WHERE id = $1
                      AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
                    RETURNING id
                  `,
                  [map.entity_id, parsed.data.operating_company_id, vendorId, classId]
                );

                if (!equipRes.rows[0]?.id) throw new Error("entity_not_found");

                await applyAudit({
                  entity_type: "equipment",
                  entity_id: map.entity_id,
                  qbo_vendor_id: vendorId,
                  qbo_class_id: classId,
                  source: "bulk_link",
                  operating_company_id: parsed.data.operating_company_id,
                });
                applied += 1;
              }
            } catch (inner) {
              const message = String((inner as Error)?.message ?? "link_failed");
              if (!ignoreErrors) throw inner;
              errors.push({ entity_id: map.entity_id, error_message: message });
            }
          }

          await finalizeOk();
        } catch (error) {
          await finalizeBad();
          throw error;
        }
      });
    };

    try {
      await runBatch();
    } catch (error) {
      const message = String((error as Error)?.message ?? "bulk_link_failed");
      if (!ignoreErrors) {
        return reply.code(400).send({ error: message, applied: 0, failed: parsed.data.mappings.length, errors });
      }
    }

    return { applied, failed: errors.length, errors };
  });
}
