import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

export const APPLICANT_STATUSES = ["new", "screening", "interview", "offer", "hired", "declined", "withdrawn"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const applicantParamsSchema = z.object({ id: z.string().uuid() });
const tokenParamsSchema = z.object({ token: z.string().trim().min(16).max(128) });

const submitApplicationSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(32),
  email: z.string().trim().email().optional().nullable(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cdl_number: z.string().trim().max(32).optional().nullable(),
  cdl_state: z.string().trim().max(2).optional().nullable(),
  years_experience: z.number().int().min(0).max(60).optional().nullable(),
  fcra_consent: z.literal(true),
  application_data: z.record(z.string(), z.unknown()).optional(),
});

const statusPatchSchema = z.object({
  status: z.enum(APPLICANT_STATUSES),
  status_notes: z.string().max(2000).optional().nullable(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function ageYearsFromDob(dobIso: string, asOf = new Date()): number {
  const dob = new Date(`${dobIso}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) return -1;
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const m = asOf.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function mapApplicant(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    record_kind: String(row.record_kind),
    status: String(row.status),
    first_name: row.first_name ? String(row.first_name) : null,
    last_name: row.last_name ? String(row.last_name) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    date_of_birth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
    cdl_number: row.cdl_number ? String(row.cdl_number) : null,
    cdl_state: row.cdl_state ? String(row.cdl_state) : null,
    years_experience: row.years_experience == null ? null : Number(row.years_experience),
    application_data: (row.application_data as Record<string, unknown>) ?? {},
    fcra_acknowledged_at: row.fcra_acknowledged_at ? String(row.fcra_acknowledged_at) : null,
    converted_driver_id: row.converted_driver_id ? String(row.converted_driver_id) : null,
    onboarding_session_id: row.onboarding_session_id ? String(row.onboarding_session_id) : null,
    status_notes: row.status_notes ? String(row.status_notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function resolvePortalByToken(token: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT da.operating_company_id, da.intake_token, c.legal_name AS company_name
        FROM identity.driver_applicants da
        JOIN org.companies c ON c.id = da.operating_company_id
        WHERE da.record_kind = 'portal_config'
          AND da.intake_token = $1
          AND da.archived_at IS NULL
          AND c.deactivated_at IS NULL
          AND c.is_active = true
        LIMIT 1
      `,
      [token]
    );
    return res.rows[0] ?? null;
  });
}

export async function registerIdentityApplicantRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/apply/:token", async (req, reply) => {
    const params = tokenParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const portal = await resolvePortalByToken(params.data.token);
    if (!portal) return reply.code(404).send({ error: "application_portal_token_invalid" });
    return {
      company_name: String(portal.company_name ?? ""),
      operating_company_id: String(portal.operating_company_id),
      compliance: {
        minimum_age: 21,
        fcra_disclosure_required: true,
        fcra_notice:
          "By submitting this application you authorize a motor carrier background check under the Fair Credit Reporting Act (FCRA).",
      },
    };
  });

  app.post("/api/v1/public/apply/:token", async (req, reply) => {
    const params = tokenParamsSchema.safeParse(req.params ?? {});
    const body = submitApplicationSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error", details: body.error?.flatten() });
    }
    const age = ageYearsFromDob(body.data.date_of_birth);
    if (age < 21) {
      return reply.code(400).send({ error: "applicant_under_minimum_age", minimum_age: 21 });
    }

    const portal = await resolvePortalByToken(params.data.token);
    if (!portal) return reply.code(404).send({ error: "application_portal_token_invalid" });

    const applicant = await withLuciaBypass(async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
          INSERT INTO identity.driver_applicants (
            operating_company_id,
            record_kind,
            status,
            first_name,
            last_name,
            email,
            phone,
            date_of_birth,
            cdl_number,
            cdl_state,
            years_experience,
            application_data,
            fcra_acknowledged_at
          )
          VALUES ($1, 'applicant', 'new', $2, $3, $4, $5, $6::date, $7, $8, $9, $10::jsonb, now())
          RETURNING *
        `,
        [
          portal.operating_company_id,
          body.data.first_name,
          body.data.last_name,
          body.data.email?.toLowerCase() ?? null,
          body.data.phone,
          body.data.date_of_birth,
          body.data.cdl_number ?? null,
          body.data.cdl_state?.toUpperCase() ?? null,
          body.data.years_experience ?? null,
          JSON.stringify(body.data.application_data ?? {}),
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send({ applicant: mapApplicant(applicant) });
  });

  app.post("/api/v1/identity/applicants/ensure-portal", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = companyQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const portal = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const existing = await client.query<Record<string, unknown>>(
        `
          SELECT *
          FROM identity.driver_applicants
          WHERE operating_company_id = $1
            AND record_kind = 'portal_config'
            AND archived_at IS NULL
          LIMIT 1
        `,
        [body.data.operating_company_id]
      );
      if (existing.rows[0]) return existing.rows[0];

      const token = randomBytes(24).toString("hex");
      const res = await client.query<Record<string, unknown>>(
        `
          INSERT INTO identity.driver_applicants (
            operating_company_id,
            record_kind,
            intake_token,
            status
          )
          VALUES ($1, 'portal_config', $2, 'new')
          RETURNING *
        `,
        [body.data.operating_company_id, token]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "identity.driver_applicant_portal.created",
        {
          resource_type: "identity.driver_applicants",
          resource_id: res.rows[0]?.id ?? null,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        "A24-12-APPLICATION-PORTAL"
      );
      return res.rows[0];
    });

    return {
      portal: mapApplicant(portal),
      apply_path: `/apply/${String(portal.intake_token)}`,
    };
  });

  app.get("/api/v1/identity/applicants", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    const applicants = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
          SELECT *
          FROM identity.driver_applicants
          WHERE operating_company_id = $1
            AND record_kind = 'applicant'
            AND archived_at IS NULL
          ORDER BY created_at DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows.map(mapApplicant);
    });

    return { applicants };
  });

  app.patch("/api/v1/identity/applicants/:id/status", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = applicantParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = statusPatchSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
          UPDATE identity.driver_applicants
          SET status = $3,
              status_notes = COALESCE($4, status_notes),
              reviewed_by_user_id = $5,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND record_kind = 'applicant'
            AND archived_at IS NULL
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.status, body.data.status_notes ?? null, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "identity.driver_applicant.status_updated",
        {
          resource_type: "identity.driver_applicants",
          resource_id: row.id,
          status: body.data.status,
        },
        "info",
        "A24-12-APPLICATION-PORTAL"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "applicant_not_found" });
    return { applicant: mapApplicant(updated) };
  });

  app.post("/api/v1/identity/applicants/:id/convert-to-driver", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = applicantParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const applicantRes = await client.query<Record<string, unknown>>(
        `
          SELECT *
          FROM identity.driver_applicants
          WHERE id = $1
            AND operating_company_id = $2
            AND record_kind = 'applicant'
            AND archived_at IS NULL
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const applicant = applicantRes.rows[0];
      if (!applicant) return { error: "applicant_not_found" as const };
      if (applicant.converted_driver_id) {
        return { error: "applicant_already_converted" as const };
      }
      if (!["offer", "screening", "interview", "new"].includes(String(applicant.status))) {
        return { error: "applicant_status_not_convertible" as const };
      }

      const normalizedEmail = applicant.email ? String(applicant.email).toLowerCase() : null;
      let identityUserId: string | null = null;

      await client.query("SET LOCAL app.bypass_rls = 'lucia'");

      const existingUserRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM identity.users
          WHERE phone = $1
             OR ($2::text IS NOT NULL AND lower(email) = $2)
          ORDER BY id
          LIMIT 1
        `,
        [applicant.phone, normalizedEmail]
      );
      identityUserId = existingUserRes.rows[0]?.id ?? null;

      if (!identityUserId) {
        const userRes = await client.query<{ id: string }>(
          `
            INSERT INTO identity.users (email, role, phone, default_company_id, deactivated_at)
            VALUES ($1, 'Driver', $2, $3, NULL)
            RETURNING id
          `,
          [normalizedEmail, applicant.phone, query.data.operating_company_id]
        );
        identityUserId = userRes.rows[0]?.id ?? null;
      } else {
        await client.query(
          `
            UPDATE identity.users
            SET default_company_id = $2,
                role = 'Driver',
                phone = $3,
                email = COALESCE($4, email),
                deactivated_at = NULL
            WHERE id = $1
          `,
          [identityUserId, query.data.operating_company_id, applicant.phone, normalizedEmail]
        );
      }
      if (!identityUserId) throw new Error("failed_to_resolve_identity_user");

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
        [identityUserId, query.data.operating_company_id, user.uuid]
      );

      const driverRes = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.drivers (
            identity_user_id, first_name, last_name, phone, email,
            cdl_number, cdl_state, status, operating_company_id,
            created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'Probation', $8, $9, $9)
          RETURNING id
        `,
        [
          identityUserId,
          applicant.first_name,
          applicant.last_name,
          applicant.phone,
          normalizedEmail,
          applicant.cdl_number,
          applicant.cdl_state,
          query.data.operating_company_id,
          user.uuid,
        ]
      );
      const driverId = driverRes.rows[0]?.id;
      if (!driverId) throw new Error("failed_to_create_driver");

      const onboardingRes = await client.query<{ id: string }>(
        `
          INSERT INTO safety.onboarding_sessions (
            operating_company_id,
            driver_id,
            current_step,
            status,
            step_data,
            created_by_user_id
          )
          VALUES ($1, $2, 1, 'in_progress', $3::jsonb, $4)
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          driverId,
          JSON.stringify({
            identity: {
              first_name: applicant.first_name,
              last_name: applicant.last_name,
              phone: applicant.phone,
              email: normalizedEmail,
            },
          }),
          user.uuid,
        ]
      );
      const sessionId = onboardingRes.rows[0]?.id;
      if (!sessionId) throw new Error("failed_to_create_onboarding_session");

      const updatedApplicantRes = await client.query<Record<string, unknown>>(
        `
          UPDATE identity.driver_applicants
          SET status = 'hired',
              converted_driver_id = $3,
              onboarding_session_id = $4,
              reviewed_by_user_id = $5,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, driverId, sessionId, user.uuid]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "identity.driver_applicant.converted_to_driver",
        {
          resource_type: "identity.driver_applicants",
          resource_id: params.data.id,
          driver_id: driverId,
          onboarding_session_id: sessionId,
        },
        "info",
        "A24-12-APPLICATION-PORTAL"
      );

      return {
        applicant: updatedApplicantRes.rows[0],
        driver_id: driverId,
        onboarding_session_id: sessionId,
        onboarding_path: `/drivers/onboarding/${sessionId}`,
      };
    });

    if ("error" in result) {
      if (result.error === "applicant_not_found") return reply.code(404).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }

    return reply.code(201).send({
      applicant: mapApplicant(result.applicant),
      driver_id: result.driver_id,
      onboarding_session_id: result.onboarding_session_id,
      onboarding_path: result.onboarding_path,
    });
  });
}
