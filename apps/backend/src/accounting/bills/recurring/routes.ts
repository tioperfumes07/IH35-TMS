import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../../../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../../shared.js";
import {
  createTemplate,
  deactivateTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "./template.service.js";
import { generateFromTemplate } from "./generator.service.js";
import { DateTime } from "luxon";

const templateBodySchema = z.object({
  // FE (RecurringBillCreate.tsx) sends operating_company_id in the JSON body, not the query string.
  operating_company_id: z.string().uuid(),
  vendor_uuid: z.string().uuid(),
  template_name: z.string().trim().min(1).max(255),
  amount: z.number().positive(),
  memo: z.string().trim().max(4000).optional().nullable(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually"]),
  day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
  day_of_week: z.coerce.number().int().min(0).max(6).optional().nullable(),
  next_generation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  auto_post: z.boolean().optional().default(false),
  line_items: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        amount: z.number(),
        coa_account_id: z.string().uuid().optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

const updateTemplateBodySchema = templateBodySchema.partial();

const uuidParamsSchema = z.object({ uuid: z.string().uuid() });

const listQuerySchema = companyQuerySchema.extend({
  active_only: z.coerce.boolean().optional().default(false),
  due_soon: z.coerce.boolean().optional().default(false),
});

const generationLogQuerySchema = companyQuerySchema.extend({
  template_uuid: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const generateNowBodySchema = z.object({
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function recurringBillRoutes(app: FastifyInstance) {
  // POST /api/v1/accounting/recurring-bill-templates
  app.post("/api/v1/accounting/recurring-bill-templates", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = templateBodySchema.safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);

    await assertCompanyMembership(String(user.uuid), body.data.operating_company_id);

    const idempotencyKey = (req.headers["idempotency-key"] as string | undefined) ?? undefined;
    if (!idempotencyKey) {
      return reply.code(422).send({ error: "Idempotency-Key header required" });
    }

    const uuid = await createTemplate(
      {
        operatingCompanyId: body.data.operating_company_id,
        vendorUuid: body.data.vendor_uuid,
        templateName: body.data.template_name,
        amount: body.data.amount,
        memo: body.data.memo,
        frequency: body.data.frequency,
        dayOfMonth: body.data.day_of_month,
        dayOfWeek: body.data.day_of_week,
        nextGenerationDate: body.data.next_generation_date,
        endDate: body.data.end_date,
        autoPost: body.data.auto_post,
        lineItems: body.data.line_items,
      },
      String(user.uuid)
    );
    return reply.code(201).send({ uuid });
  });

  // GET /api/v1/accounting/recurring-bill-templates
  app.get("/api/v1/accounting/recurring-bill-templates", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    const rows = await listTemplates(query.data.operating_company_id, String(user.uuid), {
      activeOnly: query.data.active_only,
      dueSoon: query.data.due_soon,
    });
    return reply.send({ rows });
  });

  // GET /api/v1/accounting/recurring-bill-templates/:uuid
  app.get("/api/v1/accounting/recurring-bill-templates/:uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = uuidParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    try {
      const tmpl = await getTemplate(params.data.uuid, query.data.operating_company_id, String(user.uuid));
      return reply.send(tmpl);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not_found")) {
        return reply.code(404).send({ error: "Template not found" });
      }
      throw err;
    }
  });

  // PATCH /api/v1/accounting/recurring-bill-templates/:uuid
  app.patch("/api/v1/accounting/recurring-bill-templates/:uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = uuidParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const body = updateTemplateBodySchema.safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);

    const { vendor_uuid, template_name, day_of_month, day_of_week, next_generation_date, end_date, auto_post, line_items, ...rest } = body.data;

    try {
      const uuid = await updateTemplate(
        params.data.uuid,
        {
          vendorUuid: vendor_uuid,
          templateName: template_name,
          dayOfMonth: day_of_month,
          dayOfWeek: day_of_week,
          nextGenerationDate: next_generation_date,
          endDate: end_date,
          autoPost: auto_post,
          lineItems: line_items,
          ...rest,
        },
        String(user.uuid)
      );
      return reply.send({ uuid });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not_found")) {
        return reply.code(404).send({ error: "Template not found" });
      }
      throw err;
    }
  });

  // POST /api/v1/accounting/recurring-bill-templates/:uuid/deactivate
  // FE (RecurringBillList.tsx → deactivateRecurringBillTemplate) calls this with POST.
  app.post("/api/v1/accounting/recurring-bill-templates/:uuid/deactivate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = uuidParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);

    try {
      const uuid = await deactivateTemplate(params.data.uuid, String(user.uuid));
      return reply.send({ uuid, is_active: false });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not_found")) {
        return reply.code(404).send({ error: "Template not found or already inactive" });
      }
      throw err;
    }
  });

  // POST /api/v1/accounting/recurring-bill-templates/:uuid/generate-now
  app.post("/api/v1/accounting/recurring-bill-templates/:uuid/generate-now", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = uuidParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const body = generateNowBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const idempotencyKey = (req.headers["idempotency-key"] as string | undefined) ?? undefined;
    if (!idempotencyKey) {
      return reply.code(422).send({ error: "Idempotency-Key header required" });
    }

    try {
      const targetDate = body.data.target_date ?? DateTime.utc().toISODate()!;
      const result = await generateFromTemplate(params.data.uuid, targetDate, String(user.uuid));
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not_found")) {
        return reply.code(404).send({ error: "Template not found" });
      }
      if (err instanceof Error && err.message.includes("inactive")) {
        return reply.code(409).send({ error: "Template is inactive" });
      }
      throw err;
    }
  });

  // GET /api/v1/accounting/recurring-bill-templates/generation-log
  app.get("/api/v1/accounting/recurring-bill-templates/generation-log", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = generationLogQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    const rows = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const params: unknown[] = [query.data.operating_company_id, query.data.limit, query.data.offset];
      let sql = `
        SELECT l.*, t.template_name, t.vendor_uuid
        FROM accounting.recurring_bill_generation_log l
        JOIN accounting.recurring_bill_templates t ON t.uuid = l.template_uuid
        WHERE t.operating_company_id = $1
      `;
      if (query.data.template_uuid) {
        params.push(query.data.template_uuid);
        sql += ` AND l.template_uuid = $${params.length}::uuid`;
      }
      sql += ` ORDER BY l.generated_at DESC LIMIT $2 OFFSET $3`;
      const res = await client.query(sql, params);
      return res.rows;
    });

    return reply.send({ rows });
  });
}

export default fp(recurringBillRoutes, { name: "recurring-bill-routes" });
