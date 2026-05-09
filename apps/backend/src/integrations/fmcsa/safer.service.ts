import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { lookupCarrierByMC, lookupCarrierByUSDOT, type CarrierResult } from "../../lib/fmcsa-client.js";

type LookupType = "mc" | "usdot";

type CustomerForCheck = {
  id: string;
  operating_company_id: string;
  customer_name: string;
  mc_number: string | null;
  dot_number: string | null;
  fmcsa_verified_at: string | null;
  fmcsa_last_checked_at: string | null;
  fmcsa_check_response: unknown;
};

function normalizeValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickLookup(customer: CustomerForCheck): { type: LookupType; value: string } | null {
  const mc = normalizeValue(customer.mc_number);
  if (mc) return { type: "mc", value: mc };
  const usdot = normalizeValue(customer.dot_number);
  if (usdot) return { type: "usdot", value: usdot };
  return null;
}

function hasFreshCustomerCache(customer: CustomerForCheck) {
  if (!customer.fmcsa_last_checked_at) return false;
  const lastCheckedMs = new Date(customer.fmcsa_last_checked_at).getTime();
  if (!Number.isFinite(lastCheckedMs)) return false;
  return Date.now() - lastCheckedMs < 24 * 60 * 60 * 1000;
}

async function loadCustomer(actorUserId: string, customerId: string): Promise<CustomerForCheck | null> {
  return withCurrentUser(actorUserId, async (client) => {
    const res = await client.query(
      `
        SELECT
          id,
          operating_company_id,
          customer_name,
          mc_number,
          dot_number,
          fmcsa_verified_at,
          fmcsa_last_checked_at,
          fmcsa_check_response
        FROM mdata.customers
        WHERE id = $1
        LIMIT 1
      `,
      [customerId]
    );
    return (res.rows[0] as CustomerForCheck | undefined) ?? null;
  });
}

type VerifyOptions = {
  customerId: string;
  actorUserId: string;
  force?: boolean;
};

export async function verifyCustomerWithSafer(options: VerifyOptions) {
  const { customerId, actorUserId, force = false } = options;
  const customer = await loadCustomer(actorUserId, customerId);
  if (!customer) return { customer: null, reason: "not_found" as const };

  if (!force && hasFreshCustomerCache(customer)) {
    return { customer, reason: "cached_24h" as const };
  }

  const lookup = pickLookup(customer);
  if (!lookup) {
    const updated = await withCurrentUser(actorUserId, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.customers
          SET
            fmcsa_verified_at = NULL,
            fmcsa_lookup_id = NULL,
            fmcsa_authority_status_at_verification = NULL,
            fmcsa_last_checked_at = now(),
            fmcsa_check_response = jsonb_build_object(
              'status', 'skipped',
              'reason', 'missing_mc_or_usdot',
              'checked_at', now()
            ),
            updated_by_user_id = $2
          WHERE id = $1
          RETURNING *
        `,
        [customerId, actorUserId]
      );
      return res.rows[0] ?? null;
    });
    return { customer: updated, reason: "missing_lookup_input" as const };
  }

  let carrier: CarrierResult | null = null;
  let fetchError: string | null = null;
  try {
    carrier = lookup.type === "mc" ? await lookupCarrierByMC(lookup.value) : await lookupCarrierByUSDOT(lookup.value);
  } catch {
    fetchError = "lookup_failed";
  }

  const updated = await withCurrentUser(actorUserId, async (client) => {
    let lookupId: string | null = null;
    if (carrier) {
      const insertedLookup = await client.query(
        `
          INSERT INTO catalogs.fmcsa_lookups (
            operating_company_id,
            lookup_type,
            lookup_value,
            legal_name,
            dba_name,
            usdot_number,
            mc_number,
            address_line1,
            city,
            state,
            zip,
            phone,
            authority_status,
            insurance_status,
            safety_rating,
            raw_response_json,
            fetched_at,
            cached_until,
            created_by_user_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16::jsonb, now(), now() + interval '7 days', $17
          )
          RETURNING id
        `,
        [
          customer.operating_company_id,
          lookup.type,
          lookup.value,
          carrier.legal_name,
          carrier.dba_name,
          carrier.usdot_number,
          carrier.mc_number,
          carrier.address.line1,
          carrier.address.city,
          carrier.address.state,
          carrier.address.zip,
          carrier.phone,
          carrier.authority_status,
          carrier.insurance_status,
          carrier.safety_rating,
          JSON.stringify(carrier.raw ?? {}),
          actorUserId,
        ]
      );
      lookupId = (insertedLookup.rows[0]?.id as string | undefined) ?? null;
    }

    const authorityStatus = carrier?.authority_status ?? "NONE";
    const verifiedAt = authorityStatus === "ACTIVE" ? "now()" : "NULL";

    const customerUpdate = await client.query(
      `
        UPDATE mdata.customers
        SET
          fmcsa_verified_at = ${verifiedAt},
          fmcsa_lookup_id = $2,
          fmcsa_authority_status_at_verification = $3,
          fmcsa_last_checked_at = now(),
          fmcsa_check_response = $4::jsonb,
          updated_by_user_id = $5
        WHERE id = $1
        RETURNING *
      `,
      [
        customerId,
        lookupId,
        authorityStatus,
        JSON.stringify(
          carrier
            ? {
                status: "ok",
                authority_status: carrier.authority_status,
                legal_name: carrier.legal_name,
                common_name: carrier.dba_name,
                insurance_status: carrier.insurance_status,
                lookup_type: lookup.type,
                checked_at: new Date().toISOString(),
              }
            : {
                status: "error",
                reason: fetchError ?? "not_found",
                lookup_type: lookup.type,
                checked_at: new Date().toISOString(),
              }
        ),
        actorUserId,
      ]
    );

    const updatedCustomer = customerUpdate.rows[0] ?? null;
    if (updatedCustomer) {
      await appendCrudAudit(
        client,
        actorUserId,
        "mdata.customer.fmcsa_auto_verified",
        {
          resource_id: updatedCustomer.id,
          resource_type: "mdata.customers",
          customer_id: updatedCustomer.id,
          authority_status: authorityStatus,
          automated: true,
        },
        authorityStatus === "ACTIVE" ? "info" : "warning",
        "P3-T11.21-FMCSA-VERIFICATION"
      );
    }

    return updatedCustomer;
  });

  return { customer: updated, reason: carrier ? "verified" as const : "lookup_failed_or_not_found" as const };
}
