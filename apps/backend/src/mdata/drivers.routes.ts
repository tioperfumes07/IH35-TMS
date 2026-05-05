import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { findReturningDriverMatches } from "./driver-returning-detection.routes.js";

const driverStatusSchema = z.enum(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]);
const cdlClassSchema = z.enum(["A", "B", "C"]);
const milesBasisSchema = z.enum(["short_miles", "practical_miles"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const e164PhoneSchema = z.string().regex(/^\+\d{10,15}$/, "phone must be E.164 format (e.g., +19565550001)");
const curpSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{18}$/i, "CURP must be 18 alphanumeric characters");
const ineSchema = z.string().trim().min(8, "INE must be between 8 and 20 characters").max(20, "INE must be between 8 and 20 characters");

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: driverStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createDriverBodySchema = z.object({
  identity_user_id: z.string().uuid().optional(),
  create_login_user: z.boolean().optional().default(false),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: e164PhoneSchema,
  email: z
    .string()
    .email()
    .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
    .optional(),
  cdl_number: z.string().trim().max(100).optional(),
  cdl_state: z.string().trim().max(50).optional(),
  cdl_class: cdlClassSchema.optional(),
  cdl_expires_at: isoDateSchema.optional(),
  hire_date: isoDateSchema.optional(),
  pay_basis: milesBasisSchema.optional(),
  dot_medical_expires_at: isoDateSchema.optional(),
  hazmat_endorsement_expires_at: isoDateSchema.optional(),
  visa_type: z.string().trim().max(100).optional(),
  visa_number: z.string().trim().max(100).optional(),
  visa_expires_at: isoDateSchema.optional(),
  passport_number: z.string().trim().max(100).optional(),
  passport_expires_at: isoDateSchema.optional(),
  ine_number: ineSchema.optional(),
  curp: curpSchema.optional(),
  mx_address_line1: z.string().trim().max(200).optional(),
  mx_address_line2: z.string().trim().max(200).optional(),
  mx_city: z.string().trim().max(120).optional(),
  mx_state: z.string().trim().max(120).optional(),
  mx_postal_code: z.string().trim().max(20).optional(),
  emergency_contact_name: z.string().trim().max(160).optional(),
  emergency_contact_relationship: z.string().trim().max(80).optional(),
  emergency_contact_phone_primary: z.string().trim().max(40).optional(),
  emergency_contact_phone_alternate: z.string().trim().max(40).optional(),
  emergency_contact_address: z.string().trim().max(300).optional(),
  emergency_contact_notes: z.string().trim().max(2000).optional(),
  status: driverStatusSchema.default("Active"),
  notes: z.string().trim().max(2000).optional(),
  override_returning_warning: z.boolean().optional().default(false),
  prior_driver_id: z.string().uuid().optional(),
  is_rehire: z.boolean().optional().default(false),
});

const updateDriverBodySchema = z
  .object({
    identity_user_id: z.string().uuid().nullable().optional(),
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    email: z
      .string()
      .email()
      .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
      .nullable()
      .optional(),
    cdl_number: z.string().trim().max(100).nullable().optional(),
    cdl_state: z.string().trim().max(50).nullable().optional(),
    cdl_class: cdlClassSchema.nullable().optional(),
    cdl_expires_at: isoDateSchema.nullable().optional(),
    hire_date: isoDateSchema.nullable().optional(),
    pay_basis: milesBasisSchema.optional(),
    dot_medical_expires_at: isoDateSchema.nullable().optional(),
    hazmat_endorsement_expires_at: isoDateSchema.nullable().optional(),
    visa_type: z.string().trim().max(100).nullable().optional(),
    visa_number: z.string().trim().max(100).nullable().optional(),
    visa_expires_at: isoDateSchema.nullable().optional(),
    passport_number: z.string().trim().max(100).nullable().optional(),
    passport_expires_at: isoDateSchema.nullable().optional(),
    ine_number: ineSchema.nullable().optional(),
    curp: curpSchema.nullable().optional(),
    mx_address_line1: z.string().trim().max(200).nullable().optional(),
    mx_address_line2: z.string().trim().max(200).nullable().optional(),
    mx_city: z.string().trim().max(120).nullable().optional(),
    mx_state: z.string().trim().max(120).nullable().optional(),
    mx_postal_code: z.string().trim().max(20).nullable().optional(),
    emergency_contact_name: z.string().trim().max(160).nullable().optional(),
    emergency_contact_relationship: z.string().trim().max(80).nullable().optional(),
    emergency_contact_phone_primary: z.string().trim().max(40).nullable().optional(),
    emergency_contact_phone_alternate: z.string().trim().max(40).nullable().optional(),
    emergency_contact_address: z.string().trim().max(300).nullable().optional(),
    emergency_contact_notes: z.string().trim().max(2000).nullable().optional(),
    status: driverStatusSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: isoDateSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function statusDisablesDriverLogin(status: string): boolean {
  return status === "Inactive" || status === "Terminated";
}

function driverIdentityMatches(
  prior: { curp: string | null; cdl_number: string | null; cdl_state: string | null },
  incoming: { curp?: string; cdl_number?: string; cdl_state?: string }
): "curp" | "cdl" | null {
  const normalizedPriorCurp = prior.curp?.trim().toUpperCase() ?? "";
  const normalizedIncomingCurp = incoming.curp?.trim().toUpperCase() ?? "";
  if (normalizedPriorCurp && normalizedIncomingCurp && normalizedPriorCurp === normalizedIncomingCurp) {
    return "curp";
  }

  const normalizedPriorCdlNumber = prior.cdl_number?.trim().toUpperCase() ?? "";
  const normalizedPriorCdlState = prior.cdl_state?.trim().toUpperCase() ?? "";
  const normalizedIncomingCdlNumber = incoming.cdl_number?.trim().toUpperCase() ?? "";
  const normalizedIncomingCdlState = incoming.cdl_state?.trim().toUpperCase() ?? "";
  if (
    normalizedPriorCdlNumber &&
    normalizedPriorCdlState &&
    normalizedIncomingCdlNumber &&
    normalizedIncomingCdlState &&
    normalizedPriorCdlNumber === normalizedIncomingCdlNumber &&
    normalizedPriorCdlState === normalizedIncomingCdlState
  ) {
    return "cdl";
  }

  return null;
}

export async function registerDriverRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search } = parsedQuery.data;
    const drivers = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR cdl_number ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
            mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
            emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
            status, notes, prior_driver_id, rehire_count, is_rehire,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.drivers
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { drivers };
  });

  app.post("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        if (b.prior_driver_id && !b.override_returning_warning) {
          return { error: "override_required_for_rehire" as const };
        }

        const returningDetection = await findReturningDriverMatches(client, {
          curp: b.curp,
          cdl_number: b.cdl_number,
          cdl_state: b.cdl_state,
        });
        if (returningDetection.returning_driver) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.drivers.returning_driver_detected",
            {
              resource_type: "mdata.drivers",
              match_count: returningDetection.matched_events.length,
              severity_summary: returningDetection.severity_summary,
              matched_events: returningDetection.matched_events,
            },
            returningDetection.severity_summary.severe_count > 0 ? "warning" : "info",
            "BT-1-DRIVER-SAFETY-FILE"
          );
          if (!b.override_returning_warning) {
            return {
              error: "returning_driver_detected" as const,
              detection: returningDetection,
            };
          }
        }

        const rehireState: {
          prior_driver_id: string | null;
          is_rehire: boolean;
          rehire_count: number;
          matched_via: "curp" | "cdl" | null;
        } = {
          prior_driver_id: null,
          is_rehire: false,
          rehire_count: 0,
          matched_via: null,
        };

        if (b.override_returning_warning && b.prior_driver_id) {
          const priorRes = await client.query<{
            id: string;
            status: string;
            curp: string | null;
            cdl_number: string | null;
            cdl_state: string | null;
            rehire_count: number | null;
          }>(
            `
              SELECT id, status, curp, cdl_number, cdl_state, rehire_count
              FROM mdata.drivers
              WHERE id = $1
              LIMIT 1
            `,
            [b.prior_driver_id]
          );
          const priorDriver = priorRes.rows[0] ?? null;
          if (!priorDriver) {
            return { error: "prior_driver_not_found" as const };
          }
          if (priorDriver.status !== "Terminated") {
            return { error: "prior_driver_not_terminated" as const };
          }

          const matchedVia = driverIdentityMatches(priorDriver, {
            curp: b.curp,
            cdl_number: b.cdl_number,
            cdl_state: b.cdl_state,
          });
          if (!matchedVia) {
            return { error: "prior_driver_identity_mismatch" as const };
          }

          rehireState.prior_driver_id = priorDriver.id;
          rehireState.is_rehire = true;
          rehireState.rehire_count = Number(priorDriver.rehire_count ?? 0) + 1;
          rehireState.matched_via = matchedVia;
        }

        let identityUserId = b.identity_user_id ?? null;
        if (b.create_login_user) {
          const userRes = await client.query<{ id: string }>(
            `
              INSERT INTO identity.users (email, role, phone)
              VALUES (NULL, 'Driver', $1)
              RETURNING id
            `,
            [b.phone]
          );
          identityUserId = userRes.rows[0]?.id ?? null;
          if (!identityUserId) {
            throw new Error("failed_to_create_identity_user");
          }
        }

        const res = await client.query(
          `
            INSERT INTO mdata.drivers (
              identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$37
            )
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            identityUserId,
            b.first_name,
            b.last_name,
            b.phone,
            b.email ?? null,
            b.cdl_number ?? null,
            b.cdl_state ?? null,
            b.cdl_class ?? null,
            b.cdl_expires_at ?? null,
            b.hire_date ?? null,
            b.pay_basis ?? "short_miles",
            b.dot_medical_expires_at ?? null,
            b.hazmat_endorsement_expires_at ?? null,
            b.visa_type ?? null,
            b.visa_number ?? null,
            b.visa_expires_at ?? null,
            b.passport_number ?? null,
            b.passport_expires_at ?? null,
            b.ine_number ?? null,
            b.curp ?? null,
            b.mx_address_line1 ?? null,
            b.mx_address_line2 ?? null,
            b.mx_city ?? null,
            b.mx_state ?? null,
            b.mx_postal_code ?? null,
            b.emergency_contact_name ?? null,
            b.emergency_contact_relationship ?? null,
            b.emergency_contact_phone_primary ?? null,
            b.emergency_contact_phone_alternate ?? null,
            b.emergency_contact_address ?? null,
            b.emergency_contact_notes ?? null,
            b.status,
            b.notes ?? null,
            rehireState.prior_driver_id,
            rehireState.rehire_count,
            rehireState.is_rehire,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        if (b.create_login_user && identityUserId) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.created",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              phone: b.phone,
              role: "Driver",
              linked_driver_id: row.id,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
        }
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.created", {
          resource_id: row.id,
          resource_type: "mdata.drivers",
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          status: row.status,
        });

        if (returningDetection.returning_driver && b.override_returning_warning) {
          if (rehireState.is_rehire && rehireState.prior_driver_id) {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "mdata.drivers.rehired",
              {
                resource_id: row.id,
                resource_type: "mdata.drivers",
                new_driver_id: row.id,
                prior_driver_id: rehireState.prior_driver_id,
                rehire_count: rehireState.rehire_count,
                matched_via: rehireState.matched_via,
              },
              "warning",
              "BT-1-REHIRE-STATES-COMBOBOX"
            );
          } else {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "mdata.drivers.returning_driver_override",
              {
                resource_id: row.id,
                resource_type: "mdata.drivers",
                match_count: returningDetection.matched_events.length,
                severity_summary: returningDetection.severity_summary,
                matched_events: returningDetection.matched_events,
              },
              "warning",
              "BT-1-DRIVER-SAFETY-FILE"
            );
          }
        }
        return row;
      });
      if (created && typeof created === "object" && "error" in created && created.error === "returning_driver_detected") {
        return reply.code(409).send({
          error: "returning_driver_detected",
          ...created.detection,
        });
      }
      if (created && typeof created === "object" && "error" in created) {
        if (created.error === "prior_driver_not_found") return reply.code(404).send({ error: "prior_driver_not_found" });
        if (created.error === "prior_driver_not_terminated") return reply.code(400).send({ error: "prior_driver_not_terminated" });
        if (created.error === "prior_driver_identity_mismatch") return reply.code(400).send({ error: "prior_driver_identity_mismatch" });
        if (created.error === "override_required_for_rehire") return reply.code(400).send({ error: "override_required_for_rehire" });
      }
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_driver_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/drivers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
            mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
            emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
            status, notes, prior_driver_id, rehire_count, is_rehire,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/drivers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const b = parsedBody.data;
    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("identity_user_id" in b) add("identity_user_id", b.identity_user_id ?? null);
    if ("first_name" in b) add("first_name", b.first_name ?? null);
    if ("last_name" in b) add("last_name", b.last_name ?? null);
    if ("phone" in b) add("phone", b.phone ?? null);
    if ("email" in b) add("email", b.email ?? null);
    if ("cdl_number" in b) add("cdl_number", b.cdl_number ?? null);
    if ("cdl_state" in b) add("cdl_state", b.cdl_state ?? null);
    if ("cdl_class" in b) add("cdl_class", b.cdl_class ?? null);
    if ("cdl_expires_at" in b) add("cdl_expires_at", b.cdl_expires_at ?? null);
    if ("hire_date" in b) add("hire_date", b.hire_date ?? null);
    if ("pay_basis" in b) add("pay_basis", b.pay_basis);
    if ("dot_medical_expires_at" in b) add("dot_medical_expires_at", b.dot_medical_expires_at ?? null);
    if ("hazmat_endorsement_expires_at" in b) add("hazmat_endorsement_expires_at", b.hazmat_endorsement_expires_at ?? null);
    if ("visa_type" in b) add("visa_type", b.visa_type ?? null);
    if ("visa_number" in b) add("visa_number", b.visa_number ?? null);
    if ("visa_expires_at" in b) add("visa_expires_at", b.visa_expires_at ?? null);
    if ("passport_number" in b) add("passport_number", b.passport_number ?? null);
    if ("passport_expires_at" in b) add("passport_expires_at", b.passport_expires_at ?? null);
    if ("ine_number" in b) add("ine_number", b.ine_number ?? null);
    if ("curp" in b) add("curp", b.curp ?? null);
    if ("mx_address_line1" in b) add("mx_address_line1", b.mx_address_line1 ?? null);
    if ("mx_address_line2" in b) add("mx_address_line2", b.mx_address_line2 ?? null);
    if ("mx_city" in b) add("mx_city", b.mx_city ?? null);
    if ("mx_state" in b) add("mx_state", b.mx_state ?? null);
    if ("mx_postal_code" in b) add("mx_postal_code", b.mx_postal_code ?? null);
    if ("emergency_contact_name" in b) add("emergency_contact_name", b.emergency_contact_name ?? null);
    if ("emergency_contact_relationship" in b) add("emergency_contact_relationship", b.emergency_contact_relationship ?? null);
    if ("emergency_contact_phone_primary" in b) add("emergency_contact_phone_primary", b.emergency_contact_phone_primary ?? null);
    if ("emergency_contact_phone_alternate" in b) add("emergency_contact_phone_alternate", b.emergency_contact_phone_alternate ?? null);
    if ("emergency_contact_address" in b) add("emergency_contact_address", b.emergency_contact_address ?? null);
    if ("emergency_contact_notes" in b) add("emergency_contact_notes", b.emergency_contact_notes ?? null);
    if ("status" in b) add("status", b.status);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM mdata.drivers
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.drivers
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const oldStatus = String(oldRow.status ?? "");
        const newStatus = String(updatedRow.status ?? oldStatus);
        const identityUserId = (updatedRow.identity_user_id as string | null) ?? (oldRow.identity_user_id as string | null);
        if (identityUserId && !statusDisablesDriverLogin(oldStatus) && statusDisablesDriverLogin(newStatus)) {
          const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
            `
              UPDATE identity.users
              SET deactivated_at = now()
              WHERE id = $1
                AND deactivated_at IS NULL
              RETURNING deactivated_at
            `,
            [identityUserId]
          );
          if (identityDeactivateRes.rows.length > 0) {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "identity.users.deactivated_via_driver_deactivation",
              {
                resource_id: identityUserId,
                resource_type: "identity.users",
                driver_id: updatedRow.id,
                driver_status_from: oldStatus,
                driver_status_to: newStatus,
              },
              "warning",
              "BT-1-AUTH-DRIVER"
            );
          }
        }

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.drivers",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_driver_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at, identity_user_id, status
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE mdata.drivers
            SET deactivated_at = now(), updated_by_user_id = $2
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      const identityUserId = oldRow.identity_user_id as string | null;
      if (identityUserId) {
        const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
          `
            UPDATE identity.users
            SET deactivated_at = now()
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING deactivated_at
          `,
          [identityUserId]
        );
        if (identityDeactivateRes.rows.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.deactivated_via_driver_deactivation",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              driver_id: oldRow.id,
              driver_status: oldRow.status,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
        }
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.drivers",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return deactivated;
  });

  app.post("/api/v1/mdata/drivers/:id/enable-phone-login", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const driverRes = await client.query<{ id: string; phone: string; identity_user_id: string | null }>(
          `
            SELECT id, phone, identity_user_id
            FROM mdata.drivers
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const driver = driverRes.rows[0];
        if (!driver) return { error: "mdata_driver_not_found" as const };
        if (driver.identity_user_id) return { error: "driver_phone_login_already_enabled" as const };

        const userRes = await client.query<{ id: string }>(
          `
            INSERT INTO identity.users (email, role, phone)
            VALUES (NULL, 'Driver', $1)
            RETURNING id
          `,
          [driver.phone]
        );
        const identityUserId = userRes.rows[0]?.id;
        if (!identityUserId) return { error: "identity_user_create_failed" as const };

        await client.query(`UPDATE mdata.drivers SET identity_user_id = $2, updated_by_user_id = $3 WHERE id = $1`, [
          driver.id,
          identityUserId,
          authUser.uuid,
        ]);

        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.users.created",
          {
            resource_id: identityUserId,
            resource_type: "identity.users",
            role: "Driver",
            phone: driver.phone,
            linked_driver_id: driver.id,
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );

        return { identity_user_id: identityUserId };
      });

      if ("error" in updated) {
        if (updated.error === "mdata_driver_not_found") return reply.code(404).send({ error: updated.error });
        if (updated.error === "driver_phone_login_already_enabled") return reply.code(409).send({ error: updated.error });
        return reply.code(400).send({ error: updated.error });
      }

      return { ok: true, ...updated };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "identity_user_phone_conflict" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/disable-phone-login", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{ id: string; identity_user_id: string | null }>(
        `
          SELECT id, identity_user_id
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { error: "mdata_driver_not_found" as const };
      if (!driver.identity_user_id) return { error: "driver_phone_login_not_enabled" as const };

      const deactivateRes = await client.query<{ deactivated_at: string | null }>(
        `
          UPDATE identity.users
          SET deactivated_at = now()
          WHERE id = $1
            AND deactivated_at IS NULL
          RETURNING deactivated_at
        `,
        [driver.identity_user_id]
      );
      const changed = deactivateRes.rows.length > 0;
      if (changed) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.users.deactivated",
          {
            resource_id: driver.identity_user_id,
            resource_type: "identity.users",
            driver_id: driver.id,
            reason: "manual_phone_login_disable",
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );
      }
      return { identity_user_id: driver.identity_user_id, changed };
    });

    if ("error" in result) {
      if (result.error === "mdata_driver_not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }

    return { ok: true, ...result };
  });
}
