import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { verifyCustomerWithSafer } from "../integrations/fmcsa/safer.service.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { enqueueTmsCustomerPushRequested } from "../qbo/tms-customer-push-chain.service.js";
import { searchCustomersForAutocomplete } from "./customer-autocomplete.shared.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  active_only: z.coerce.boolean().optional().default(true),
  autocomplete: z.coerce.boolean().optional().default(false),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const detailQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});
const customerTypeInputSchema = z.enum(["broker", "direct", "direct_shipper"]);
const milesBasisSchema = z.enum(["short_miles", "practical_miles"]);
const customerStatusSchema = z.enum(["active", "inactive", "credit_hold", "blacklist"]);
const factoringRecourseTypeSchema = z.enum(["recourse", "non_recourse"]);
const qualityOverallFlagSchema = z.enum(["preferred", "standard", "caution", "avoid"]);
const creditLimitSourceSchema = z.enum(["factor", "manual", "rmis_future"]);
const layoverCurrencySchema = z.enum(["USD", "MXN", "CAD"]);

const createCustomerBodySchema = z
  .object({
  name: z.string().trim().min(1).max(200).optional(),
  legal_name: z.string().trim().min(1).max(200).optional(),
  dba: z.string().trim().max(200).optional(),
  customer_code: z.string().trim().max(100).optional(),
  code: z.string().trim().max(100).optional(),
  email: z.string().email().transform((v) => v.toLowerCase()).optional(),
  phone: z.string().trim().max(50).optional(),
  billing_address: z.string().trim().max(500).optional(),
  billing_state: z.string().trim().max(8).optional(),
  mc_number: z.string().trim().max(50).optional(),
  dot_number: z.string().trim().max(50).optional(),
  tax_id: z.string().trim().max(50).optional(),
  credit_limit: z.number().min(0).optional(),
  credit_limit_source: creditLimitSourceSchema.nullable().optional(),
  credit_limit_updated_at: z.string().datetime().nullable().optional(),
  payment_terms_id: z.string().uuid().nullable().optional(),
  operating_company_id: z.string().uuid().optional(),
  customer_type: customerTypeInputSchema.optional(),
  status: customerStatusSchema.optional(),
  default_billing_miles_basis: milesBasisSchema.optional(),
  default_free_time_hours: z.number().min(0).max(99).optional(),
  default_detention_rate: z.number().min(0).max(99999.99).optional(),
  notes: z.string().trim().max(5000).optional(),
  website: z.string().trim().max(200).optional(),
  office_phone: z.string().trim().max(50).optional(),
  fax_phone: z.string().trim().max(50).optional(),
  main_contact_name: z.string().trim().max(120).optional(),
  main_contact_title: z.string().trim().max(120).optional(),
  main_contact_email: z.string().trim().email().optional(),
  main_contact_phone: z.string().trim().max(50).optional(),
  main_contact_mobile: z.string().trim().max(50).optional(),
  ar_email: z.string().trim().email().optional(),
  ar_phone: z.string().trim().max(50).optional(),
  ap_email: z.string().trim().email().optional(),
  ap_phone: z.string().trim().max(50).optional(),
  free_time_pickup_minutes: z.number().int().min(0).max(1440).optional(),
  free_time_delivery_minutes: z.number().int().min(0).max(1440).optional(),
  detention_rate_per_hour: z.number().min(0).max(9999.99).optional(),
  layover_charge_per_day: z.number().min(0).nullable().optional(),
  layover_currency: layoverCurrencySchema.nullable().optional(),
  layover_first_night_free: z.boolean().optional(),
  layover_max_days: z.number().int().min(1).nullable().optional(),
  layover_notes: z.string().trim().max(2000).nullable().optional(),
  factoring_eligible: z.boolean().optional(),
  factoring_company_vendor_id: z.string().uuid().nullable().optional(),
  factoring_advance_rate_override: z.number().min(0).max(100).nullable().optional(),
  factoring_reserve_pct_override: z.number().min(0).max(100).nullable().optional(),
  factoring_recourse_type: factoringRecourseTypeSchema.nullable().optional(),
  factoring_notes: z.string().trim().max(5000).nullable().optional(),
  quality_overall_flag: qualityOverallFlagSchema.optional(),
  quality_notes: z.string().trim().max(5000).optional(),
  })
  .refine((value) => Boolean(value.legal_name ?? value.name), { message: "legal_name is required" })
  .refine((value) => Boolean(value.customer_type), { message: "customer_type is required" });

const updateCustomerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    legal_name: z.string().trim().min(1).max(200).optional(),
    dba: z.string().trim().max(200).nullable().optional(),
    customer_code: z.string().trim().max(100).nullable().optional(),
    code: z.string().trim().max(100).nullable().optional(),
    email: z.string().email().transform((v) => v.toLowerCase()).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    billing_address: z.string().trim().max(500).nullable().optional(),
    billing_state: z.string().trim().max(8).nullable().optional(),
    mc_number: z.string().trim().max(50).nullable().optional(),
    dot_number: z.string().trim().max(50).nullable().optional(),
    tax_id: z.string().trim().max(50).nullable().optional(),
    credit_limit: z.number().min(0).nullable().optional(),
    credit_limit_source: creditLimitSourceSchema.nullable().optional(),
    credit_limit_updated_at: z.string().datetime().nullable().optional(),
    payment_terms_id: z.string().uuid().nullable().optional(),
    operating_company_id: z.string().uuid().optional(),
    customer_type: customerTypeInputSchema.nullable().optional(),
    status: customerStatusSchema.optional(),
    status_change_reason: z.string().trim().max(1000).optional(),
    default_billing_miles_basis: milesBasisSchema.optional(),
    default_free_time_hours: z.number().min(0).max(99).optional(),
    default_detention_rate: z.number().min(0).max(99999.99).optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    website: z.string().trim().max(200).nullable().optional(),
    office_phone: z.string().trim().max(50).nullable().optional(),
    fax_phone: z.string().trim().max(50).nullable().optional(),
    main_contact_name: z.string().trim().max(120).nullable().optional(),
    main_contact_title: z.string().trim().max(120).nullable().optional(),
    main_contact_email: z.string().trim().email().nullable().optional(),
    main_contact_phone: z.string().trim().max(50).nullable().optional(),
    main_contact_mobile: z.string().trim().max(50).nullable().optional(),
    ar_email: z.string().trim().email().nullable().optional(),
    ar_phone: z.string().trim().max(50).nullable().optional(),
    ap_email: z.string().trim().email().nullable().optional(),
    ap_phone: z.string().trim().max(50).nullable().optional(),
    free_time_pickup_minutes: z.number().int().min(0).max(1440).optional(),
    free_time_delivery_minutes: z.number().int().min(0).max(1440).optional(),
    detention_rate_per_hour: z.number().min(0).max(9999.99).optional(),
    layover_charge_per_day: z.number().min(0).nullable().optional(),
    layover_currency: layoverCurrencySchema.nullable().optional(),
    layover_first_night_free: z.boolean().optional(),
    layover_max_days: z.number().int().min(1).nullable().optional(),
    layover_notes: z.string().trim().max(2000).nullable().optional(),
    factoring_eligible: z.boolean().optional(),
    factoring_company_vendor_id: z.string().uuid().nullable().optional(),
    factoring_advance_rate_override: z.number().min(0).max(100).nullable().optional(),
    factoring_reserve_pct_override: z.number().min(0).max(100).nullable().optional(),
    factoring_recourse_type: factoringRecourseTypeSchema.nullable().optional(),
    factoring_notes: z.string().trim().max(5000).nullable().optional(),
    quality_overall_flag: qualityOverallFlagSchema.optional(),
    quality_notes: z.string().trim().max(5000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return sendZodValidation(reply, error);
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant" || role === "Dispatcher";
}

function canReadTaxId(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

function canForceFmcsaVerify(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

async function resolveOperatingCompanyId(client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> }, userId: string, requested?: string) {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId]
  );
  return res.rows[0]?.id ?? null;
}

async function assertUniqueCustomerFields(
  authUserId: string,
  payload: { name?: string | null; mc_number?: string | null; dot_number?: string | null },
  excludeId?: string
): Promise<null | "name" | "mc_number" | "dot_number"> {
  const conflict = await withCurrentUser(authUserId, async (client) => {
    const checks: Array<{ key: "name" | "mc_number" | "dot_number"; sql: string; value: string }> = [];
    if (payload.name) checks.push({ key: "name", sql: "customer_name", value: payload.name });
    if (payload.mc_number) checks.push({ key: "mc_number", sql: "mc_number", value: payload.mc_number });
    if (payload.dot_number) checks.push({ key: "dot_number", sql: "dot_number", value: payload.dot_number });
    for (const check of checks) {
      const values: unknown[] = [check.value];
      let where = `${check.sql} = $1`;
      if (excludeId) {
        values.push(excludeId);
        where += " AND id <> $2";
      }
      const res = await client.query(`SELECT id FROM mdata.customers WHERE ${where} LIMIT 1`, values);
      if (res.rows.length > 0) return check.key;
    }
    return null;
  });
  return conflict;
}

const CUSTOMER_SELECT_COLUMNS = `
  id,
  customer_name AS name,
  customer_code,
  billing_email AS email,
  billing_phone AS phone,
  billing_address_line1 AS billing_address,
  billing_state,
  mc_number,
  dot_number,
  tax_id_encrypted,
  credit_limit,
  credit_limit_source,
  credit_limit_updated_at,
  payment_terms_id,
  operating_company_id,
  customer_type,
  status,
  default_billing_miles_basis,
  default_free_time_hours,
  default_detention_rate,
  notes,
  website,
  office_phone,
  fax_phone,
  main_contact_name,
  main_contact_title,
  main_contact_email,
  main_contact_phone,
  main_contact_mobile,
  ar_email,
  ar_phone,
  ap_email,
  ap_phone,
  free_time_pickup_minutes,
  free_time_delivery_minutes,
  detention_rate_per_hour,
  layover_charge_per_day,
  layover_currency,
  layover_first_night_free,
  layover_max_days,
  layover_notes,
  factoring_eligible,
  factoring_company_vendor_id,
  factoring_advance_rate_override,
  factoring_reserve_pct_override,
  factoring_recourse_type,
  factoring_notes,
  quality_overall_flag,
  quality_payment_score,
  quality_cancellation_score,
  quality_disputes_count,
  quality_last_evaluated_at,
  quality_notes,
  fmcsa_verified_at,
  fmcsa_lookup_id,
  fmcsa_authority_status_at_verification,
  fmcsa_last_checked_at,
  fmcsa_check_response,
  created_at,
  updated_at,
  deactivated_at,
  created_by_user_id,
  updated_by_user_id
`;

function mapCustomerRow(row: Record<string, unknown>, includeTaxId: boolean) {
  let taxId: string | null = null;
  if (includeTaxId && row.tax_id_encrypted) {
    try {
      taxId = decrypt(row.tax_id_encrypted as Buffer);
    } catch {
      taxId = null;
    }
  }
  return {
    ...row,
    legal_name: row.name,
    code: row.customer_code,
    dba: null,
    tax_id: taxId,
    tax_id_encrypted: undefined,
  };
}

function normalizeCustomerType(input: "broker" | "direct" | "direct_shipper" | null | undefined): "broker" | "direct_shipper" | null {
  if (!input) return null;
  return input === "direct" ? "direct_shipper" : input;
}

export async function registerCustomerRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/customers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, q, active_only, autocomplete, operating_company_id } = parsedQuery.data;
    const term = (q ?? search ?? "").trim();
    if (autocomplete) {
      if (!operating_company_id) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      const results = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);
        return searchCustomersForAutocomplete(client, {
          operating_company_id,
          term,
          limit,
          active_only,
        });
      });
      return { results };
    }

    const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, operating_company_id)
    );
    if (!resolvedOperatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    const customers = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      let searchContainsIdx: number | null = null;
      let searchPrefixIdx: number | null = null;
      if (search) {
        values.push(`%${search}%`);
        searchContainsIdx = values.length;
        values.push(`${search}%`);
        searchPrefixIdx = values.length;
        const idx = searchContainsIdx;
        filters.push(
          `(customer_name ILIKE $${idx} OR customer_code ILIKE $${idx} OR mc_number ILIKE $${idx} OR dot_number ILIKE $${idx} OR billing_email ILIKE $${idx} OR status::text ILIKE $${idx})`
        );
      }
      values.push(resolvedOperatingCompanyId);
      filters.push(`operating_company_id = $${values.length}`);
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const orderClause =
        searchContainsIdx && searchPrefixIdx
          ? `
          ORDER BY
            CASE
              WHEN customer_code ILIKE $${searchPrefixIdx} THEN 400
              WHEN customer_name ILIKE $${searchPrefixIdx} THEN 300
              WHEN customer_code ILIKE $${searchContainsIdx} THEN 250
              WHEN customer_name ILIKE $${searchContainsIdx} THEN 200
              ELSE 100
            END DESC,
            created_at DESC
          `
          : "ORDER BY created_at DESC";
      const res = await client.query(
        `
          SELECT ${CUSTOMER_SELECT_COLUMNS}
          FROM mdata.customers
          ${whereClause}
          ${orderClause}
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows.map((row) => mapCustomerRow(row, canReadTaxId(authUser.role)));
    });
    return { customers };
  });

  app.post("/api/v1/mdata/customers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createCustomerBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const normalizedName = b.legal_name ?? b.name ?? "";
    const normalizedCode = b.code ?? b.customer_code;
    const normalizedCustomerType = normalizeCustomerType(b.customer_type);
    const conflict = await assertUniqueCustomerFields(authUser.uuid, {
      name: normalizedName,
      mc_number: b.mc_number ?? null,
      dot_number: b.dot_number ?? null,
    });
    if (conflict) {
      const fieldKey = conflict === "name" ? "legal_name" : conflict;
      return reply.code(409).send({
        error: `mdata_customer_${conflict}_conflict`,
        message: `Customer with this ${conflict} already exists`,
        fieldErrors: { [fieldKey]: "Already in use" },
      });
    }

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (!resolvedOperatingCompanyId) throw new Error("operating_company_id_required");
        const columns: string[] = ["customer_name", "customer_type", "status", "operating_company_id", "created_by_user_id", "updated_by_user_id"];
        const values: unknown[] = [normalizedName, normalizedCustomerType, b.status ?? "active", resolvedOperatingCompanyId, authUser.uuid, authUser.uuid];
        const placeholders: string[] = ["$1", "$2", "$3", "$4", "$5", "$6"];

        const addOptional = (column: string, value: unknown) => {
          if (value === undefined) return;
          columns.push(column);
          values.push(value);
          placeholders.push(`$${values.length}`);
        };

        addOptional("customer_code", normalizedCode);
        addOptional("billing_email", b.email);
        addOptional("billing_phone", b.phone);
        addOptional("billing_address_line1", b.billing_address);
        addOptional("billing_state", b.billing_state);
        addOptional("mc_number", b.mc_number);
        addOptional("dot_number", b.dot_number);
        if (b.tax_id !== undefined) addOptional("tax_id_encrypted", b.tax_id ? encrypt(b.tax_id) : null);
        addOptional("credit_limit", b.credit_limit);
        if (b.credit_limit !== undefined && b.credit_limit_updated_at === undefined) addOptional("credit_limit_updated_at", new Date().toISOString());
        addOptional("credit_limit_source", b.credit_limit_source ?? (b.credit_limit !== undefined ? "manual" : undefined));
        addOptional("credit_limit_updated_at", b.credit_limit_updated_at);
        addOptional("payment_terms_id", b.payment_terms_id);
        addOptional("default_billing_miles_basis", b.default_billing_miles_basis ?? "practical_miles");
        addOptional("default_free_time_hours", b.default_free_time_hours ?? 4);
        addOptional("default_detention_rate", b.default_detention_rate ?? 50);
        addOptional("website", b.website);
        addOptional("office_phone", b.office_phone);
        addOptional("fax_phone", b.fax_phone);
        addOptional("main_contact_name", b.main_contact_name);
        addOptional("main_contact_title", b.main_contact_title);
        addOptional("main_contact_email", b.main_contact_email);
        addOptional("main_contact_phone", b.main_contact_phone);
        addOptional("main_contact_mobile", b.main_contact_mobile);
        addOptional("ar_email", b.ar_email);
        addOptional("ar_phone", b.ar_phone);
        addOptional("ap_email", b.ap_email);
        addOptional("ap_phone", b.ap_phone);
        addOptional("free_time_pickup_minutes", b.free_time_pickup_minutes ?? 120);
        addOptional("free_time_delivery_minutes", b.free_time_delivery_minutes ?? 120);
        addOptional("detention_rate_per_hour", b.detention_rate_per_hour ?? 0);
        addOptional("layover_charge_per_day", b.layover_charge_per_day);
        addOptional("layover_currency", b.layover_currency);
        addOptional("layover_first_night_free", b.layover_first_night_free ?? true);
        addOptional("layover_max_days", b.layover_max_days);
        addOptional("layover_notes", b.layover_notes);
        addOptional("factoring_eligible", b.factoring_eligible);
        addOptional("factoring_company_vendor_id", b.factoring_company_vendor_id);
        addOptional("factoring_advance_rate_override", b.factoring_advance_rate_override);
        addOptional("factoring_reserve_pct_override", b.factoring_reserve_pct_override);
        addOptional("factoring_recourse_type", b.factoring_recourse_type);
        addOptional("factoring_notes", b.factoring_notes);
        addOptional("quality_overall_flag", b.quality_overall_flag);
        addOptional("quality_notes", b.quality_notes);
        if (b.notes !== undefined || b.dba !== undefined) {
          const notesParts = [b.notes, b.dba ? `DBA: ${b.dba}` : null].filter(Boolean);
          addOptional("notes", notesParts.length > 0 ? notesParts.join("\n") : null);
        }

        const res = await client.query(
          `INSERT INTO mdata.customers (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${CUSTOMER_SELECT_COLUMNS}`,
          values
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.customers.created",
          {
            resource_id: row.id,
            resource_type: "mdata.customers",
            id: row.id,
            name: row.name,
            customer_code: row.customer_code,
            email: row.email,
          },
          "info",
          "BT-1-CUSTOMER-FULL-PROFILE"
        );
        await enqueueTmsCustomerPushRequested(client, {
          operating_company_id: String(row.operating_company_id),
          customer_id: String(row.id),
          operation: "create",
        });
        return {
          customerId: row.id as string,
          customer: mapCustomerRow(row, canReadTaxId(authUser.role)),
        };
      });
      // Fire-and-forget: creation must not block on FMCSA transient failures.
      void verifyCustomerWithSafer({ customerId: created.customerId, actorUserId: authUser.uuid });
      return reply.code(201).send(created.customer);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const constraint = String((err as { constraint?: string }).constraint ?? "");
        if (constraint.includes("customer_code")) {
          return reply.code(409).send({ error: "duplicate_code" });
        }
        return reply.code(409).send({ error: "mdata_customer_conflict" });
      }
      if ((err as { code?: string }).code === "23502") {
        return reply.code(400).send({ error: "not_null_violation", column: (err as { column?: string }).column ?? null });
      }
      if ((err as Error).message === "operating_company_id_required") return reply.code(400).send({ error: "operating_company_id_required" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/customers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)
    );
    if (!resolvedOperatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }
    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const res = await client.query(
        `SELECT ${CUSTOMER_SELECT_COLUMNS} FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [parsedParams.data.id, resolvedOperatingCompanyId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return mapCustomerRow(row, canReadTaxId(authUser.role));
  });

  app.get("/api/v1/mdata/customers/:id/detail", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)
    );
    if (!resolvedOperatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }
    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const res = await client.query(
        `
          SELECT
            ${CUSTOMER_SELECT_COLUMNS},
            (
              SELECT v.vendor_name
              FROM mdata.vendors v
              WHERE v.id = c.factoring_company_vendor_id
                AND v.operating_company_id = c.operating_company_id
              LIMIT 1
            ) AS factoring_company_name,
            COALESCE((
              SELECT json_agg(
                json_build_object(
                  'id', cc.uuid,
                  'customer_id', cc.customer_uuid,
                  'name', cc.name,
                  'title', cc.title,
                  'email', cc.email,
                  'phone', cc.phone,
                  'mobile', cc.mobile,
                  'department', cc.department,
                  'is_primary', cc.is_primary,
                  'notes', cc.notes,
                  'deactivated_at', cc.deactivated_at,
                  'created_at', cc.created_at,
                  'updated_at', cc.updated_at
                )
                ORDER BY cc.is_primary DESC, cc.department, cc.name
              )
              FROM mdata.customer_contacts cc
              WHERE cc.customer_uuid = c.id
                AND cc.deactivated_at IS NULL
            ), '[]'::json) AS contacts
          FROM mdata.customers c
          WHERE c.id = $1
            AND c.operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, resolvedOperatingCompanyId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return { customer: mapCustomerRow(row, canReadTaxId(authUser.role)) };
  });

  app.patch("/api/v1/mdata/customers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateCustomerBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const role = authUser.role;
    const qualityFlagRequested = "quality_overall_flag" in b;
    const qualityNotesRequested = "quality_notes" in b;
    const creditLimitRequested = "credit_limit" in b;
    const creditSourceRequested = "credit_limit_source" in b;
    const creditUpdatedAtRequested = "credit_limit_updated_at" in b;

    if (qualityFlagRequested && role !== "Owner") return reply.code(403).send({ error: "quality_flag_owner_only" });
    if (qualityNotesRequested && role !== "Owner" && role !== "Administrator" && role !== "Manager") {
      return reply.code(403).send({ error: "quality_notes_forbidden" });
    }
    if ((creditLimitRequested || creditSourceRequested || creditUpdatedAtRequested) && role !== "Owner" && role !== "Administrator") {
      return reply.code(403).send({ error: "credit_limit_forbidden" });
    }
    const patchName = b.legal_name ?? b.name ?? null;
    const conflict = await assertUniqueCustomerFields(authUser.uuid, { name: patchName, mc_number: b.mc_number ?? null, dot_number: b.dot_number ?? null }, parsedParams.data.id);
    if (conflict) {
      const fieldKey = conflict === "name" ? "name" : conflict;
      return reply.code(409).send({
        error: `mdata_customer_${conflict}_conflict`,
        message: `Customer with this ${conflict} already exists`,
        fieldErrors: { [fieldKey]: "Already in use" },
      });
    }
    const existingRow = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(`SELECT ${CUSTOMER_SELECT_COLUMNS} FROM mdata.customers WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
      return res.rows[0] ?? null;
    });
    if (!existingRow) return reply.code(404).send({ error: "mdata_customer_not_found" });

    if (creditLimitRequested) {
      const nextSource = (b.credit_limit_source ?? (existingRow.credit_limit_source as string | null) ?? null) as string | null;
      if (nextSource === "factor" && authUser.role !== "Owner") {
        return reply.code(403).send({ error: "credit_limit_locked_by_factor" });
      }
      if (nextSource !== "manual" && authUser.role !== "Owner") {
        return reply.code(403).send({ error: "credit_limit_owner_only_for_source" });
      }
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("name" in b || "legal_name" in b) add("customer_name", b.legal_name ?? b.name ?? null);
    if ("customer_code" in b || "code" in b) add("customer_code", b.code ?? b.customer_code ?? null);
    if ("email" in b) add("billing_email", b.email ?? null);
    if ("phone" in b) add("billing_phone", b.phone ?? null);
    if ("billing_address" in b) add("billing_address_line1", b.billing_address ?? null);
    if ("billing_state" in b) add("billing_state", b.billing_state ?? null);
    if ("mc_number" in b) add("mc_number", b.mc_number ?? null);
    if ("dot_number" in b) add("dot_number", b.dot_number ?? null);
    if ("tax_id" in b) add("tax_id_encrypted", b.tax_id ? encrypt(b.tax_id) : null);
    if ("credit_limit" in b) add("credit_limit", b.credit_limit ?? null);
    if ("credit_limit_source" in b) add("credit_limit_source", b.credit_limit_source ?? null);
    if ("credit_limit" in b) {
      add("credit_limit_updated_at", new Date().toISOString());
    } else if ("credit_limit_updated_at" in b) {
      add("credit_limit_updated_at", b.credit_limit_updated_at ?? null);
    }
    if ("payment_terms_id" in b) add("payment_terms_id", b.payment_terms_id ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    if ("customer_type" in b) add("customer_type", normalizeCustomerType(b.customer_type ?? null));
    if ("status" in b) add("status", b.status);
    if ("default_billing_miles_basis" in b) add("default_billing_miles_basis", b.default_billing_miles_basis);
    if ("default_free_time_hours" in b) add("default_free_time_hours", b.default_free_time_hours);
    if ("default_detention_rate" in b) add("default_detention_rate", b.default_detention_rate);
    if ("notes" in b || "dba" in b) {
      add("notes", b.notes ?? (b.dba ? `DBA: ${b.dba}` : null));
    }
    if ("website" in b) add("website", b.website ?? null);
    if ("office_phone" in b) add("office_phone", b.office_phone ?? null);
    if ("fax_phone" in b) add("fax_phone", b.fax_phone ?? null);
    if ("main_contact_name" in b) add("main_contact_name", b.main_contact_name ?? null);
    if ("main_contact_title" in b) add("main_contact_title", b.main_contact_title ?? null);
    if ("main_contact_email" in b) add("main_contact_email", b.main_contact_email ?? null);
    if ("main_contact_phone" in b) add("main_contact_phone", b.main_contact_phone ?? null);
    if ("main_contact_mobile" in b) add("main_contact_mobile", b.main_contact_mobile ?? null);
    if ("ar_email" in b) add("ar_email", b.ar_email ?? null);
    if ("ar_phone" in b) add("ar_phone", b.ar_phone ?? null);
    if ("ap_email" in b) add("ap_email", b.ap_email ?? null);
    if ("ap_phone" in b) add("ap_phone", b.ap_phone ?? null);
    if ("free_time_pickup_minutes" in b) add("free_time_pickup_minutes", b.free_time_pickup_minutes);
    if ("free_time_delivery_minutes" in b) add("free_time_delivery_minutes", b.free_time_delivery_minutes);
    if ("detention_rate_per_hour" in b) add("detention_rate_per_hour", b.detention_rate_per_hour);
    if ("layover_charge_per_day" in b) add("layover_charge_per_day", b.layover_charge_per_day ?? null);
    if ("layover_currency" in b) add("layover_currency", b.layover_currency ?? null);
    if ("layover_first_night_free" in b) add("layover_first_night_free", b.layover_first_night_free);
    if ("layover_max_days" in b) add("layover_max_days", b.layover_max_days ?? null);
    if ("layover_notes" in b) add("layover_notes", b.layover_notes ?? null);
    if ("factoring_eligible" in b) add("factoring_eligible", b.factoring_eligible);
    if ("factoring_company_vendor_id" in b) add("factoring_company_vendor_id", b.factoring_company_vendor_id ?? null);
    if ("factoring_advance_rate_override" in b) add("factoring_advance_rate_override", b.factoring_advance_rate_override ?? null);
    if ("factoring_reserve_pct_override" in b) add("factoring_reserve_pct_override", b.factoring_reserve_pct_override ?? null);
    if ("factoring_recourse_type" in b) add("factoring_recourse_type", b.factoring_recourse_type ?? null);
    if ("factoring_notes" in b) add("factoring_notes", b.factoring_notes ?? null);
    if ("quality_overall_flag" in b) add("quality_overall_flag", b.quality_overall_flag);
    if ("quality_notes" in b) add("quality_notes", b.quality_notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    if (setParts.length === 0) return reply.code(400).send({ error: "no_fields_to_update" });
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(`SELECT ${CUSTOMER_SELECT_COLUMNS} FROM mdata.customers WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `UPDATE mdata.customers SET ${setParts.join(", ")} WHERE id = $${idIdx} RETURNING ${CUSTOMER_SELECT_COLUMNS}`,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const changes = buildPatchChanges(b as unknown as Record<string, unknown>, oldRow as Record<string, unknown>, updatedRow as Record<string, unknown>);
        await appendCrudAudit(client, authUser.uuid, "mdata.customers.updated", { resource_id: updatedRow.id, resource_type: "mdata.customers", changes });

        const detentionKeys = new Set(["free_time_pickup_minutes", "free_time_delivery_minutes", "detention_rate_per_hour"]);
        const statusChanged = oldRow.status !== updatedRow.status;
        const detentionChanged = Object.keys(changes).some((key) => detentionKeys.has(key));
        const profileChanged = Object.keys(changes).some((key) => key !== "status" && !detentionKeys.has(key));

        if (profileChanged) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.customers.profile_updated",
            { resource_id: updatedRow.id, resource_type: "mdata.customers", customer_id: updatedRow.id, changes },
            "info",
            "BT-1-CUSTOMER-FULL-PROFILE"
          );
        }

        if (detentionChanged) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.customers.detention_config_updated",
            { resource_id: updatedRow.id, resource_type: "mdata.customers", customer_id: updatedRow.id, changes },
            "info",
            "BT-1-CUSTOMER-FULL-PROFILE"
          );
        }

        if (statusChanged) {
          const newStatus = String(updatedRow.status);
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.customers.status_changed",
            {
              resource_id: updatedRow.id,
              resource_type: "mdata.customers",
              customer_id: updatedRow.id,
              previous_status: String(oldRow.status),
              new_status: newStatus,
              reason: b.status_change_reason ?? null,
            },
            newStatus === "blacklist" || newStatus === "credit_hold" ? "warning" : "info",
            "BT-1-CUSTOMER-FULL-PROFILE"
          );
        }

        if (oldRow.quality_overall_flag !== updatedRow.quality_overall_flag) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.customers.quality_flag_changed",
            {
              resource_id: updatedRow.id,
              resource_type: "mdata.customers",
              customer_id: updatedRow.id,
              previous_quality_flag: oldRow.quality_overall_flag,
              new_quality_flag: updatedRow.quality_overall_flag,
            },
            "warning",
            "BT-1-CUSTOMER-QUALITY-FLAGS"
          );
        }

        await enqueueTmsCustomerPushRequested(client, {
          operating_company_id: String(updatedRow.operating_company_id),
          customer_id: String(updatedRow.id),
          operation: "update",
        });

        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_customer_not_found" });
      const shouldReverify =
        ("mc_number" in b && (existingRow.mc_number ?? null) !== (b.mc_number ?? null)) ||
        ("dot_number" in b && (existingRow.dot_number ?? null) !== (b.dot_number ?? null));
      if (shouldReverify) {
        // Fire-and-forget: update path remains available even if FMCSA is down.
        void verifyCustomerWithSafer({ customerId: updated.id as string, actorUserId: authUser.uuid });
      }
      return mapCustomerRow(updated, canReadTaxId(authUser.role));
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: "mdata_customer_conflict" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/customers/:id/verify-fmcsa", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canForceFmcsaVerify(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await verifyCustomerWithSafer({
      customerId: parsedParams.data.id,
      actorUserId: authUser.uuid,
      force: true,
    });
    if (!result.customer) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return reply.send({ customer: mapCustomerRow(result.customer as Record<string, unknown>, canReadTaxId(authUser.role)) });
  });

  app.post("/api/v1/mdata/customers/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(`SELECT id, operating_company_id, deactivated_at FROM mdata.customers WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;
      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `UPDATE mdata.customers SET deactivated_at = now(), updated_by_user_id = $2 WHERE id = $1 AND deactivated_at IS NULL RETURNING id, deactivated_at`,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }
      await appendCrudAudit(client, authUser.uuid, "mdata.customers.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.customers",
        was_already_deactivated: wasAlreadyDeactivated,
      });
      await enqueueTmsCustomerPushRequested(client, {
        operating_company_id: String(oldRow.operating_company_id ?? ""),
        customer_id: String(oldRow.id),
        operation: "update",
      });
      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return deactivated;
  });
}
