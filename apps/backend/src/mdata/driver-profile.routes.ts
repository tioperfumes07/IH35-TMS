import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const qualificationIdParamSchema = z.object({ id: z.string().uuid(), qual_id: z.string().uuid() });
const qualificationRateHistoryParamSchema = z.object({ id: z.string().uuid(), qual_id: z.string().uuid() });
const companyAuthorizationIdParamSchema = z.object({ id: z.string().uuid(), auth_id: z.string().uuid() });
const listQualificationsQuerySchema = z.object({
  include_inactive: z.enum(["true", "false"]).optional(),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const payRateChangeReasonSchema = z.enum([
  "initial_hire",
  "raise",
  "demotion",
  "contract_renegotiation",
  "annual_adjustment",
  "promotion",
  "correction",
  "other",
]);

const createQualificationSchema = z.object({
  equipment_type_id: z.string().uuid(),
  qualified_at: isoDateSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  initial_rates: z
    .array(
      z.object({
        line_item_template_id: z.string().uuid(),
        amount: z.number().min(0),
        change_reason: payRateChangeReasonSchema.optional(),
        change_notes: z.string().trim().max(2000).optional(),
      })
    )
    .optional(),
});

const updateQualificationSchema = z
  .object({
    is_active: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const changeRateSchema = z.object({
  line_item_template_id: z.string().uuid(),
  amount: z.number().min(0),
  effective_from: isoDateSchema.optional(),
  change_reason: payRateChangeReasonSchema,
  change_notes: z.string().trim().max(2000).optional(),
});

const createCompanyAuthorizationSchema = z.object({
  company_id: z.string().uuid(),
  is_authorized: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional(),
});

const updateCompanyAuthorizationSchema = z
  .object({
    is_authorized: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canManageDriverRates(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function canManageCompanyAuth(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Safety";
}

export async function registerDriverProfileRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/qualifications", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = idParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const parsedQuery = listQualificationsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const includeInactive = parsedQuery.data.include_inactive === "true";
      const qualificationsRes = await client.query(
        `
          SELECT
            dq.id,
            dq.driver_id,
            dq.equipment_type_id,
            dq.is_active,
            dq.qualified_at,
            dq.notes,
            dq.deactivated_at,
            et.code AS equipment_type_code,
            et.name AS equipment_type_name
          FROM mdata.driver_equipment_qualifications dq
          JOIN catalogs.equipment_types et ON et.id = dq.equipment_type_id
          WHERE dq.driver_id = $1
            ${includeInactive ? "" : "AND dq.deactivated_at IS NULL"}
          ORDER BY dq.qualified_at DESC, et.sort_order, et.name
        `,
        [parsed.data.id]
      );

      const qualificationIds = qualificationsRes.rows.map((row) => String(row.id));
      const lineItemsRes =
        qualificationIds.length === 0
          ? { rows: [] as Array<Record<string, unknown>> }
          : await client.query(
              `
                SELECT
                  dq.id AS qualification_id,
                  lit.id AS line_item_template_id,
                  lit.code AS line_item_code,
                  lit.name AS line_item_name,
                  lit.unit AS line_item_unit,
                  r.amount,
                  r.effective_from,
                  r.change_reason
                FROM mdata.driver_equipment_qualifications dq
                JOIN catalogs.equipment_line_item_templates lit
                  ON lit.equipment_type_id = dq.equipment_type_id
                 AND lit.deactivated_at IS NULL
                 AND lit.is_active = true
                LEFT JOIN mdata.driver_pay_rates r
                  ON r.driver_qualification_id = dq.id
                 AND r.line_item_template_id = lit.id
                 AND r.effective_to IS NULL
                 AND r.deactivated_at IS NULL
                WHERE dq.id = ANY($1::uuid[])
                ORDER BY dq.id, lit.sort_order, lit.name
              `,
              [qualificationIds]
            );

      const byQualification = new Map<string, Array<Record<string, unknown>>>();
      for (const row of lineItemsRes.rows) {
        const qualificationId = String(row.qualification_id);
        const list = byQualification.get(qualificationId) ?? [];
        list.push({
          line_item_template_id: row.line_item_template_id,
          line_item_code: row.line_item_code,
          line_item_name: row.line_item_name,
          line_item_unit: row.line_item_unit,
          amount: row.amount,
          effective_from: row.effective_from,
          change_reason: row.change_reason,
        });
        byQualification.set(qualificationId, list);
      }

      return {
        qualifications: qualificationsRes.rows.map((row) => ({
          id: row.id,
          equipment_type_id: row.equipment_type_id,
          equipment_type: {
            code: row.equipment_type_code,
            name: row.equipment_type_name,
          },
          is_active: row.is_active,
          qualified_at: row.qualified_at,
          notes: row.notes,
          deactivated_at: row.deactivated_at,
          current_rates: byQualification.get(String(row.id)) ?? [],
        })),
      };
    });
  });

  app.post<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/qualifications", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageDriverRates(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createQualificationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      return await withCurrentUser(authUser.uuid, async (client) => {
        const driverRes = await client.query(`SELECT id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
        if (driverRes.rows.length === 0) return reply.code(404).send({ error: "mdata_driver_not_found" });

        const equipmentTypeRes = await client.query(`SELECT id, code, name FROM catalogs.equipment_types WHERE id = $1 LIMIT 1`, [
          parsedBody.data.equipment_type_id,
        ]);
        if (equipmentTypeRes.rows.length === 0) return reply.code(400).send({ error: "equipment_type_not_found" });

        const qualRes = await client.query(
          `
            INSERT INTO mdata.driver_equipment_qualifications (
              driver_id, equipment_type_id, is_active, qualified_at, notes, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, true, $3, $4, $5, $5)
            RETURNING id, driver_id, equipment_type_id, is_active, qualified_at, notes
          `,
          [
            parsedParams.data.id,
            parsedBody.data.equipment_type_id,
            parsedBody.data.qualified_at ?? new Date().toISOString().slice(0, 10),
            parsedBody.data.notes ?? null,
            authUser.uuid,
          ]
        );
        const qualification = qualRes.rows[0];

        const initialRates = parsedBody.data.initial_rates ?? [];
        const createdRates: Array<Record<string, unknown>> = [];
        if (initialRates.length > 0) {
          const validTemplateRes = await client.query(
            `
              SELECT id
              FROM catalogs.equipment_line_item_templates
              WHERE equipment_type_id = $1
                AND id = ANY($2::uuid[])
                AND deactivated_at IS NULL
            `,
            [
              parsedBody.data.equipment_type_id,
              initialRates.map((rate) => rate.line_item_template_id),
            ]
          );
          const validTemplateIds = new Set(validTemplateRes.rows.map((row) => String(row.id)));
          for (const rate of initialRates) {
            if (!validTemplateIds.has(rate.line_item_template_id)) {
              return reply.code(400).send({ error: "line_item_template_not_in_equipment_type" });
            }
            const rateRes = await client.query(
              `
                INSERT INTO mdata.driver_pay_rates (
                  driver_qualification_id, line_item_template_id, amount, effective_from, change_reason, change_notes, created_by_user_id, updated_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
                RETURNING id, line_item_template_id, amount, effective_from, effective_to, change_reason, change_notes
              `,
              [
                qualification.id,
                rate.line_item_template_id,
                rate.amount,
                parsedBody.data.qualified_at ?? new Date().toISOString().slice(0, 10),
                rate.change_reason ?? "initial_hire",
                rate.change_notes ?? "Initial agreed rate at qualification creation",
                authUser.uuid,
              ]
            );
            createdRates.push(rateRes.rows[0]);
            await appendCrudAudit(
              client,
              authUser.uuid,
              "mdata.driver_pay_rates.created",
              {
                resource_id: rateRes.rows[0].id,
                resource_type: "mdata.driver_pay_rates",
                driver_qualification_id: qualification.id,
                line_item_template_id: rate.line_item_template_id,
                amount: rate.amount,
              },
              "info",
              "BT-1-DRIVER-PROFILE-EXPANSION"
            );
          }
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.driver_equipment_qualifications.created",
          {
            resource_id: qualification.id,
            resource_type: "mdata.driver_equipment_qualifications",
            driver_id: qualification.driver_id,
            equipment_type_id: qualification.equipment_type_id,
            initial_rate_count: createdRates.length,
          },
          "info",
          "BT-1-DRIVER-PROFILE-EXPANSION"
        );

        const currentRatesRes = await client.query(
          `
            SELECT
              lit.id AS line_item_template_id,
              lit.code AS line_item_code,
              lit.name AS line_item_name,
              lit.unit AS line_item_unit,
              r.amount,
              r.effective_from,
              r.change_reason
            FROM catalogs.equipment_line_item_templates lit
            LEFT JOIN mdata.driver_pay_rates r
              ON r.line_item_template_id = lit.id
             AND r.driver_qualification_id = $1
             AND r.effective_to IS NULL
             AND r.deactivated_at IS NULL
            WHERE lit.equipment_type_id = $2
              AND lit.deactivated_at IS NULL
              AND lit.is_active = true
            ORDER BY lit.sort_order, lit.name
          `,
          [qualification.id, qualification.equipment_type_id]
        );

        return reply.code(201).send({
          qualification: {
            id: qualification.id,
            equipment_type_id: qualification.equipment_type_id,
            equipment_type: {
              code: equipmentTypeRes.rows[0].code,
              name: equipmentTypeRes.rows[0].name,
            },
            is_active: qualification.is_active,
            qualified_at: qualification.qualified_at,
            notes: qualification.notes,
            current_rates: currentRatesRes.rows,
          },
        });
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "driver_qualification_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_qualification_reference" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string; qual_id: string } }>("/api/v1/mdata/drivers/:id/qualifications/:qual_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageDriverRates(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = qualificationIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateQualificationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(parsedBody.data)) {
        if (value !== undefined) {
          values.push(value);
          fields.push(`${key} = $${values.length}`);
        }
      }
      fields.push("updated_at = now()");
      values.push(authUser.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);
      values.push(parsedParams.data.qual_id);
      const res = await client.query(
        `
          UPDATE mdata.driver_equipment_qualifications
          SET ${fields.join(", ")}
          WHERE driver_id = $${values.length - 1}
            AND id = $${values.length}
            AND deactivated_at IS NULL
          RETURNING id, driver_id, equipment_type_id, is_active, qualified_at, notes
        `,
        values
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "driver_qualification_not_found" });

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_equipment_qualifications.updated",
        {
          resource_id: parsedParams.data.qual_id,
          resource_type: "mdata.driver_equipment_qualifications",
          changes: parsedBody.data,
        },
        "info",
        "BT-1-DRIVER-PROFILE-EXPANSION"
      );
      return { qualification: res.rows[0] };
    });
  });

  app.get<{ Params: { id: string; qual_id: string } }>(
    "/api/v1/mdata/drivers/:id/qualifications/:qual_id/rate-history",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      const parsedParams = qualificationRateHistoryParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const qualificationRes = await client.query(
          `
            SELECT id, equipment_type_id
            FROM mdata.driver_equipment_qualifications
            WHERE id = $1
              AND driver_id = $2
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [parsedParams.data.qual_id, parsedParams.data.id]
        );
        if (qualificationRes.rows.length === 0) return reply.code(404).send({ error: "driver_qualification_not_found" });

        const lineItemsRes = await client.query(
          `
            SELECT
              lit.id AS line_item_template_id,
              lit.code AS line_item_code,
              lit.name AS line_item_name
            FROM catalogs.equipment_line_item_templates lit
            WHERE lit.equipment_type_id = $1
              AND lit.deactivated_at IS NULL
            ORDER BY lit.sort_order, lit.name
          `,
          [qualificationRes.rows[0].equipment_type_id]
        );

        const historyRes = await client.query(
          `
            SELECT
              r.line_item_template_id,
              r.amount,
              r.effective_from,
              r.effective_to,
              r.change_reason,
              r.change_notes,
              r.created_at,
              r.created_by_user_id,
              u.email AS created_by_user_email,
              (r.deactivated_at IS NOT NULL) AS was_corrected,
              r.deactivated_at
            FROM mdata.driver_pay_rates r
            LEFT JOIN identity.users u ON u.id = r.created_by_user_id
            WHERE r.driver_qualification_id = $1
            ORDER BY r.line_item_template_id, r.effective_from DESC, r.created_at DESC
          `,
          [parsedParams.data.qual_id]
        );

        const historyByLineItem = new Map<string, Array<Record<string, unknown>>>();
        for (const row of historyRes.rows) {
          const lineItemId = String(row.line_item_template_id);
          const list = historyByLineItem.get(lineItemId) ?? [];
          list.push({
            amount: row.amount,
            effective_from: row.effective_from,
            effective_to: row.effective_to,
            change_reason: row.change_reason,
            change_notes: row.change_notes,
            created_at: row.created_at,
            created_by_user_id: row.created_by_user_id,
            created_by_user_email: row.created_by_user_email,
            was_corrected: row.was_corrected,
            deactivated_at: row.deactivated_at,
          });
          historyByLineItem.set(lineItemId, list);
        }

        return {
          line_items: lineItemsRes.rows.map((lineItem) => ({
            line_item_template_id: lineItem.line_item_template_id,
            line_item_code: lineItem.line_item_code,
            line_item_name: lineItem.line_item_name,
            history: historyByLineItem.get(String(lineItem.line_item_template_id)) ?? [],
          })),
        };
      });
    }
  );

  app.post<{ Params: { id: string; qual_id: string } }>(
    "/api/v1/mdata/drivers/:id/qualifications/:qual_id/rates/change",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageDriverRates(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = qualificationIdParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedBody = changeRateSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const qualificationRes = await client.query(
          `
            SELECT id, equipment_type_id
            FROM mdata.driver_equipment_qualifications
            WHERE id = $1
              AND driver_id = $2
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [parsedParams.data.qual_id, parsedParams.data.id]
        );
        if (qualificationRes.rows.length === 0) return reply.code(404).send({ error: "driver_qualification_not_found" });

        const templateRes = await client.query(
          `
            SELECT id
            FROM catalogs.equipment_line_item_templates
            WHERE id = $1
              AND equipment_type_id = $2
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [parsedBody.data.line_item_template_id, qualificationRes.rows[0].equipment_type_id]
        );
        if (templateRes.rows.length === 0) {
          return reply.code(400).send({ error: "line_item_template_not_in_equipment_type" });
        }

        const effectiveFrom = parsedBody.data.effective_from ?? new Date().toISOString().slice(0, 10);
        const currentRes = await client.query(
          `
            SELECT id, amount, effective_from
            FROM mdata.driver_pay_rates
            WHERE driver_qualification_id = $1
              AND line_item_template_id = $2
              AND effective_to IS NULL
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [parsedParams.data.qual_id, parsedBody.data.line_item_template_id]
        );
        const previousRateId = currentRes.rows[0]?.id ? String(currentRes.rows[0].id) : null;
        const previousAmount = currentRes.rows[0]?.amount ?? null;
        const previousEffectiveFromRaw = currentRes.rows[0]?.effective_from;
        const previousEffectiveFrom =
          previousEffectiveFromRaw instanceof Date
            ? previousEffectiveFromRaw.toISOString().slice(0, 10)
            : previousEffectiveFromRaw
              ? String(previousEffectiveFromRaw).slice(0, 10)
              : null;
        const sameDayCorrection = Boolean(previousEffectiveFrom && previousEffectiveFrom === effectiveFrom);

        if (previousRateId) {
          if (sameDayCorrection) {
            await client.query(
              `
                UPDATE mdata.driver_pay_rates
                SET deactivated_at = now(), updated_by_user_id = $2
                WHERE id = $1
              `,
              [previousRateId, authUser.uuid]
            );
          } else {
            await client.query(
              `
                UPDATE mdata.driver_pay_rates
                SET effective_to = ($1::date - interval '1 day')::date, updated_by_user_id = $3
                WHERE id = $2
              `,
              [effectiveFrom, previousRateId, authUser.uuid]
            );
          }
        }

        const newRateRes = await client.query(
          `
            INSERT INTO mdata.driver_pay_rates (
              driver_qualification_id, line_item_template_id, amount, effective_from, change_reason, change_notes, previous_rate_id, created_by_user_id, updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            RETURNING id, driver_qualification_id, line_item_template_id, amount, effective_from, effective_to, change_reason, change_notes, previous_rate_id
          `,
          [
            parsedParams.data.qual_id,
            parsedBody.data.line_item_template_id,
            parsedBody.data.amount,
            effectiveFrom,
            parsedBody.data.change_reason,
            parsedBody.data.change_notes ?? null,
            previousRateId,
            authUser.uuid,
          ]
        );
        const newRate = newRateRes.rows[0];

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.driver_pay_rates.changed",
          {
            resource_id: newRate.id,
            resource_type: "mdata.driver_pay_rates",
            driver_qualification_id: parsedParams.data.qual_id,
            line_item_template_id: parsedBody.data.line_item_template_id,
            from_amount: previousAmount,
            to_amount: parsedBody.data.amount,
            change_reason: parsedBody.data.change_reason,
            same_day_correction: sameDayCorrection,
          },
          "info",
          "BT-1-DRIVER-PROFILE-EXPANSION"
        );

        return { rate: newRate };
      });
    }
  );

  app.delete<{ Params: { id: string; qual_id: string } }>("/api/v1/mdata/drivers/:id/qualifications/:qual_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageDriverRates(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = qualificationIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.driver_equipment_qualifications
          SET is_active = false, deactivated_at = now(), updated_at = now(), updated_by_user_id = $3
          WHERE id = $1
            AND driver_id = $2
            AND deactivated_at IS NULL
          RETURNING id
        `,
        [parsedParams.data.qual_id, parsedParams.data.id, authUser.uuid]
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "driver_qualification_not_found" });

      const today = new Date().toISOString().slice(0, 10);
      await client.query(
        `
          UPDATE mdata.driver_pay_rates
          SET effective_to = $2::date, updated_by_user_id = $3
          WHERE driver_qualification_id = $1
            AND effective_to IS NULL
            AND deactivated_at IS NULL
        `,
        [parsedParams.data.qual_id, today, authUser.uuid]
      );

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_equipment_qualifications.deactivated",
        {
          resource_id: parsedParams.data.qual_id,
          resource_type: "mdata.driver_equipment_qualifications",
          driver_id: parsedParams.data.id,
        },
        "info",
        "BT-1-DRIVER-PROFILE-EXPANSION"
      );

      return { ok: true };
    });
  });

  app.post<{ Params: { id: string; qual_id: string } }>(
    "/api/v1/mdata/drivers/:id/qualifications/:qual_id/reactivate",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageDriverRates(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = qualificationIdParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const qualificationRes = await client.query(
          `
            SELECT id, driver_id, equipment_type_id, is_active, qualified_at, notes, deactivated_at
            FROM mdata.driver_equipment_qualifications
            WHERE id = $1
              AND driver_id = $2
            LIMIT 1
          `,
          [parsedParams.data.qual_id, parsedParams.data.id]
        );
        if (qualificationRes.rows.length === 0) return reply.code(404).send({ error: "driver_qualification_not_found" });
        const qualification = qualificationRes.rows[0];
        if (qualification.is_active === true && qualification.deactivated_at === null) {
          return reply.code(400).send({ error: "qualification_already_active" });
        }

        await client.query(
          `
            UPDATE mdata.driver_equipment_qualifications
            SET is_active = true,
                deactivated_at = NULL,
                updated_at = now(),
                updated_by_user_id = $2
            WHERE id = $1
          `,
          [parsedParams.data.qual_id, authUser.uuid]
        );

        const priorRatesRes = await client.query(
          `
            SELECT DISTINCT ON (r.line_item_template_id)
              r.id,
              r.line_item_template_id,
              r.amount,
              r.effective_to,
              r.deactivated_at
            FROM mdata.driver_pay_rates r
            WHERE r.driver_qualification_id = $1
            ORDER BY r.line_item_template_id, r.effective_from DESC, r.created_at DESC
          `,
          [parsedParams.data.qual_id]
        );

        const ratesRestored: Array<{ line_item_template_id: string; amount: string; action: "reopened" | "reactivated" }> = [];
        for (const rate of priorRatesRes.rows) {
          if (rate.deactivated_at !== null) {
            await client.query(
              `
                UPDATE mdata.driver_pay_rates
                SET deactivated_at = NULL,
                    effective_to = NULL,
                    updated_at = now(),
                    updated_by_user_id = $2
                WHERE id = $1
              `,
              [rate.id, authUser.uuid]
            );
            ratesRestored.push({
              line_item_template_id: String(rate.line_item_template_id),
              amount: String(rate.amount),
              action: "reactivated",
            });
            continue;
          }
          if (rate.effective_to !== null) {
            await client.query(
              `
                UPDATE mdata.driver_pay_rates
                SET effective_to = NULL,
                    updated_at = now(),
                    updated_by_user_id = $2
                WHERE id = $1
              `,
              [rate.id, authUser.uuid]
            );
            ratesRestored.push({
              line_item_template_id: String(rate.line_item_template_id),
              amount: String(rate.amount),
              action: "reopened",
            });
          }
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.driver_equipment_qualifications.reactivated",
          {
            resource_id: parsedParams.data.qual_id,
            resource_type: "mdata.driver_equipment_qualifications",
            driver_id: parsedParams.data.id,
            equipment_type_id: qualification.equipment_type_id,
            rates_restored: ratesRestored,
          },
          "info",
          "BT-1-QUALIFICATION-REACTIVATION"
        );

        const equipmentTypeRes = await client.query(
          `
            SELECT code, name
            FROM catalogs.equipment_types
            WHERE id = $1
            LIMIT 1
          `,
          [qualification.equipment_type_id]
        );

        const currentRatesRes = await client.query(
          `
            SELECT
              lit.id AS line_item_template_id,
              lit.code AS line_item_code,
              lit.name AS line_item_name,
              lit.unit AS line_item_unit,
              r.amount,
              r.effective_from,
              r.change_reason
            FROM catalogs.equipment_line_item_templates lit
            LEFT JOIN mdata.driver_pay_rates r
              ON r.line_item_template_id = lit.id
             AND r.driver_qualification_id = $1
             AND r.effective_to IS NULL
             AND r.deactivated_at IS NULL
            WHERE lit.equipment_type_id = $2
              AND lit.deactivated_at IS NULL
              AND lit.is_active = true
            ORDER BY lit.sort_order, lit.name
          `,
          [parsedParams.data.qual_id, qualification.equipment_type_id]
        );

        return {
          qualification: {
            id: parsedParams.data.qual_id,
            equipment_type_id: qualification.equipment_type_id,
            equipment_type: {
              code: equipmentTypeRes.rows[0]?.code ?? "",
              name: equipmentTypeRes.rows[0]?.name ?? "",
            },
            is_active: true,
            qualified_at: qualification.qualified_at,
            notes: qualification.notes,
            deactivated_at: null,
            current_rates: currentRatesRes.rows,
            rates_restored: ratesRestored,
          },
        };
      });
    }
  );

  app.get<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/company-authorizations", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = idParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            dca.id,
            dca.driver_id,
            dca.company_id,
            dca.is_authorized,
            dca.authorized_at,
            dca.authorized_by_user_id,
            dca.notes,
            c.code AS company_code,
            c.legal_name AS company_name,
            c.short_name AS company_short_name,
            u.email AS authorized_by_user_email
          FROM mdata.driver_company_authorizations dca
          JOIN org.companies c ON c.id = dca.company_id
          LEFT JOIN identity.users u ON u.id = dca.authorized_by_user_id
          WHERE dca.driver_id = $1
            AND dca.deactivated_at IS NULL
          ORDER BY c.legal_name
        `,
        [parsed.data.id]
      );
      return {
        authorizations: res.rows.map((row) => ({
          id: row.id,
          company_id: row.company_id,
          company: {
            code: row.company_code,
            name: row.company_name,
            short_name: row.company_short_name,
          },
          is_authorized: row.is_authorized,
          authorized_at: row.authorized_at,
          authorized_by_user_id: row.authorized_by_user_id,
          authorized_by_user_email: row.authorized_by_user_email,
          notes: row.notes,
        })),
      };
    });
  });

  app.post<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/company-authorizations", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageCompanyAuth(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createCompanyAuthorizationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query(`SELECT id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
      if (driverRes.rows.length === 0) return reply.code(404).send({ error: "mdata_driver_not_found" });

      const upsertRes = await client.query(
        `
          INSERT INTO mdata.driver_company_authorizations (
            driver_id, company_id, is_authorized, authorized_at, authorized_by_user_id, notes, updated_at
          ) VALUES ($1, $2, $3, now(), $4, $5, now())
          ON CONFLICT (driver_id, company_id)
          DO UPDATE SET
            is_authorized = EXCLUDED.is_authorized,
            authorized_at = now(),
            authorized_by_user_id = EXCLUDED.authorized_by_user_id,
            notes = EXCLUDED.notes,
            deactivated_at = NULL,
            updated_at = now()
          RETURNING id, company_id, is_authorized, authorized_at, authorized_by_user_id, notes
        `,
        [parsedParams.data.id, parsedBody.data.company_id, parsedBody.data.is_authorized, authUser.uuid, parsedBody.data.notes ?? null]
      );
      const row = upsertRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        row.is_authorized ? "mdata.driver_company_authorizations.granted" : "mdata.driver_company_authorizations.revoked",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_company_authorizations",
          driver_id: parsedParams.data.id,
          company_id: row.company_id,
          is_authorized: row.is_authorized,
        },
        "info",
        "BT-1-DRIVER-PROFILE-EXPANSION"
      );

      return reply.code(201).send({ authorization: row });
    });
  });

  app.patch<{ Params: { id: string; auth_id: string } }>(
    "/api/v1/mdata/drivers/:id/company-authorizations/:auth_id",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageCompanyAuth(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = companyAuthorizationIdParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedBody = updateCompanyAuthorizationSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [key, value] of Object.entries(parsedBody.data)) {
          if (value !== undefined) {
            values.push(value);
            fields.push(`${key} = $${values.length}`);
          }
        }
        fields.push("authorized_at = now()");
        values.push(authUser.uuid);
        fields.push(`authorized_by_user_id = $${values.length}`);
        fields.push("updated_at = now()");
        values.push(parsedParams.data.id);
        values.push(parsedParams.data.auth_id);

        const res = await client.query(
          `
            UPDATE mdata.driver_company_authorizations
            SET ${fields.join(", ")}
            WHERE driver_id = $${values.length - 1}
              AND id = $${values.length}
              AND deactivated_at IS NULL
            RETURNING id, company_id, is_authorized, authorized_at, authorized_by_user_id, notes
          `,
          values
        );
        if (res.rows.length === 0) return reply.code(404).send({ error: "driver_company_authorization_not_found" });
        const row = res.rows[0];

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.driver_company_authorizations.updated",
          {
            resource_id: row.id,
            resource_type: "mdata.driver_company_authorizations",
            driver_id: parsedParams.data.id,
            company_id: row.company_id,
            changes: parsedBody.data,
          },
          "info",
          "BT-1-DRIVER-PROFILE-EXPANSION"
        );
        return { authorization: row };
      });
    }
  );
}
