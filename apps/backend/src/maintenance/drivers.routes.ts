import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { createDriverCanonical } from "../mdata/drivers.routes.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
  include_voided: z.coerce.boolean().optional().default(false),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(50),
  email: z.string().email().optional(),
  cdl_number: z.string().trim().max(100).optional(),
  cdl_state: z.string().trim().max(50).optional(),
  status: z.enum(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]).default("Active"),
  notes: z.string().trim().max(2000).optional(),
});

const updateSchema = z
  .object({
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().email().nullable().optional(),
    cdl_number: z.string().trim().max(100).nullable().optional(),
    cdl_state: z.string().trim().max(50).nullable().optional(),
    status: z.enum(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const voidSchema = z.object({ void_reason: z.string().trim().min(3).max(240) });

type CsvDriverRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  status: "Active" | "Probation" | "Inactive" | "Terminated" | "OnLeave";
  notes: string | null;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.replace(/^\ufeff/, "").trim());
}

function parseDriversCsv(text: string): CsvDriverRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV requires header and at least one row");
  const headers = parseCsvLine(lines[0]);
  for (const key of ["first_name", "last_name", "phone"]) {
    if (!headers.includes(key)) throw new Error(`CSV missing required column: ${key}`);
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const get = (key: string) => row[headers.indexOf(key)] ?? "";
    const statusRaw = get("status") || "Active";
    const validStatuses = new Set(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]);
    if (!validStatuses.has(statusRaw)) throw new Error(`Invalid status "${statusRaw}" in CSV`);
    return {
      first_name: get("first_name"),
      last_name: get("last_name"),
      phone: get("phone"),
      email: get("email") || null,
      cdl_number: get("cdl_number") || null,
      cdl_state: get("cdl_state") || null,
      status: statusRaw as CsvDriverRow["status"],
      notes: get("notes") || null,
    };
  });
}

function isDriversCsvImportEnabled(): boolean {
  const flag = (process.env.DRIVERS_CSV_IMPORT_ENABLED ?? "").trim().toLowerCase();
  const explicitlyEnabled = flag === "1" || flag === "true" || flag === "yes";
  return process.env.NODE_ENV === "production" ? explicitlyEnabled : flag !== "0" && flag !== "false";
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

async function enqueueDriverPushIfProjected(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  driverId: string,
  operatingCompanyId: string,
  actorUserId: string
) {
  const row = await client.query(
    `SELECT samsara_driver_id FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [driverId, operatingCompanyId]
  );
  const samsaraDriverId = row.rows[0]?.samsara_driver_id ?? null;
  if (!samsaraDriverId) return false;
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "samsara.master_data.push_requested",
    JSON.stringify({
      entity: "driver",
      driver_id: driverId,
      samsara_driver_id: samsaraDriverId,
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
    }),
  ]);
  return true;
}

export async function registerMaintenanceDriversRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/drivers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      // This GET is also the canonical source for maintenance work-order driver pickers. Preserve
      // home-company master rows and active authorized shared drivers; mutation routes below remain
      // home-company scoped so roster visibility never expands edit/void authority.
      const filters = [`(
        d.operating_company_id = $1::uuid
        OR EXISTS (
          SELECT 1
          FROM mdata.driver_company_authorizations maintenance_roster_dca
          WHERE maintenance_roster_dca.driver_id = d.id
            AND maintenance_roster_dca.company_id = $1::uuid
            AND maintenance_roster_dca.is_authorized = true
            AND maintenance_roster_dca.deactivated_at IS NULL
        )
      )`];
      if (!query.data.include_voided) filters.push("d.deactivated_at IS NULL");
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        const idx = values.length;
        filters.push(`(d.first_name ILIKE $${idx} OR d.last_name ILIKE $${idx} OR COALESCE(d.cdl_number,'') ILIKE $${idx})`);
      }
      const sql = `
        SELECT
          d.id,
          d.first_name,
          d.last_name,
          d.phone,
          d.email,
          d.cdl_number,
          d.cdl_state,
          d.status,
          d.notes,
          d.deactivated_at AS voided_at,
          NULL::text AS voided_reason,
          d.samsara_driver_id,
          CASE
            WHEN d.deactivated_at IS NOT NULL THEN 'Voided'
            WHEN d.samsara_driver_id IS NOT NULL THEN 'Samsara'
            ELSE 'Manual'
          END AS source
        FROM mdata.drivers d
        WHERE ${filters.join(" AND ")}
        ORDER BY d.updated_at DESC, d.created_at DESC
      `;
      const result = await client.query(sql, values);
      return result.rows;
    });
    return { rows, csv_import_enabled: isDriversCsvImportEnabled() };
  });

  app.post("/api/v1/maintenance/drivers", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    // DRIVER-1: route the maintenance quick-add through the SINGLE canonical create path
    // (createDriverCanonical in mdata/drivers.routes.ts) instead of INSERTing into mdata.drivers directly.
    // This surface previously bypassed returning-driver detection, rehire-chain matching, identity-user
    // conflict handling, CDL-conflict handling, and the richer create audit. It now inherits all of them.
    // - assignCompanyId: bind the requested operating_company_id WITHOUT triggering the onboarding/invite
    //   flow (this surface never invites); the canonical fn validates it against user_accessible_company_ids().
    // - provisionSubAccounts:false: preserve this surface's historical non-financial behavior (no
    //   catalogs.accounts writes). Provisioning-on-maintenance-create is a separate financial-cluster follow-up.
    const input: Parameters<typeof createDriverCanonical>[1] = {
      first_name: body.data.first_name,
      last_name: body.data.last_name,
      phone: body.data.phone,
      email: body.data.email,
      cdl_number: body.data.cdl_number,
      cdl_state: body.data.cdl_state,
      status: body.data.status,
      notes: body.data.notes,
      // OUTBOUND CONSENT — stated explicitly rather than inherited from a default, because the
      // comment above already commits this surface to never inviting. A maintenance quick-add is a
      // record, not an onboarding: it must not message the person.
      send_invite: false,
      is_sample_data: false,
      create_login_user: false,
      override_returning_warning: false,
      is_rehire: false,
    };
    const result = await createDriverCanonical(
      { uuid: user.uuid, role: user.role },
      input,
      { assignCompanyId: companyId, provisionSubAccounts: false }
    );
    if (result.status !== 201) {
      return reply.code(result.status).send(result.body);
    }
    // Re-shape the canonical row into this surface's historical response contract (voided_at / voided_reason).
    const d = result.body as Record<string, unknown>;
    return reply.code(201).send({
      id: d.id,
      first_name: d.first_name,
      last_name: d.last_name,
      phone: d.phone,
      email: d.email,
      cdl_number: d.cdl_number,
      cdl_state: d.cdl_state,
      status: d.status,
      notes: d.notes,
      voided_at: (d.deactivated_at as string | null) ?? null,
      voided_reason: null,
      samsara_driver_id: (d.samsara_driver_id as string | null) ?? null,
    });
  });

  app.patch("/api/v1/maintenance/drivers/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const updated = await withCompany(user.uuid, companyId, async (client) => {
      // Cross-entity scope guard: bind operating_company_id (same as the GET at ~line 135) so an
      // Owner in one entity cannot read another entity's driver by id (mdata RLS is identity-scoped,
      // not entity-scoped, so an explicit predicate is required).
      const oldRes = await client.query(`SELECT * FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [params.data.id, companyId]);
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;
      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("first_name" in body.data) add("first_name", body.data.first_name ?? null);
      if ("last_name" in body.data) add("last_name", body.data.last_name ?? null);
      if ("phone" in body.data) add("phone", body.data.phone ?? null);
      if ("email" in body.data) add("email", body.data.email ? body.data.email.toLowerCase() : null);
      if ("cdl_number" in body.data) add("cdl_number", body.data.cdl_number ?? null);
      if ("cdl_state" in body.data) add("cdl_state", body.data.cdl_state ?? null);
      if ("status" in body.data) add("status", body.data.status);
      if ("notes" in body.data) add("notes", body.data.notes ?? null);
      add("updated_by_user_id", user.uuid);
      values.push(params.data.id);
      const idIdx = values.length;
      // Cross-entity scope guard: also match operating_company_id so the UPDATE cannot touch a driver
      // belonging to another entity even when the id is known.
      values.push(companyId);
      const companyIdx = values.length;
      const result = await client.query(`UPDATE mdata.drivers SET ${setParts.join(", ")} WHERE id = $${idIdx} AND operating_company_id = $${companyIdx}::uuid RETURNING *`, values);
      const newRow = result.rows[0];
      const pushed = await enqueueDriverPushIfProjected(client, params.data.id, companyId, user.uuid);
      await appendCrudAudit(client, user.uuid, "maintenance.drivers.updated", {
        operating_company_id: companyId,
        resource_id: params.data.id,
        projected_push_enqueued: pushed,
        changes: buildPatchChanges(
          body.data as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          newRow as Record<string, unknown>
        ),
      });
      return newRow;
    });
    if (!updated) return reply.code(404).send({ error: "maintenance_driver_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/drivers/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = voidSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const result = await withCompany(user.uuid, companyId, async (client) => {
      // Cross-entity scope guard: bind operating_company_id ($4) so an Owner cannot void a driver
      // belonging to another entity by id.
      const updated = await client.query(
        `UPDATE mdata.drivers SET deactivated_at = now(), notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END, '[VOID] ', $2), updated_by_user_id = $3 WHERE id = $1 AND operating_company_id = $4::uuid RETURNING id`,
        [params.data.id, body.data.void_reason, user.uuid, companyId]
      );
      if (!updated.rows[0]) return null;
      const pushed = await enqueueDriverPushIfProjected(client, params.data.id, companyId, user.uuid);
      await appendCrudAudit(client, user.uuid, "maintenance.drivers.voided", {
        operating_company_id: companyId,
        resource_id: params.data.id,
        void_reason: body.data.void_reason,
        projected_push_enqueued: pushed,
      });
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: "maintenance_driver_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/maintenance/drivers/import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isDriversCsvImportEnabled()) {
      return reply.code(403).send({ error: "drivers_csv_import_disabled" });
    }
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    let csvText = "";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        csvText = (await part.toBuffer()).toString("utf8");
        break;
      }
    }
    if (!csvText.trim()) return reply.code(400).send({ error: "file_required" });
    let rows: CsvDriverRow[] = [];
    try {
      rows = parseDriversCsv(csvText);
    } catch (error) {
      return reply.code(400).send({ error: "invalid_csv", message: (error as Error).message });
    }
    const summary = await withCompany(user.uuid, companyId, async (client) => {
      let inserted = 0;
      const errors: Array<{ row: number; message: string }> = [];
      await client.query("BEGIN");
      try {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          try {
            await client.query(
              `
                INSERT INTO mdata.drivers (
                  operating_company_id, first_name, last_name, phone, email, cdl_number, cdl_state, status, notes, created_by_user_id, updated_by_user_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
              `,
              [companyId, row.first_name, row.last_name, row.phone, row.email, row.cdl_number, row.cdl_state, row.status, row.notes, user.uuid]
            );
            inserted += 1;
          } catch (error) {
            errors.push({ row: i + 2, message: (error as Error).message });
          }
        }
        if (errors.length > 0) {
          await client.query("ROLLBACK");
        } else {
          await client.query("COMMIT");
          await appendCrudAudit(client, user.uuid, "maintenance.drivers.imported", {
            operating_company_id: companyId,
            imported_rows: inserted,
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return { inserted_rows: inserted, invalid_rows: errors.length, errors };
    });
    return summary;
  });
}
