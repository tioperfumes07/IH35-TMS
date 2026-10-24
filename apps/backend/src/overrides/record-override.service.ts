/**
 * LEAD 443.294 step 2 — the ONE override engine (owner 10-23 8:52 PM: "for the owner and accountant it is just an
 * override button. click confirm etc. for other employees, reason drop down filter list … i dont want to be typing
 * anything").
 *
 * recordOverride(client, input) — every override in the app goes through here, inside the caller's transaction:
 *   • Owner / Accountant may confirm with NO reason → stored as the catalog's role_only owner_override / accountant_override.
 *   • Everyone else MUST pass a reason_code from catalogs.override_reasons (company-scoped) that is active and allowed
 *     in this context; a role_only code is only ever the matching role's own.
 *   • No free text: the input has no note / text field at all.
 *   • Writes ONE audit row (audit.append_event 'override.<context>'): who, role, context, entity, reason, before/after.
 * Returns the stored code + labels so the site keeps the code (never a typed sentence) on its own record.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const OVERRIDE_CONTEXTS = [
  "factoring",
  "expense",
  "load_wizard",
  "settlement",
  "banking",
  "invoice",
  "bill",
  "dispatch",
  "safety",
  "maintenance",
] as const;
export type OverrideContext = (typeof OVERRIDE_CONTEXTS)[number];

/** Roles whose override is a plain confirm (no reason to pick), and the role_only code stored for each. */
export const ROLE_OVERRIDE_CODES: Readonly<Record<string, string>> = Object.freeze({
  Owner: "owner_override",
  Accountant: "accountant_override",
});

export type RecordOverrideInput = {
  operatingCompanyId: string;
  context: OverrideContext;
  entityType: string;
  entityId: string;
  /** Required for every role except Owner / Accountant. Never free text. */
  reasonCode?: string | null;
  actor: { userId: string; role: string };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export type RecordOverrideResult =
  | { ok: true; reason_code: string; reason_id: string; label_en: string; label_es: string; role_override: boolean }
  | {
      ok: false;
      error:
        | "unknown_context"
        | "reason_required"
        | "reason_unknown"
        | "reason_inactive"
        | "reason_not_allowed_in_context"
        | "role_only_reason";
    };

export function isRoleOverrideRole(role: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_OVERRIDE_CODES, role);
}

export async function recordOverride(client: Queryable, input: RecordOverrideInput): Promise<RecordOverrideResult> {
  if (!(OVERRIDE_CONTEXTS as readonly string[]).includes(input.context)) return { ok: false, error: "unknown_context" };
  const roleCode = ROLE_OVERRIDE_CODES[input.actor.role] ?? null;
  const requested = (input.reasonCode ?? "").trim();
  const code = requested || roleCode;
  if (!code) return { ok: false, error: "reason_required" };
  // A role_only code (owner_override / accountant_override) is only ever the matching role's own confirm.
  const roleOnlyCodes = Object.values(ROLE_OVERRIDE_CODES);
  if (roleOnlyCodes.includes(code) && code !== roleCode) return { ok: false, error: "role_only_reason" };

  const row = (
    await client.query<{ id: string; reason_code: string; label_en: string; label_es: string; contexts: string[]; is_active: boolean; role_only: boolean }>(
      `SELECT id::text, reason_code, label_en, label_es, contexts, is_active, role_only
         FROM catalogs.override_reasons
        WHERE operating_company_id = $1::uuid AND reason_code = $2
        LIMIT 1`,
      [input.operatingCompanyId, code]
    )
  ).rows[0];
  if (!row) return { ok: false, error: "reason_unknown" };
  if (!row.is_active) return { ok: false, error: "reason_inactive" };
  if (row.role_only && code !== roleCode) return { ok: false, error: "role_only_reason" };
  if (!row.contexts.includes(input.context)) return { ok: false, error: "reason_not_allowed_in_context" };

  await appendCrudAudit(
    client,
    input.actor.userId,
    `override.${input.context}`,
    {
      operating_company_id: input.operatingCompanyId,
      context: input.context,
      entity_type: input.entityType,
      entity_id: input.entityId,
      reason_code: row.reason_code,
      reason_id: row.id,
      actor_role: input.actor.role,
      role_override: row.role_only,
      before: input.before ?? null,
      after: input.after ?? null,
    },
    "warning",
    "LEAD-443294-OVERRIDE"
  );
  return { ok: true, reason_code: row.reason_code, reason_id: row.id, label_en: row.label_en, label_es: row.label_es, role_override: row.role_only };
}

/** HTTP status for an engine refusal (sites answer with this + { error }). */
export function overrideRefusalStatus(error: Exclude<RecordOverrideResult, { ok: true }>["error"]): number {
  return error === "reason_required" ? 400 : error === "role_only_reason" ? 403 : 422;
}
