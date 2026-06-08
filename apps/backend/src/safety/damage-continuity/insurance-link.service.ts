// GAP-38 / G15 / WF-027 — Insurance auto-claim linkage.
//
// WF-027: when a damage report's estimated cost exceeds a threshold, a draft
// insurance claim is auto-created and linked back to the damage event so the
// continuity chain captures "damage detected -> claim filed".
//
// Live schema notes:
//   * Claims are insurance.claim (cents, tenant_id, role ih35_app).
//   * insurance.claim.policy_id is NOT NULL, so an auto-claim must attach to an
//     existing active policy. If the tenant has no usable policy we skip
//     creation and report the reason (no false-positive orphan claims).
//   * insurance.claim.asset_id references mdata.assets, which is NOT the same as
//     safety.incidents.unit_id (mdata.units); we therefore leave asset_id NULL.

import type { Queryable } from "./continuity.service.js";

// $1,000.00 threshold from WF-027, expressed in integer cents.
export const AUTO_CLAIM_THRESHOLD_CENTS = 100_000;

// Coverage types eligible to back an auto-created physical damage / cargo claim,
// most-specific first.
const ELIGIBLE_COVERAGE_TYPES = ["physical_damage", "cargo", "auto_liability"] as const;

export type AutoCreatedClaim = {
  id: string;
  claim_number: string;
  policy_id: string;
  status: string;
  amount_claimed_cents: number;
};

export type AutoCreateClaimResult =
  | { kind: "created"; claim: AutoCreatedClaim }
  | { kind: "already_linked"; claimId: string }
  | { kind: "below_threshold"; damageAmountCents: number; thresholdCents: number }
  | { kind: "incident_not_found" }
  | { kind: "no_active_policy" };

function buildClaimNumber(damageIncidentId: string, reportedDate: Date) {
  const shortId = damageIncidentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const stamp = reportedDate.toISOString().slice(0, 10).replace(/-/g, "");
  return `AUTO-${shortId}-${stamp}`;
}

export async function autoCreateClaimFromDamage(
  client: Queryable,
  params: { operatingCompanyId: string; damageIncidentId: string }
): Promise<AutoCreateClaimResult> {
  const incidentRes = await client.query<{
    id: string;
    damage_amount_cents: number;
    incident_at: string;
    auto_created_claim_id: string | null;
  }>(
    `
      SELECT id::text,
             damage_amount_cents::bigint,
             incident_at::text,
             auto_created_claim_id::text
      FROM safety.incidents
      WHERE id = $1::uuid
        AND incident_type = 'damage_report'
        AND operating_company_id::text = current_setting('app.operating_company_id', true)
      LIMIT 1
    `,
    [params.damageIncidentId]
  );
  const incident = incidentRes.rows[0];
  if (!incident) return { kind: "incident_not_found" };
  if (incident.auto_created_claim_id) {
    return { kind: "already_linked", claimId: incident.auto_created_claim_id };
  }

  const damageAmountCents = Number(incident.damage_amount_cents ?? 0);
  if (damageAmountCents <= AUTO_CLAIM_THRESHOLD_CENTS) {
    return {
      kind: "below_threshold",
      damageAmountCents,
      thresholdCents: AUTO_CLAIM_THRESHOLD_CENTS,
    };
  }

  const policyRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM insurance.policy
      WHERE tenant_id::text = current_setting('app.operating_company_id', true)
        AND status = 'active'
        AND coverage_type = ANY($1::text[])
      ORDER BY array_position($1::text[], coverage_type), expiry_date DESC
      LIMIT 1
    `,
    [[...ELIGIBLE_COVERAGE_TYPES]]
  );
  const policy = policyRes.rows[0];
  if (!policy) return { kind: "no_active_policy" };

  const reportedDate = new Date();
  const claimNumber = buildClaimNumber(params.damageIncidentId, reportedDate);

  const insertRes = await client.query<AutoCreatedClaim>(
    `
      INSERT INTO insurance.claim (
        tenant_id,
        claim_number,
        policy_id,
        asset_id,
        accident_date,
        reported_date,
        status,
        amount_claimed_cents,
        amount_paid_cents,
        notes
      )
      VALUES (
        $1::uuid,
        $2,
        $3::uuid,
        NULL,
        $4::date,
        $5::date,
        'open',
        $6,
        0,
        $7
      )
      ON CONFLICT (tenant_id, claim_number) DO NOTHING
      RETURNING id::text, claim_number, policy_id::text, status, amount_claimed_cents::bigint
    `,
    [
      params.operatingCompanyId,
      claimNumber,
      policy.id,
      incident.incident_at,
      reportedDate.toISOString().slice(0, 10),
      damageAmountCents,
      `Auto-created from damage report ${params.damageIncidentId} per WF-027 (estimate >= $${(
        AUTO_CLAIM_THRESHOLD_CENTS / 100
      ).toFixed(2)}).`,
    ]
  );

  let claim = insertRes.rows[0] ?? null;
  if (!claim) {
    const existing = await client.query<AutoCreatedClaim>(
      `
        SELECT id::text, claim_number, policy_id::text, status, amount_claimed_cents::bigint
        FROM insurance.claim
        WHERE tenant_id::text = current_setting('app.operating_company_id', true)
          AND claim_number = $1
        LIMIT 1
      `,
      [claimNumber]
    );
    claim = existing.rows[0] ?? null;
  }
  if (!claim) return { kind: "no_active_policy" };

  await client.query(
    `
      UPDATE safety.incidents
      SET auto_created_claim_id = $2::uuid,
          final_resolution_status = COALESCE(NULLIF(final_resolution_status, 'open'), 'claim_filed'),
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [params.damageIncidentId, claim.id]
  );

  return { kind: "created", claim };
}

export async function linkClaimToChain(
  client: Queryable,
  params: { operatingCompanyId: string; chainId: string; claimId: string }
): Promise<{ kind: "ok" } | { kind: "chain_not_found" }> {
  const res = await client.query(
    `
      UPDATE safety.damage_continuity_chains
      SET insurance_claim_id = $2::uuid,
          final_resolution_status = CASE
            WHEN final_resolution_status IS NULL OR final_resolution_status = 'open'
            THEN 'claim_filed'
            ELSE final_resolution_status
          END,
          audit_summary = jsonb_set(
            COALESCE(audit_summary, '{}'::jsonb),
            '{events}',
            COALESCE(audit_summary->'events', '[]'::jsonb) || $3::jsonb
          ),
          updated_at = now()
      WHERE uuid = $1::uuid
      RETURNING uuid
    `,
    [
      params.chainId,
      params.claimId,
      JSON.stringify({ action: "claim_linked", at: new Date().toISOString(), claim_id: params.claimId }),
    ]
  );
  if (!res.rows[0]) return { kind: "chain_not_found" };
  return { kind: "ok" };
}
