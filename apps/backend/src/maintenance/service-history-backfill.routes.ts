// ROUND 297.2 A-29 (Lead order, owner-approved, 2026-09-30): the owner backfill path. This is what
// he types into to record a REAL past service event on a unit — never a guessed baseline.
//
// Writes, in ONE transaction:
//   1. maintenance.work_orders row, status='complete', source_type='backfill'
//   2. telematics.odometer_readings row, source='manual', confidence='entered'
//   3. the matching (unit, pm_code) row in maintenance.pm_schedules gets its
//      last_service_odometer/next_due_odometer set — ONLY when pm_code identifies a real,
//      active schedule row for this unit. A bare task_ids[] backfill (no pm_code) records
//      history without touching any PM due date — there is nothing to declare "due" from an
//      ad hoc, non-catalog service.
//
// AP linkage: reuses the SAME poster a live work-order close uses
// (processMaintenanceWorkOrderClose, apps/backend/src/accounting/maintenance-posting/poster.service.ts)
// — called AFTER this route's own transaction commits (the poster opens its own connection and
// reads maintenance.work_orders fresh, so the row must already be visible). "Six reversal engines
// exist; a seventh must not be written" — this route creates no new bill-posting logic of its own.
//
// Idempotency: unique on (operating_company_id, unit_id, service_date, pm_code) is enforced at the
// application level via vmrs_system_code (pm_code) + work_completed_at (service_date) — a real
// unique DB constraint isn't possible without adding new columns; a real backfill is a low-
// concurrency, manual, single-owner action, so an application-level pre-check (inside the same
// transaction, so no TOCTOU window against ITSELF) is sufficient here.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { processMaintenanceWorkOrderClose } from "../accounting/maintenance-posting/poster.service.js";
import { withCompanyScope } from "../accounting/shared.js";
import { requireAuth } from "../auth/session-middleware.js";
import { generateWorkOrderNumber } from "../work-orders/wo-number.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function officeWoRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role);
}

const backfillBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid(),
    service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "service_date must be YYYY-MM-DD"),
    odometer_miles: z.number().int().nonnegative(),
    pm_code: z.string().trim().min(1).max(40).optional(),
    task_ids: z.array(z.string().uuid()).optional(),
    vendor_id: z.string().uuid().optional(),
    in_house: z.boolean().optional(),
    total_cost_cents: z.number().int().nonnegative().default(0),
    invoice_number: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((b) => Boolean(b.pm_code) || (b.task_ids && b.task_ids.length > 0), {
    message: "either pm_code or a non-empty task_ids[] is required",
  })
  .refine((b) => Boolean(b.vendor_id) || b.in_house === true, {
    message: "either vendor_id or in_house:true is required",
  })
  .refine((b) => !(b.vendor_id && b.in_house === true), {
    message: "vendor_id and in_house are mutually exclusive",
  });

export async function registerServiceHistoryBackfillRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/maintenance/service-history",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = authed(req, reply);
      if (!user) return;
      if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = backfillBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation_failed", errors: parsed.error.issues });
      const body = parsed.data;

      const result = await withCompanyScope(user.uuid, body.operating_company_id, async (rawClient) => {
        const client = rawClient as DbClient;
        const unitRes = await client.query<{ id: string }>(
          `SELECT id FROM mdata.units WHERE id = $1::uuid AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid) LIMIT 1`,
          [body.unit_id, body.operating_company_id]
        );
        if (unitRes.rows.length === 0) return { kind: "unit_not_found" as const };

        if (body.vendor_id) {
          const vendorRes = await client.query<{ id: string }>(
            `SELECT id FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
            [body.vendor_id, body.operating_company_id]
          );
          if (vendorRes.rows.length === 0) return { kind: "vendor_not_found" as const };
        }

        let schedule: { id: string; interval_kind: string; interval_value: number } | null = null;
        if (body.pm_code) {
          const scheduleRes = await client.query<{ id: string; interval_kind: string; interval_value: number }>(
            `SELECT id, interval_kind, interval_value
               FROM maintenance.pm_schedules
              WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid AND label = $3 AND is_active = true
              LIMIT 1`,
            [body.operating_company_id, body.unit_id, body.pm_code]
          );
          if (scheduleRes.rows.length === 0) return { kind: "pm_schedule_not_found" as const, pm_code: body.pm_code };
          schedule = scheduleRes.rows[0];
        }

        // Idempotency, inside this same transaction: refuse a duplicate (unit, service_date, pm_code)
        // backfill rather than silently minting a second work order for the same real event.
        const dupe = await client.query<{ id: string }>(
          `SELECT id FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
              AND unit_id = $2::uuid
              AND source_type = 'backfill'
              AND work_completed_at::date = $3::date
              AND COALESCE(vmrs_system_code, '') = COALESCE($4, '')
              AND voided_at IS NULL
            LIMIT 1`,
          [body.operating_company_id, body.unit_id, body.service_date, body.pm_code ?? null]
        );
        if (dupe.rows.length > 0) {
          return { kind: "duplicate" as const, existing_work_order_id: dupe.rows[0].id };
        }

        await client.query("BEGIN");
        try {
          const displayId = await generateWorkOrderNumber(rawClient, { operatingCompanyId: body.operating_company_id });
          const bucket = body.vendor_id ? "external" : "in_house";
          const description = body.pm_code
            ? `Backfilled service — ${body.pm_code}`
            : `Backfilled service — ${(body.task_ids ?? []).length} task(s)`;

          const woRes = await client.query<{ id: string }>(
            `
              INSERT INTO maintenance.work_orders (
                operating_company_id, wo_type, source_type, status, unit_id,
                opened_at, work_started_at, work_completed_at, closed_at, completed_by_user_id,
                display_id, unit_sequence, description, bucket,
                wo_billing_type, wo_service_class, vendor_id,
                total_actual_cost, actual_cost_cents,
                external_vendor_invoice_number, vmrs_system_code, notes_internal
              ) VALUES (
                $1, 'PM', 'backfill', 'complete', $2,
                $3::date, $3::date, $3::date, $3::date, $4,
                $5, 0, $6, $7,
                $8, 'pm', $9,
                $10, $11,
                $12, $13, $14
              )
              RETURNING id
            `,
            [
              body.operating_company_id,
              body.unit_id,
              body.service_date,
              user.uuid,
              displayId,
              description,
              bucket,
              body.vendor_id ? "external" : "internal",
              body.vendor_id ?? null,
              body.total_cost_cents / 100,
              body.total_cost_cents,
              body.invoice_number ?? null,
              body.pm_code ?? null,
              body.notes ?? null,
            ]
          );
          const workOrderId = woRes.rows[0].id;

          await client.query(
            `
              INSERT INTO maintenance.work_order_lines
                (uuid, work_order_uuid, line_type, description, total_cost, section, created_at)
              VALUES (gen_random_uuid(), $1::uuid, 'labor', $2, $3, 'A', now())
            `,
            [workOrderId, description, body.total_cost_cents / 100]
          );

          const odoRes = await client.query<{ id: string }>(
            `
              INSERT INTO telematics.odometer_readings
                (id, operating_company_id, unit_id, read_at, odometer_miles, source, recorded_by_user_id, confidence, created_at, updated_at)
              VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::date, $4, 'manual', $5, 'entered', now(), now())
              RETURNING id
            `,
            [body.operating_company_id, body.unit_id, body.service_date, body.odometer_miles, user.uuid]
          );

          let pmScheduleUpdated = false;
          if (schedule) {
            // next_due_odometer is only meaningful for a MILES interval — a days/hours interval has
            // no mileage-based due date in this schema, and this route never invents one.
            const nextDue = schedule.interval_kind === "miles" ? body.odometer_miles + schedule.interval_value : null;
            await client.query(
              `UPDATE maintenance.pm_schedules SET last_service_odometer = $1, next_due_odometer = $2 WHERE id = $3::uuid`,
              [body.odometer_miles, nextDue, schedule.id]
            );
            pmScheduleUpdated = true;
          }

          await appendCrudAudit(
            client,
            user.uuid,
            "maintenance.service_history.backfilled",
            { resource_id: workOrderId, entity_type: "work_order", entity_id: workOrderId, display_id: displayId },
            "info",
            "ROUND-297.2-A29"
          );
          await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
            "work_order.completed",
            JSON.stringify({ work_order_id: workOrderId, source_type: "backfill" }),
          ]);

          await client.query("COMMIT");
          return {
            kind: "ok" as const,
            work_order_id: workOrderId,
            odometer_reading_id: odoRes.rows[0].id,
            pm_schedule_updated: pmScheduleUpdated,
          };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });

      if (result.kind === "unit_not_found") return reply.code(404).send({ error: "unit_not_found" });
      if (result.kind === "vendor_not_found") return reply.code(404).send({ error: "vendor_not_found" });
      if (result.kind === "pm_schedule_not_found")
        return reply.code(422).send({ error: "pm_schedule_not_found", pm_code: result.pm_code });
      if (result.kind === "duplicate")
        return reply.code(409).send({ error: "duplicate_backfill", existing_work_order_id: result.existing_work_order_id });

      // AP linkage, reusing the same poster a live work-order close calls — after commit, since it
      // reads maintenance.work_orders on its own connection.
      let bill_id: string | null = null;
      if (body.total_cost_cents > 0 && body.vendor_id) {
        const posting = await processMaintenanceWorkOrderClose({
          operating_company_id: body.operating_company_id,
          work_order_id: result.work_order_id,
          actor_user_id: user.uuid,
        });
        bill_id = posting.bill_id;
      }

      return reply.code(201).send({
        work_order_id: result.work_order_id,
        odometer_reading_id: result.odometer_reading_id,
        pm_schedule_updated: result.pm_schedule_updated,
        bill_id,
      });
    }
  );
}
