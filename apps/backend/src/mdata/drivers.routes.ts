import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "crypto";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { enqueueEmail } from "../email/queue.service.js";
import { findReturningDriverMatches } from "./driver-returning-detection.routes.js";
import { buildDriverAggregate } from "./driver-aggregate.service.js";
import { registerDriverDefaultTruckRoutes } from "./driver-default-truck.routes.js";

const driverStatusSchema = z.enum(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]);
const cdlClassSchema = z.enum(["A", "B", "C"]);
const milesBasisSchema = z.enum(["short_miles", "practical_miles"]);
const preferredLanguageSchema = z.enum(["en", "es"]);
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
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const driverAggregateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createDriverBodySchema = z.object({
  identity_user_id: z.string().uuid().optional(),
  create_login_user: z.boolean().optional().default(false),
  operating_company_id: z.string().uuid().optional(),
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
  preferred_language: preferredLanguageSchema.optional(),
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
    preferred_language: preferredLanguageSchema.optional(),
    status: driverStatusSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: isoDateSchema.nullable().optional(),
    qbo_vendor_id: z.string().trim().max(120).nullable().optional(),
    qbo_class_id: z.string().trim().max(120).nullable().optional(),
    operating_company_id: z.string().uuid().nullable().optional(),
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
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function isOwnerOrAdmin(role: string): boolean {
  return role === "Owner" || role === "Administrator";
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
  const driverInviteBaseUrl = (process.env.DRIVER_PWA_BASE_URL || "https://driver.ih35dispatch.com").replace(/\/$/, "");
  const supportEmail = process.env.EMAIL_FROM_DISPATCH || "dispatch@ih35dispatch.com";

  const sendDriverInvite = async (params: {
    to: string;
    driverName: string;
    loginUrl: string;
    actorUserId: string | null;
    recipientUserUuid?: string | null;
    operatingCompanyId: string;
  }) => {
    const { queueId } = await enqueueEmail({
      operatingCompanyId: params.operatingCompanyId,
      toAddresses: [params.to],
      subject: "Welcome to IH 35 Dispatch — your driver app login",
      templateKey: "driver-invite",
      templateVars: {
        driverName: params.driverName,
        loginUrl: params.loginUrl,
        ownerName: "Jorge",
        supportEmail,
      },
      queuedByUserId: params.actorUserId,
    });
    return { id: queueId };
  };

  app.get("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, operating_company_id } = parsedQuery.data;
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
      if (operating_company_id) {
        values.push(operating_company_id);
        filters.push(`operating_company_id = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, operating_company_id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
            mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
            emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            qbo_vendor_id, qbo_vendor_linked_at, qbo_vendor_linked_by_user_id,
            qbo_class_id,
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

  app.get("/api/v1/mdata/drivers/me", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email,
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            status, created_at, updated_at
          FROM mdata.drivers
          WHERE identity_user_id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({
        error: "driver_profile_not_linked",
        message: "your account is not linked to a driver profile",
      });
    }
    return row;
  });

  app.post("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const normalizedEmail = b.email?.toLowerCase() ?? null;

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
        let linkedUserEventType: "existing_user" | "new_user_created" | null = null;
        let operatingCompany: { id: string; legal_name: string } | null = null;
        let resolvedOperatingCompanyId: string | null = null;
        const onboardingEnabled = Boolean(b.operating_company_id);

        if (onboardingEnabled) {
          const companyRes = await client.query<{ id: string; legal_name: string }>(
            `
              SELECT id, legal_name
              FROM org.companies
              WHERE ($1::uuid IS NULL OR id = $1)
                AND id IN (SELECT org.user_accessible_company_ids())
                AND deactivated_at IS NULL
                AND is_active = true
              ORDER BY legal_name
              LIMIT 1
            `,
            [b.operating_company_id]
          );
          operatingCompany = companyRes.rows[0] ?? null;
          if (!operatingCompany) {
            return { error: "operating_company_not_found" as const };
          }
          resolvedOperatingCompanyId = operatingCompany.id;

          await client.query("SET LOCAL app.bypass_rls = 'lucia'");

          if (!identityUserId) {
            const existingUserRes = await client.query<{ id: string }>(
              `
                SELECT id
                FROM identity.users
                WHERE phone = $1
                   OR ($2::text IS NOT NULL AND lower(email) = $2)
                ORDER BY id
                LIMIT 2
              `,
              [b.phone, normalizedEmail]
            );
            const existingUsers = existingUserRes.rows;
            if (existingUsers.length > 1 && existingUsers[0].id !== existingUsers[1].id) {
              return { error: "identity_user_conflict_credentials" as const };
            }
            const existingUser = existingUsers[0] ?? null;
            if (existingUser) {
              identityUserId = existingUser.id;
              linkedUserEventType = "existing_user";
            } else {
              try {
                const userRes = await client.query<{ id: string }>(
                  `
                    INSERT INTO identity.users (email, role, phone, default_company_id, deactivated_at)
                    VALUES ($1, 'Driver', $2, $3, NULL)
                    RETURNING id
                  `,
                  [normalizedEmail, b.phone, resolvedOperatingCompanyId]
                );
                identityUserId = userRes.rows[0]?.id ?? null;
                linkedUserEventType = "new_user_created";
              } catch (err) {
                const code = (err as { code?: string }).code;
                if (code !== "23505") throw err;
                const conflictUserRes = await client.query<{ id: string }>(
                  `
                    SELECT id
                    FROM identity.users
                    WHERE phone = $1
                       OR ($2::text IS NOT NULL AND lower(email) = $2)
                    ORDER BY id
                    LIMIT 2
                  `,
                  [b.phone, normalizedEmail]
                );
                const conflictUsers = conflictUserRes.rows;
                if (conflictUsers.length > 1 && conflictUsers[0].id !== conflictUsers[1].id) {
                  return { error: "identity_user_conflict_credentials" as const };
                }
                identityUserId = conflictUsers[0]?.id ?? null;
                linkedUserEventType = "existing_user";
              }
            }
          }
          if (!identityUserId) throw new Error("failed_to_resolve_identity_user");

          await client.query(
            `
              UPDATE identity.users
              SET default_company_id = $2,
                  role = 'Driver',
                  phone = $3,
                  email = COALESCE($4, email),
                  preferred_language = COALESCE($5, preferred_language, 'en'),
                  deactivated_at = NULL
              WHERE id = $1
            `,
            [identityUserId, resolvedOperatingCompanyId, b.phone, normalizedEmail, b.preferred_language ?? null]
          );

          await client.query(
            `
              INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id, deactivated_at, granted_at)
              VALUES ($1, $2, $3, NULL, now())
              ON CONFLICT (user_id, company_id)
              DO UPDATE
              SET deactivated_at = NULL,
                  granted_by_user_id = EXCLUDED.granted_by_user_id,
                  granted_at = now()
            `,
            [identityUserId, resolvedOperatingCompanyId, authUser.uuid]
          );
        } else if (b.create_login_user) {
          const existingUserRes = await client.query<{ id: string }>(
            `
              SELECT id
              FROM identity.users
              WHERE phone = $1
                 OR ($2::text IS NOT NULL AND lower(email) = $2)
              ORDER BY id
              LIMIT 2
            `,
            [b.phone, normalizedEmail]
          );
          const existingUsers = existingUserRes.rows;
          if (existingUsers.length > 1 && existingUsers[0].id !== existingUsers[1].id) {
            return { error: "identity_user_conflict_credentials" as const };
          }
          if (existingUsers[0]) {
            identityUserId = existingUsers[0].id;
            linkedUserEventType = "existing_user";
          } else {
            const userRes = await client.query<{ id: string }>(
              `
                INSERT INTO identity.users (email, role, phone)
                VALUES ($1, 'Driver', $2)
                RETURNING id
              `,
              [normalizedEmail, b.phone]
            );
            identityUserId = userRes.rows[0]?.id ?? null;
            linkedUserEventType = "new_user_created";
          }
          if (!identityUserId) throw new Error("failed_to_create_identity_user");

          await client.query(
            `
              UPDATE identity.users
              SET role = 'Driver',
                  phone = $2,
                  email = COALESCE($3, email),
                  preferred_language = COALESCE($4, preferred_language, 'en'),
                  deactivated_at = NULL
              WHERE id = $1
            `,
            [identityUserId, b.phone, normalizedEmail, b.preferred_language ?? null]
          );
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
            operating_company_id, created_by_user_id, updated_by_user_id
            ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$38
            )
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
            operating_company_id, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            identityUserId,
            b.first_name,
            b.last_name,
            b.phone,
            normalizedEmail,
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
            resolvedOperatingCompanyId,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        let inviteUrl: string | null = null;
        let inviteExpiresAt: string | null = null;

        if (onboardingEnabled && resolvedOperatingCompanyId && operatingCompany && identityUserId) {
          const inviteToken = randomBytes(32).toString("hex");
          inviteUrl = `${driverInviteBaseUrl}/invite?token=${inviteToken}`;
          await client.query("SET LOCAL app.bypass_rls = 'lucia'");
          const inviteRes = await client.query<{ expires_at: string }>(
            `
              INSERT INTO identity.driver_invites (
                operating_company_id,
                driver_id,
                identity_user_id,
                token,
                phone,
                expires_at,
                created_by_user_id
              )
              VALUES ($1, $2, $3, $4, $5, now() + interval '72 hours', $6)
              RETURNING expires_at
            `,
            [resolvedOperatingCompanyId, row.id, identityUserId, inviteToken, b.phone, authUser.uuid]
          );
          inviteExpiresAt = inviteRes.rows[0]?.expires_at ?? null;

          await client.query(
            `
              INSERT INTO outbox.events (event_type, payload, next_retry_at)
              VALUES ($1, $2::jsonb, now())
            `,
            [
              "twilio.whatsapp.send",
              JSON.stringify({
                to: b.phone,
                template: "driver_invite",
                variables: {
                  driver_first_name: row.first_name,
                  company_name: operatingCompany.legal_name,
                  invite_url: inviteUrl,
                  expires_hours: 72,
                },
              }),
            ]
          );

          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.driver.linked_to_user",
            {
              resource_id: row.id,
              resource_type: "mdata.drivers",
              driver_id: row.id,
              identity_user_id: identityUserId,
              phone: b.phone,
              event_type: linkedUserEventType,
              operating_company_id: resolvedOperatingCompanyId,
            },
            "info",
            "BT-3-DRIVER-ONBOARDING"
          );

          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.driver_invite.created",
            {
              resource_id: row.id,
              resource_type: "identity.driver_invites",
              driver_id: row.id,
              identity_user_id: identityUserId,
              phone: b.phone,
              invite_url: inviteUrl,
              expires_at: inviteExpiresAt,
              event_type: linkedUserEventType,
            },
            "info",
            "BT-3-DRIVER-ONBOARDING"
          );
        } else if (b.create_login_user && identityUserId) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            linkedUserEventType === "existing_user" ? "identity.users.linked" : "identity.users.created",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              phone: b.phone,
              email: normalizedEmail,
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
        return {
          ...row,
          invite_url: inviteUrl,
          invite_expires_at: inviteExpiresAt,
          linked_user_event_type: linkedUserEventType,
          invite_operating_company_id: resolvedOperatingCompanyId,
        };
      });
      if (created && typeof created === "object" && "error" in created && created.error === "returning_driver_detected") {
        return reply.code(409).send({
          error: "returning_driver_detected",
          ...created.detection,
        });
      }
      if (created && typeof created === "object" && "error" in created) {
        if (created.error === "identity_user_conflict_credentials") {
          return reply.code(409).send({ error: "identity_user_conflict_credentials" });
        }
        if (created.error === "operating_company_not_found") return reply.code(400).send({ error: "operating_company_not_found" });
        if (created.error === "prior_driver_not_found") return reply.code(404).send({ error: "prior_driver_not_found" });
        if (created.error === "prior_driver_not_terminated") return reply.code(400).send({ error: "prior_driver_not_terminated" });
        if (created.error === "prior_driver_identity_mismatch") return reply.code(400).send({ error: "prior_driver_identity_mismatch" });
        if (created.error === "override_required_for_rehire") return reply.code(400).send({ error: "override_required_for_rehire" });
      }

      if (created?.invite_url && created?.email && created.invite_operating_company_id) {
        void sendDriverInvite({
          to: created.email,
          driverName: `${created.first_name ?? ""} ${created.last_name ?? ""}`.trim() || "Driver",
          loginUrl: created.invite_url,
          actorUserId: authUser.uuid,
          recipientUserUuid: created.identity_user_id ?? null,
          operatingCompanyId: created.invite_operating_company_id,
        }).catch(() => undefined);
      }

      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505")
        return reply.code(409).send({
          error: "mdata_driver_conflict",
          message: "Driver with this CDL already exists",
          fieldErrors: { cdl_number: "Already in use", cdl_state: "Already in use" },
        });
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      throw err;
    }
  });

  await registerDriverDefaultTruckRoutes(app);

  app.get("/api/v1/mdata/drivers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const parsedAggregateQuery = driverAggregateQuerySchema.safeParse(req.query ?? {});
    if (parsedAggregateQuery.success) {
      const aggregate = await withCurrentUser(authUser.uuid, async (client) =>
        buildDriverAggregate(client, parsedParams.data.id, parsedAggregateQuery.data.operating_company_id)
      );
      if (!aggregate) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return aggregate;
    }

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
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            status, notes, prior_driver_id, rehire_count, is_rehire,
          operating_company_id,
            qbo_vendor_id, qbo_class_id,
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

  app.post("/api/v1/mdata/drivers/:id/resend-invite", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwnerOrAdmin(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        identity_user_id: string | null;
        operating_company_id: string | null;
        operating_company_name: string | null;
      }>(
        `
          SELECT
            d.id,
            d.first_name,
            d.last_name,
            d.email,
            d.identity_user_id,
            i.default_company_id AS operating_company_id,
            c.legal_name AS operating_company_name
          FROM mdata.drivers d
          LEFT JOIN identity.users i ON i.id = d.identity_user_id
          LEFT JOIN org.companies c ON c.id = i.default_company_id
          WHERE d.id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const row = driverRes.rows[0] ?? null;
      if (!row) return { error: "mdata_driver_not_found" as const };
      if (!row.identity_user_id || !row.operating_company_id) return { error: "driver_not_linked" as const };
      if (!row.email) return { error: "driver_email_missing" as const };

      const inviteToken = randomBytes(32).toString("hex");
      const inviteUrl = `${driverInviteBaseUrl}/invite?token=${inviteToken}`;
      const inviteRes = await client.query<{ expires_at: string }>(
        `
          INSERT INTO identity.driver_invites (
            operating_company_id,
            driver_id,
            identity_user_id,
            token,
            phone,
            expires_at,
            created_by_user_id
          )
          SELECT
            $1,
            d.id,
            d.identity_user_id,
            $2,
            d.phone,
            now() + interval '72 hours',
            $3
          FROM mdata.drivers d
          WHERE d.id = $4
          RETURNING expires_at
        `,
        [row.operating_company_id, inviteToken, authUser.uuid, row.id]
      );
      const inviteExpiresAt = inviteRes.rows[0]?.expires_at ?? null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "email.driver_invite.resent",
        {
          resource_id: row.id,
          resource_type: "identity.driver_invites",
          driver_id: row.id,
          identity_user_id: row.identity_user_id,
          invite_url: inviteUrl,
          invite_expires_at: inviteExpiresAt,
        },
        "info",
        "BT-3-DRIVER-ONBOARDING"
      );

      return {
        row,
        inviteUrl,
      };
    });

    if ("error" in result) {
      if (result.error === "mdata_driver_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "driver_email_missing") return reply.code(400).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }

    const recipientEmail = result.row.email as string;
    const operatingCompanyId = result.row.operating_company_id ? String(result.row.operating_company_id) : "";
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_missing" });

    const emailResult = await sendDriverInvite({
      to: recipientEmail,
      driverName: `${result.row.first_name} ${result.row.last_name}`.trim() || "Driver",
      loginUrl: result.inviteUrl,
      actorUserId: authUser.uuid,
      recipientUserUuid: result.row.identity_user_id,
      operatingCompanyId,
    });

    return reply.code(200).send({ sent_to: recipientEmail, queue_id: emailResult.id });
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
    if ("qbo_vendor_id" in b) add("qbo_vendor_id", b.qbo_vendor_id ?? null);
    if ("qbo_class_id" in b) add("qbo_class_id", b.qbo_class_id ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        if ("operating_company_id" in b && b.operating_company_id) {
          const companyRes = await client.query<{ id: string }>(
            `
              SELECT id
              FROM org.companies
              WHERE id = $1
                AND id IN (SELECT org.user_accessible_company_ids())
                AND deactivated_at IS NULL
                AND is_active = true
              LIMIT 1
            `,
            [b.operating_company_id]
          );
          if (companyRes.rows.length === 0) return { error: "operating_company_not_found" as const };
        }

        const oldRes = await client.query(
          `
            SELECT
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
              qbo_vendor_id, qbo_class_id,
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
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
              qbo_vendor_id, qbo_class_id,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        let updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const oldStatus = String(oldRow.status ?? "");
        const newStatus = String(updatedRow.status ?? oldStatus);
        const identityUserId = (updatedRow.identity_user_id as string | null) ?? (oldRow.identity_user_id as string | null);
        const nextPhone = "phone" in b ? (b.phone ?? null) : undefined;
        const nextPreferredLanguage = "preferred_language" in b ? (b.preferred_language ?? "en") : undefined;
        if (identityUserId && nextPhone !== undefined) {
          await client.query(
            `
              UPDATE identity.users
              SET phone = $2
              WHERE id = $1
                AND phone IS DISTINCT FROM $2
            `,
            [identityUserId, nextPhone]
          );
        }
        if (identityUserId && nextPreferredLanguage !== undefined) {
          await client.query(
            `
              UPDATE identity.users
              SET preferred_language = $2
              WHERE id = $1
                AND preferred_language IS DISTINCT FROM $2
            `,
            [identityUserId, nextPreferredLanguage]
          );
          const refreshedRes = await client.query(
            `
              SELECT
                id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
                cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
                visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
                mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
                emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
                emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
                COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
                status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
                qbo_vendor_id, qbo_class_id,
                created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
              FROM mdata.drivers
              WHERE id = $1
              LIMIT 1
            `,
            [updatedRow.id]
          );
          updatedRow = refreshedRes.rows[0] ?? updatedRow;
        }
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
      if (updated && typeof updated === "object" && "error" in updated) {
        return reply.code(400).send({ error: "operating_company_not_found" });
      }
      if (!updated) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505")
        return reply.code(409).send({
          error: "mdata_driver_conflict",
          message: "Driver with this CDL already exists",
          fieldErrors: { cdl_number: "Already in use", cdl_state: "Already in use" },
        });
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
        const driverRes = await client.query<{ id: string; phone: string; email: string | null; identity_user_id: string | null }>(
          `
            SELECT id, phone, email, identity_user_id
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
            VALUES ($1, 'Driver', $2)
            RETURNING id
          `,
          [driver.email ? driver.email.toLowerCase() : null, driver.phone]
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
            email: driver.email ? driver.email.toLowerCase() : null,
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
