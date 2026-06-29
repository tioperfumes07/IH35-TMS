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

// Driver deduction authorization templates (consent for settlement deductions, FLSA).
const DEDUCTION_AUTH_TEMPLATE_CODES = [
  "driver_deduction_auth",
  "driver_deduction_authorization",
];

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
  if (DEDUCTION_AUTH_TEMPLATE_CODES.includes(instance.template_code) && instance.signer_type === "driver" && instance.signer_entity_id) {
    await writeContractInstanceLink(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      linkType: "deduction_schedule",
      targetSchema: "mdata",
      targetTable: "drivers",
      targetId: instance.signer_entity_id,
      actorUserId: actor,
      notes: "Signed FLSA deduction authorization — consent gate for FIN-18 settlement posting",
    });
    await appendContractAuditLog(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      eventType: "contract_deduction_consent_recorded",
      eventPayload: { driver_id: instance.signer_entity_id, template_code: instance.template_code },
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
      await client.query(
        `SELECT events.log_event(
          $1, 'lease.signed', 'user', $2,
          'document', $3,
          $4::jsonb, now(), 'legal', 'legal.contract_instances', $3::uuid, $2::uuid, NULL
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

// Consent gate consumed by FIN-18: is there an active signed deduction authorization
// on file for this driver? FIN-18 MUST call this and block any deduction post if false.
export async function hasSignedDeductionAuthorization(
  client: QueryableClient,
  args: { operatingCompanyId: string; driverId: string }
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT 1
      FROM legal.contract_instances ci
      WHERE ci.operating_company_id = $1
        AND ci.signer_type = 'driver'
        AND ci.signer_entity_id = $2
        AND ci.status = 'signed_electronically'
        AND ci.voided_at IS NULL
        AND ci.template_code = ANY($3)
      LIMIT 1
    `,
    [args.operatingCompanyId, args.driverId, DEDUCTION_AUTH_TEMPLATE_CODES]
  );
  return res.rows.length > 0;
}
