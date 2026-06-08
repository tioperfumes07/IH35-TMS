// GAP-38 / G15 / WF-027 — Damage continuity chain service.
//
// "Damage reports" live in safety.incidents (incident_type='damage_report').
// A continuity chain links the initial damage event to every related damage
// and (via insurance-link.service) to the insurance.claim it produced, so an
// auditor can trace "damage detected -> claim filed -> approved -> settled".
//
// All functions operate on an already tenant-scoped client (the caller is
// expected to have run `SET LOCAL app.operating_company_id = ...`). RLS on
// safety.incidents and safety.damage_continuity_chains enforces isolation.

export type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

export const FINAL_RESOLUTION_STATUSES = [
  "open",
  "claim_filed",
  "claim_approved",
  "claim_denied",
  "self_paid",
  "closed_no_action",
] as const;

export type FinalResolutionStatus = (typeof FINAL_RESOLUTION_STATUSES)[number];

export type DamageContinuityChain = {
  uuid: string;
  operating_company_id: string;
  initial_damage_id: string;
  insurance_claim_id: string | null;
  total_estimated_cost_cents: number;
  total_actual_cost_cents: number;
  final_resolution_status: FinalResolutionStatus | null;
  chain_started_at: string;
  chain_closed_at: string | null;
  audit_summary: unknown;
  created_at: string;
  updated_at: string;
};

const CHAIN_COLUMNS = `
  uuid::text,
  operating_company_id::text,
  initial_damage_id::text,
  insurance_claim_id::text,
  total_estimated_cost_cents::bigint,
  total_actual_cost_cents::bigint,
  final_resolution_status,
  chain_started_at::text,
  chain_closed_at::text,
  audit_summary,
  created_at::text,
  updated_at::text
`;

function auditEventSql(parameterIndex: number) {
  // Appends a single event object onto audit_summary.events (a JSON array),
  // creating the array if it does not yet exist.
  return `
    audit_summary = jsonb_set(
      COALESCE(audit_summary, '{}'::jsonb),
      '{events}',
      COALESCE(audit_summary->'events', '[]'::jsonb) || $${parameterIndex}::jsonb
    )
  `;
}

function auditEvent(action: string, detail: Record<string, unknown> = {}) {
  return JSON.stringify({ action, at: new Date().toISOString(), ...detail });
}

export async function startChain(
  client: Queryable,
  params: { operatingCompanyId: string; initialDamageId: string }
): Promise<
  | { kind: "ok"; chain: DamageContinuityChain }
  | { kind: "damage_not_found" }
  | { kind: "already_in_chain"; chainId: string }
> {
  const damage = await client.query<{
    id: string;
    continuity_chain_id: string | null;
    damage_amount_cents: number;
  }>(
    `
      SELECT id::text, continuity_chain_id::text, damage_amount_cents::bigint
      FROM safety.incidents
      WHERE id = $1::uuid
        AND incident_type = 'damage_report'
        AND operating_company_id::text = current_setting('app.operating_company_id', true)
      LIMIT 1
    `,
    [params.initialDamageId]
  );
  const damageRow = damage.rows[0];
  if (!damageRow) return { kind: "damage_not_found" };
  if (damageRow.continuity_chain_id) {
    return { kind: "already_in_chain", chainId: damageRow.continuity_chain_id };
  }

  const inserted = await client.query<DamageContinuityChain>(
    `
      INSERT INTO safety.damage_continuity_chains (
        operating_company_id,
        initial_damage_id,
        total_estimated_cost_cents,
        final_resolution_status,
        chain_started_at,
        audit_summary
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        'open',
        now(),
        jsonb_build_object('events', jsonb_build_array($4::jsonb))
      )
      RETURNING ${CHAIN_COLUMNS}
    `,
    [
      params.operatingCompanyId,
      params.initialDamageId,
      Number(damageRow.damage_amount_cents ?? 0),
      auditEvent("chain_started", { initial_damage_id: params.initialDamageId }),
    ]
  );
  const chain = inserted.rows[0];

  await client.query(
    `
      UPDATE safety.incidents
      SET continuity_chain_id = $2::uuid,
          final_resolution_status = COALESCE(final_resolution_status, 'open'),
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [params.initialDamageId, chain.uuid]
  );

  return { kind: "ok", chain };
}

export async function appendDamage(
  client: Queryable,
  params: { operatingCompanyId: string; chainId: string; relatedDamageId: string }
): Promise<
  | { kind: "ok"; chain: DamageContinuityChain }
  | { kind: "chain_not_found" }
  | { kind: "damage_not_found" }
  | { kind: "already_in_other_chain"; chainId: string }
> {
  const chainRes = await client.query<{ uuid: string; initial_damage_id: string }>(
    `
      SELECT uuid::text, initial_damage_id::text
      FROM safety.damage_continuity_chains
      WHERE uuid = $1::uuid
      LIMIT 1
    `,
    [params.chainId]
  );
  const chainRow = chainRes.rows[0];
  if (!chainRow) return { kind: "chain_not_found" };

  const damage = await client.query<{ id: string; continuity_chain_id: string | null }>(
    `
      SELECT id::text, continuity_chain_id::text
      FROM safety.incidents
      WHERE id = $1::uuid
        AND incident_type = 'damage_report'
        AND operating_company_id::text = current_setting('app.operating_company_id', true)
      LIMIT 1
    `,
    [params.relatedDamageId]
  );
  const damageRow = damage.rows[0];
  if (!damageRow) return { kind: "damage_not_found" };
  if (damageRow.continuity_chain_id && damageRow.continuity_chain_id !== params.chainId) {
    return { kind: "already_in_other_chain", chainId: damageRow.continuity_chain_id };
  }

  await client.query(
    `
      UPDATE safety.incidents
      SET continuity_chain_id = $2::uuid,
          parent_incident_id = $3::uuid,
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [params.relatedDamageId, params.chainId, chainRow.initial_damage_id]
  );

  const updated = await client.query<DamageContinuityChain>(
    `
      UPDATE safety.damage_continuity_chains AS c
      SET total_estimated_cost_cents = COALESCE((
            SELECT SUM(i.damage_amount_cents)::bigint
            FROM safety.incidents i
            WHERE i.continuity_chain_id = c.uuid
          ), 0),
          ${auditEventSql(2)},
          updated_at = now()
      WHERE c.uuid = $1::uuid
      RETURNING ${CHAIN_COLUMNS}
    `,
    [params.chainId, auditEvent("damage_appended", { related_damage_id: params.relatedDamageId })]
  );

  return { kind: "ok", chain: updated.rows[0] };
}

export async function closeChain(
  client: Queryable,
  params: {
    operatingCompanyId: string;
    chainId: string;
    finalResolutionStatus: FinalResolutionStatus;
    totalActualCostCents?: number;
  }
): Promise<{ kind: "ok"; chain: DamageContinuityChain } | { kind: "chain_not_found" }> {
  const updated = await client.query<DamageContinuityChain>(
    `
      UPDATE safety.damage_continuity_chains
      SET final_resolution_status = $2,
          total_actual_cost_cents = COALESCE($3, total_actual_cost_cents),
          chain_closed_at = now(),
          ${auditEventSql(4)},
          updated_at = now()
      WHERE uuid = $1::uuid
      RETURNING ${CHAIN_COLUMNS}
    `,
    [
      params.chainId,
      params.finalResolutionStatus,
      params.totalActualCostCents ?? null,
      auditEvent("chain_closed", { final_resolution_status: params.finalResolutionStatus }),
    ]
  );
  const chain = updated.rows[0];
  if (!chain) return { kind: "chain_not_found" };

  await client.query(
    `
      UPDATE safety.incidents
      SET final_resolution_status = $2,
          updated_at = now()
      WHERE continuity_chain_id = $1::uuid
    `,
    [params.chainId, params.finalResolutionStatus]
  );

  return { kind: "ok", chain };
}

export type ChainDamage = {
  id: string;
  incident_type: string;
  status: string;
  incident_at: string;
  damage_amount_cents: number;
  location: string;
  description: string;
  parent_incident_id: string | null;
  final_resolution_status: FinalResolutionStatus | null;
};

export type ChainClaim = {
  id: string;
  claim_number: string;
  status: string;
  amount_claimed_cents: number;
  amount_paid_cents: number;
};

export async function getChain(
  client: Queryable,
  params: { operatingCompanyId: string; chainId: string }
): Promise<
  | { kind: "ok"; chain: DamageContinuityChain; damages: ChainDamage[]; claim: ChainClaim | null }
  | { kind: "chain_not_found" }
> {
  const chainRes = await client.query<DamageContinuityChain>(
    `
      SELECT ${CHAIN_COLUMNS}
      FROM safety.damage_continuity_chains
      WHERE uuid = $1::uuid
      LIMIT 1
    `,
    [params.chainId]
  );
  const chain = chainRes.rows[0];
  if (!chain) return { kind: "chain_not_found" };

  const damagesRes = await client.query<ChainDamage>(
    `
      SELECT id::text,
             incident_type,
             status,
             incident_at::text,
             damage_amount_cents::bigint,
             location,
             description,
             parent_incident_id::text,
             final_resolution_status
      FROM safety.incidents
      WHERE continuity_chain_id = $1::uuid
      ORDER BY incident_at ASC
    `,
    [params.chainId]
  );

  let claim: ChainClaim | null = null;
  if (chain.insurance_claim_id) {
    const claimRes = await client.query<ChainClaim>(
      `
        SELECT id::text,
               claim_number,
               status,
               amount_claimed_cents::bigint,
               amount_paid_cents::bigint
        FROM insurance.claim
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [chain.insurance_claim_id]
    );
    claim = claimRes.rows[0] ?? null;
  }

  return { kind: "ok", chain, damages: damagesRes.rows, claim };
}
