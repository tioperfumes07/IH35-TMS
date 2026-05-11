import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type ResolveInput = {
  violationUuid: string;
  operatingCompanyId: string;
  outcome: "warning" | "written_reprimand" | "monetary_fine" | "termination" | "dismissed";
  resolutionNotes: string;
  fineAmountCentsOverride?: number;
  resolvedByUserUuid: string;
};

export async function resolveCompanyViolation(input: ResolveInput): Promise<{
  violationUuid: string;
  autoCreatedInternalFineUuid: string | null;
  finalAmountCents: number | null;
}> {
  return withCurrentUser(input.resolvedByUserUuid, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operatingCompanyId}'`);

    const existingRes = await client.query<{
      id: string;
      status: string;
      violation_type_uuid: string | null;
      violation_type_id: string | null;
      violation_type: string | null;
      fine_amount_cents_override: number | null;
    }>(
      `
        SELECT id, status, violation_type_uuid::text, violation_type_id::text, violation_type, fine_amount_cents_override
        FROM safety.company_violations
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [input.violationUuid, input.operatingCompanyId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new Error("E_VIOLATION_NOT_FOUND");
    }
    if (existing.status === "closed") {
      throw new Error("E_VIOLATION_ALREADY_RESOLVED");
    }

    let finalAmountCents: number | null = null;
    if (input.outcome === "monetary_fine") {
      const amountRes = await client.query<{ amount_cents: number | null }>(
        `
          SELECT amount_cents
          FROM catalogs.company_violation_types
          WHERE operating_company_id = $1
            AND (
              id = COALESCE($2::uuid, $3::uuid)
              OR type_code = COALESCE($4, '')
            )
          ORDER BY id
          LIMIT 1
        `,
        [input.operatingCompanyId, existing.violation_type_uuid, existing.violation_type_id, existing.violation_type]
      );
      const defaultAmount = amountRes.rows[0]?.amount_cents ?? null;
      finalAmountCents = input.fineAmountCentsOverride ?? defaultAmount;
      if (!finalAmountCents || finalAmountCents <= 0) {
        throw new Error("E_VIOLATION_AMOUNT_REQUIRED");
      }
    }

    const updateRes = await client.query<{
      id: string;
      auto_created_internal_fine_uuid: string | null;
      fine_amount_cents_override: number | null;
    }>(
      `
        UPDATE safety.company_violations
        SET
          outcome = $3,
          status = 'closed',
          fine_amount_cents_override = CASE
            WHEN $3 = 'monetary_fine' THEN COALESCE($4, fine_amount_cents_override)
            ELSE fine_amount_cents_override
          END,
          notes = COALESCE(notes || E'\n', '') || $5,
          updated_by_user_id = $6,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, auto_created_internal_fine_uuid::text, fine_amount_cents_override
      `,
      [
        input.violationUuid,
        input.operatingCompanyId,
        input.outcome,
        input.fineAmountCentsOverride ?? null,
        input.resolutionNotes,
        input.resolvedByUserUuid,
      ]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      throw new Error("E_VIOLATION_NOT_FOUND");
    }

    await appendCrudAudit(
      client,
      input.resolvedByUserUuid,
      "safety.company_violation.resolved",
      {
        resource_type: "safety.company_violations",
        resource_id: updated.id,
        operating_company_id: input.operatingCompanyId,
        outcome: input.outcome,
        final_amount_cents: finalAmountCents,
      },
      "info",
      "P6-S1"
    );

    if (updated.auto_created_internal_fine_uuid) {
      await appendCrudAudit(
        client,
        input.resolvedByUserUuid,
        "safety.company_violation.auto_fine_created",
        {
          resource_type: "safety.company_violations",
          resource_id: updated.id,
          internal_fine_id: updated.auto_created_internal_fine_uuid,
          amount_cents: finalAmountCents,
          operating_company_id: input.operatingCompanyId,
        },
        "info",
        "P6-S1"
      );
    }

    return {
      violationUuid: updated.id,
      autoCreatedInternalFineUuid: updated.auto_created_internal_fine_uuid,
      finalAmountCents: finalAmountCents ?? updated.fine_amount_cents_override ?? null,
    };
  });
}
