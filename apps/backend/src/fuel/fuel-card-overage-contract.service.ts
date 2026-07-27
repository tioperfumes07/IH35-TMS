/**
 * FUEL-03 — contract authority gate for driver fuel-overage recovery.
 *
 * Owner A3/A3c: a driver receivable is allowed ONLY when a signed driver contract exists
 * (signed_electronically or signed_on_paper with scan attached). Mirrors escrow-target.service.ts.
 */
import type { PoolClient } from "pg";

export type FuelOverageContractAuthority = {
  hasContractAuthority: boolean;
  /** Human-readable reason when authority is absent (for review_reason on the event). */
  denialReason: string | null;
};

export async function resolveFuelOverageContractAuthority(
  client: PoolClient,
  args: { driverId: string; operatingCompanyId: string }
): Promise<FuelOverageContractAuthority> {
  const res = await client.query<{ has_signed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM legal.contract_instances ci
         WHERE ci.signer_type = 'driver'
           AND ci.signer_entity_id = $1::uuid
           AND ci.operating_company_id = $2::uuid
           AND ci.status::text IN ('signed_electronically', 'signed_on_paper')
           AND ci.signed_at IS NOT NULL
           AND ci.voided_at IS NULL
           AND (ci.status::text <> 'signed_on_paper' OR ci.signed_pdf_attachment_id IS NOT NULL)
      ) AS has_signed
    `,
    [args.driverId, args.operatingCompanyId]
  );

  const hasSigned = Boolean(res.rows[0]?.has_signed);
  if (hasSigned) {
    return { hasContractAuthority: true, denialReason: null };
  }

  return {
    hasContractAuthority: false,
    denialReason:
      "No signed driver contract with fuel-recovery authority (signed_on_paper requires attached scan)",
  };
}
