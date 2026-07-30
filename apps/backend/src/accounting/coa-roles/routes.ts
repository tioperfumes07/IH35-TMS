import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { requiredCoaRolesForCompanyCode } from "./entity-required-roles.js";
import { COA_ROLE_VALUES } from "./resolver.service.js";
import { computePostingFeatureReadiness, loadPostingFlagRequirements } from "./posting-flag-readiness.js";
import { isEnabled } from "../../lib/feature-flags/service.js";

const roleSchema = z.enum(COA_ROLE_VALUES);

const upsertBodySchema = z.object({
  role: roleSchema,
  account_id: z.string().uuid(),
  is_active: z.coerce.boolean().default(true),
});

export async function registerCoaRolesRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/coa-roles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return client.query(
        `
          WITH roles AS (
            SELECT unnest($1::text[]) AS role
          )
          SELECT
            r.role,
            car.id::text AS id,
            car.account_id::text AS account_id,
            a.account_number,
            a.account_name,
            COALESCE(car.is_active, false) AS is_active,
            car.updated_at::text AS updated_at
          FROM roles r
          LEFT JOIN LATERAL (
            SELECT *
            FROM accounting.chart_of_accounts_roles x
            WHERE x.operating_company_id = $2::uuid
              AND x.role = r.role
              AND x.is_active = true
            ORDER BY x.updated_at DESC
            LIMIT 1
          ) car ON true
          LEFT JOIN catalogs.accounts a ON a.id = car.account_id
          ORDER BY r.role ASC
        `,
        [COA_ROLE_VALUES, query.data.operating_company_id]
      );
    });

    return { rows: rows.rows };
  });

  app.put("/api/v1/accounting/coa-roles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = upsertBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await client.query(
        `
          UPDATE accounting.chart_of_accounts_roles
          SET is_active = false,
              updated_at = now(),
              updated_by_user_id = $3::uuid
          WHERE operating_company_id = $1::uuid
            AND role = $2
            AND is_active = true
        `,
        [query.data.operating_company_id, body.data.role, user.uuid]
      );

      const upserted = await client.query(
        `
          INSERT INTO accounting.chart_of_accounts_roles (
            operating_company_id,
            role,
            account_id,
            is_active,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $5::uuid)
          RETURNING id::text
        `,
        [query.data.operating_company_id, body.data.role, body.data.account_id, body.data.is_active, user.uuid]
      );
      const id = (upserted.rows[0] as { id?: string } | undefined)?.id;
      if (!id) return { code: 500 as const, error: "coa_role_upsert_failed" };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.coa_role.updated",
        {
          resource_type: "accounting.chart_of_accounts_roles",
          resource_id: id,
          operating_company_id: query.data.operating_company_id,
          role: body.data.role,
          account_id: body.data.account_id,
          is_active: body.data.is_active,
        },
        "info",
        "BLOCK-35-COA-ROLES"
      );

      return { code: 200 as const, data: { id } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  app.get("/api/v1/accounting/coa-roles/validate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const status = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const company = await client.query(
        `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
        [query.data.operating_company_id]
      );
      const companyCode = String((company.rows[0] as { code?: string } | undefined)?.code ?? "");
      const required = requiredCoaRolesForCompanyCode(companyCode);

      const rows = await client.query(
        `
          SELECT role
          FROM accounting.chart_of_accounts_roles
          WHERE operating_company_id = $1::uuid
            AND is_active = true
        `,
        [query.data.operating_company_id]
      );
      const mapped = new Set<string>(
        rows.rows.map((row: unknown) => String((row as { role?: string }).role ?? ""))
      );
      const missing = required.filter((role) => !mapped.has(role));

      // Posting-flag readiness. `valid` above only covers REQUIRED roles, so it reported true while
      // three posting features were dead on every entity — their roles are classed optional. A poster
      // with an unbound role THROWS on first use, so an unbound optional role is not a cosmetic gap.
      // Flag state MUST come from isEnabled(), never a raw read of lib.feature_flag_overrides. An
      // override row is only half the answer: isEnabled also applies the flag's `default_enabled` and
      // the posting OFF short-circuit. Reading the override table directly would report a
      // default-enabled flag with no override row as OFF — under-reporting exactly the armed-but-
      // blocked state this endpoint exists to surface. verify-per-entity-only-flag-gates caught this.
      const enabledFlags = new Set<string>();
      for (const flagKey of Object.keys(loadPostingFlagRequirements().requirements)) {
        if (await isEnabled(client, flagKey, { operating_company_id: query.data.operating_company_id })) {
          enabledFlags.add(flagKey);
        }
      }
      const featureReadiness = computePostingFeatureReadiness(mapped, enabledFlags);

      return {
        company_code: companyCode || null,
        required_roles: required,
        all_roles: COA_ROLE_VALUES,
        mapped_roles: Array.from(mapped.values()).sort(),
        missing_roles: missing,
        valid: missing.length === 0,
        posting_feature_readiness: featureReadiness,
        posting_features_blocked: featureReadiness.filter((f) => !f.ready).length,
        posting_features_armed_but_blocked: featureReadiness.filter((f) => f.armed_but_blocked).length,
      };
    });

    return status;
  });
}
