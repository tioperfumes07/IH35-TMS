import type { PoolClient } from "pg";

/**
 * SAF-F09 — resolve a driver's escrow target and whether a signed clause authorises forfeiture.
 *
 * WHY THIS EXISTS
 * `apps/frontend/src/api/driverFinance.ts` carried `const ESCROW_TARGET_DEFAULT = 1000` and computed
 * every driver's accumulation percentage against it — a number invented in the client, driving math
 * on real money. Verified on the prod branch before this was written: there was NO escrow config
 * store anywhere in the database (no %escrow%target% / %escrow%max% column, no %escrow%config%
 * table), so that constant was not overriding a setting — there was no setting.
 *
 * OWNER DECISION 2026-07-24: "escrow the maximum we usually keep is 2500.00" → 250000 cents,
 * per entity, configurable. Never a code constant.
 *
 * RESOLUTION ORDER (most specific wins):
 *   1. signed hire-contract target — DEFERRED, see below.
 *   2. driver_finance.driver_pay_settings.escrow_target_cents  (per-driver override)
 *   3. driver_finance.escrow_settings.escrow_target_cents      (per-entity default, seeded 250000)
 * If none resolves, this returns null and the caller must NOT invent one. A missing target means the
 * percentage is unknown, and "unknown" must render as unknown — reintroducing a fallback constant
 * here would recreate the exact defect.
 *
 * has_signed_clause — the forfeiture gate.
 * It previously came from `postClause > 0 || timeline.some(bucket === 'post_clause')`: an INFERENCE
 * from a data side-effect, gating the forfeiture of a driver's money. Escrow accumulating past a
 * bucket boundary is not evidence that anyone signed anything. It now reads a real signed contract:
 * a legal.contract_instances row for this driver with status 'signed_electronically', signed_at set
 * and voided_at null.
 *
 * DECLARED DEFERRAL (verified on prod, not assumed): legal.contract_instances has NO escrow-target
 * and NO escrow-clause column, and 0 rows. So (a) the per-contract TARGET OVERRIDE is deferred to
 * the Legal-contract block, and (b) has_signed_clause is wired to the best REAL signal available —
 * the existence of a signed, non-voided driver contract — rather than remaining a side-effect
 * inference. When Legal carries a per-contract escrow clause/target, this resolver is where it slots
 * in, at position 1.
 */

export type EscrowTargetResolution = {
  /** Target in cents, or null when no configuration exists. NEVER a hardcoded fallback. */
  targetCents: number | null;
  /** Where the number came from — surfaced so the UI can say "entity default" vs "per driver". */
  source: "driver_override" | "entity_default" | "none";
  /** True only when a signed, non-voided contract instance exists for this driver. */
  hasSignedClause: boolean;
};

export async function resolveDriverEscrowTarget(
  client: PoolClient,
  args: { driverId: string; operatingCompanyId: string }
): Promise<EscrowTargetResolution> {
  const { driverId, operatingCompanyId } = args;

  const res = await client.query<{
    driver_override_cents: string | null;
    entity_default_cents: string | null;
    has_signed_clause: boolean;
  }>(
    `
      SELECT
        (SELECT dps.escrow_target_cents
           FROM driver_finance.driver_pay_settings dps
          WHERE dps.driver_id = $1::uuid
            AND dps.operating_company_id = $2::uuid
          LIMIT 1) AS driver_override_cents,
        (SELECT es.escrow_target_cents
           FROM driver_finance.escrow_settings es
          WHERE es.operating_company_id = $2::uuid
            AND es.is_active
          LIMIT 1) AS entity_default_cents,
        EXISTS (
          SELECT 1
          FROM legal.contract_instances ci
          WHERE ci.signer_type = 'driver'
            AND ci.signer_entity_id = $1::uuid
            AND ci.operating_company_id = $2::uuid
            AND ci.status = 'signed_electronically'
            AND ci.signed_at IS NOT NULL
            AND ci.voided_at IS NULL
        ) AS has_signed_clause
    `,
    [driverId, operatingCompanyId]
  );

  const row = res.rows[0];
  const driverOverride = row?.driver_override_cents == null ? null : Number(row.driver_override_cents);
  const entityDefault = row?.entity_default_cents == null ? null : Number(row.entity_default_cents);

  if (driverOverride != null) {
    return { targetCents: driverOverride, source: "driver_override", hasSignedClause: Boolean(row?.has_signed_clause) };
  }
  if (entityDefault != null) {
    return { targetCents: entityDefault, source: "entity_default", hasSignedClause: Boolean(row?.has_signed_clause) };
  }
  return { targetCents: null, source: "none", hasSignedClause: Boolean(row?.has_signed_clause) };
}

/**
 * Accumulation percentage against the resolved target.
 * Returns null when there is no target — an unknown percentage must stay unknown rather than being
 * computed against an invented denominator.
 */
export function escrowAccumulationPct(balanceCents: number, targetCents: number | null): number | null {
  if (targetCents == null || targetCents <= 0) return null;
  return Math.max(0, Math.min(100, (balanceCents / targetCents) * 100));
}
