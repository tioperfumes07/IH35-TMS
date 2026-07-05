// Legal Phase 5 — financial HANDOFF only (Option B; see
// docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md +
// docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md).
//
// SEPARATION OF DUTIES (Jorge-locked 2026-06-29): the module that captures consent
// must NOT post money. This module ONLY:
//   - writes legal.contract_instance_links (link_type='deduction_schedule' | 'fixed_asset')
//   - emits ONE events.log_event so Finance (FIN-22) can pick a signed lease up
//   - exposes the consent-gate read FIN-18 consumes before any deduction posts
// It contains ZERO classification, ZERO schedule math, ZERO journal entries, ZERO GL.
// The ASC 842 engine (FIN-22), the deduction->GL engine (FIN-18), and amortization
// (FIN-21) OWN all posting. Money flags are Finance-owned and never flipped here.
//
// CI guard scripts/verify-steps/*-verify-legal-no-gl-posting.mjs fails the build if the
// Legal module ever inserts into accounting.journal_entry_postings / journal_entries or
// imports a posting engine.

import { writeContractInstanceLink } from "./signed-links.service.js";
import { appendContractAuditLog } from "./templates.service.js";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

// Driver deduction authorization templates (legacy/standalone consent for settlement
// deductions, FLSA). Per the owner-LOCKED decision (2026-07-04/2026-07-05 — memory
// audit-fix-decisions-2026-07-04 §F + finance-build-directive-and-driver-model): there is
// NO separate driver-facing deduction-authorization e-sign. These codes are retained only
// so any pre-existing signed instance still satisfies the gate; the PRIMARY authorizing
// document is the signed HIRE CONTRACT below (see isHireContractTemplateCode).
const DEDUCTION_AUTH_TEMPLATE_CODES = [
  "driver_deduction_auth",
  "driver_deduction_authorization",
];

// HIRE-CONTRACT template codes — the OWNER-LOCKED authorizing document for payroll/settlement
// deductions. Lock (Jorge): "the signed hire contract authorizes payroll deductions → satisfy
// the CONSENT_MISSING gate on that basis; do NOT build a separate driver e-sign flow. The
// hire-contract template gets built in the Legal module later and carries the authorization
// for new drivers." That future Legal build MUST register its driver hire/employment agreement
// under one of these codes (or add its code HERE) or the deduction-consent gate stays
// fail-closed. Matched like isLeaseTemplateCode: explicit canonical codes + a `driver_hire_`
// convention prefix. NDAs (nda_*) are category='employment' but are NOT hire contracts and are
// deliberately EXCLUDED — an NDA must never authorize a payroll deduction.
const HIRE_CONTRACT_TEMPLATE_CODES = [
  "driver_hire_contract",
  "driver_hire_agreement",
  "driver_employment_agreement",
  "driver_master_agreement",
];

function isHireContractTemplateCode(code: string): boolean {
  return HIRE_CONTRACT_TEMPLATE_CODES.includes(code) || code.startsWith("driver_hire");
}

// A signed instance of ANY of these template codes authorizes settlement/payroll deductions
// for the driver who signed it. Hire contract is the primary path; the legacy standalone
// deduction-auth codes remain accepted for backward compatibility.
function authorizesDeductions(code: string): boolean {
  return isHireContractTemplateCode(code) || DEDUCTION_AUTH_TEMPLATE_CODES.includes(code);
}

function isLeaseTemplateCode(code: string): boolean {
  return code.startsWith("lease_") || code === "truck_lease" || code === "lease_to_own";
}

type HandoffInstance = {
  id: string;
  template_code: string;
  signer_type: string;
  signer_entity_id: string | null;
  filled_variables: Record<string, unknown>;
  created_by_user_id: string | null;
};

async function loadHandoffInstance(
  client: QueryableClient,
  operatingCompanyId: string,
  contractInstanceId: string
): Promise<HandoffInstance | null> {
  const res = await client.query(
    `
      SELECT id, template_code, signer_type, signer_entity_id, filled_variables, created_by_user_id
      FROM legal.contract_instances
      WHERE operating_company_id = $1 AND id = $2
      LIMIT 1
    `,
    [operatingCompanyId, contractInstanceId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    template_code: String(row.template_code),
    signer_type: String(row.signer_type),
    signer_entity_id: row.signer_entity_id ? String(row.signer_entity_id) : null,
    filled_variables:
      row.filled_variables && typeof row.filled_variables === "object" && !Array.isArray(row.filled_variables)
        ? (row.filled_variables as Record<string, unknown>)
        : {},
    created_by_user_id: row.created_by_user_id ? String(row.created_by_user_id) : null,
  };
}

function readUnitIds(filled: Record<string, unknown>): string[] {
  const raw = filled.exhibit_a_unit_ids;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function applySignedFinanceHandoff(
  client: QueryableClient,
  args: { operatingCompanyId: string; contractInstanceId: string; actorUserId?: string | null }
) {
  const instance = await loadHandoffInstance(client, args.operatingCompanyId, args.contractInstanceId);
  if (!instance) return { handoff: null as null | string };
  const actor = args.actorUserId ?? instance.created_by_user_id;

  // --- Deduction authorization consent handoff (FIN-18 consumes the gate) ---
  // Fires for the signed HIRE CONTRACT (primary, owner-locked authorizing document) OR a legacy
  // standalone deduction-auth instance. Writes the driver -> signed-contract -> deduction_schedule
  // link (Law of the Land: wired both directions — forward via idx_..._instance, reverse via
  // idx_..._target so "what signed contract authorizes this driver's deductions?" is answerable).
  if (authorizesDeductions(instance.template_code) && instance.signer_type === "driver" && instance.signer_entity_id) {
    const viaHireContract = isHireContractTemplateCode(instance.template_code);
    await writeContractInstanceLink(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      linkType: "deduction_schedule",
      targetSchema: "mdata",
      targetTable: "drivers",
      targetId: instance.signer_entity_id,
      actorUserId: actor,
      notes: viaHireContract
        ? "Signed hire contract — payroll/settlement deduction authorization (consent gate for FIN-18)"
        : "Signed FLSA deduction authorization — consent gate for FIN-18 settlement posting",
    });
    await appendContractAuditLog(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      eventType: "contract_deduction_consent_recorded",
      eventPayload: {
        driver_id: instance.signer_entity_id,
        template_code: instance.template_code,
        via_hire_contract: viaHireContract,
      },
      actorUserId: actor,
    });
    return { handoff: "deduction_schedule" };
  }

  // --- Lease handoff to FIN-22 (fixed_asset links + one lease.signed event) ---
  if (isLeaseTemplateCode(instance.template_code)) {
    const unitIds = readUnitIds(instance.filled_variables);
    const election = String(instance.filled_variables.asc842_election ?? "unspecified");
    for (const unitId of unitIds) {
      await writeContractInstanceLink(client, {
        operatingCompanyId: args.operatingCompanyId,
        contractInstanceId: instance.id,
        linkType: "fixed_asset",
        targetSchema: "mdata",
        targetTable: "units",
        targetId: unitId,
        actorUserId: actor,
        notes: `Lease Exhibit-A unit; ASC 842 election=${election} (FIN-22 classifies/posts)`,
      });
    }

    // One handoff event for FIN-22. subject_type='document' + event_type 'lease.signed'
    // are within the events.event_log allowlist (verified live). Actor must be non-null
    // (actor_id is NOT NULL) — use the instance creator.
    if (actor) {
      // Distinct placeholders per position — reusing $2/$3 as both text (actor_id/subject_id)
      // and ::uuid (actor_user_id/source_reference_id) makes Postgres fail with "inconsistent
      // types deduced for parameter". $5/$6 repeat the same values with their own casts.
      await client.query(
        `SELECT events.log_event(
          $1, 'lease.signed', 'user', $2,
          'document', $3,
          $4::jsonb, now(), 'legal', 'legal.contract_instances', $5::uuid, $6::uuid, NULL
        )`,
        [
          args.operatingCompanyId,
          actor,
          instance.id,
          JSON.stringify({
            template_code: instance.template_code,
            asc842_election: election,
            exhibit_a_unit_ids: unitIds,
          }),
          instance.id,
          actor,
        ]
      );
    }

    await appendContractAuditLog(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      eventType: "contract_lease_handoff_emitted",
      eventPayload: { template_code: instance.template_code, asc842_election: election, unit_count: unitIds.length },
      actorUserId: actor,
    });
    return { handoff: "fixed_asset" };
  }

  return { handoff: null };
}

// Consent gate consumed by FIN-18: does this driver have a signed authorizing document on
// file for payroll/settlement deductions? Per owner lock, that authorizing document is the
// driver's SIGNED HIRE CONTRACT (a legacy standalone deduction-auth instance also qualifies).
// FIN-18 / recover-from-driver MUST call this and block any deduction post if false.
//
// FAIL-CLOSED by design: a driver with NO signed authorizing contract returns false and no
// deduction posts (correct — an unsigned driver must not be charged). Matching is done in JS
// (not a fixed SQL `= ANY`) so the `driver_hire_` convention prefix is honored the same way
// the handoff recognizes it — one predicate, one source of truth.
export async function hasSignedDeductionAuthorization(
  client: QueryableClient,
  args: { operatingCompanyId: string; driverId: string }
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT ci.template_code
      FROM legal.contract_instances ci
      WHERE ci.operating_company_id = $1
        AND ci.signer_type = 'driver'
        AND ci.signer_entity_id = $2
        AND ci.status = 'signed_electronically'
        AND ci.voided_at IS NULL
    `,
    [args.operatingCompanyId, args.driverId]
  );
  return res.rows.some((r) => authorizesDeductions(String(r.template_code)));
}
