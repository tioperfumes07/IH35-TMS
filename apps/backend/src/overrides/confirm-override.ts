/**
 * Row 28 (443.294) — the shared "confirm ONE override through the ONE engine" step every route uses, inside the
 * caller's open transaction (`client`):
 *
 *   • reasonCode  = a catalogs.override_reasons code, or null for an Owner / Accountant plain confirm. recordOverride
 *                   validates it (company-scoped, active, allowed in `context`, role_only only for its own role) and
 *                   writes the 'override.<context>' audit row.
 *   • systemReason = a TRUSTED ENGINE's own attestation line (e.g. the Settlement Creator's automatic Owner override):
 *                   no person to pick a catalog reason. No route schema carries it, so a typed sentence from a screen can
 *                   never reach it.
 *   • The stored line is "<catalog label> [<code>]" so downstream audit / outbox payloads stay human-readable.
 */
import { z } from "zod";
import { overrideRefusalStatus, recordOverride, type OverrideContext, type RecordOverrideResult } from "./record-override.service.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** A catalogs.override_reasons code on the wire (same shape the factoring + onboarding routes accept). */
export const overrideReasonCodeSchema = z.string().trim().regex(/^[a-z][a-z0-9_]*$/).max(80);

/** The only free-text slot an override body may carry is one that is REFUSED: typing a reason is not allowed. */
export function refusedTypedReason(field: string) {
  return z.undefined({ error: `${field}_text_refused: pick a catalog reason_code` }).optional();
}

export type ConfirmedOverride =
  | { ok: true; text: string; reason_code: string | null; role_override: boolean }
  | { ok: false; status: number; error: string };

export function overrideRefusalCode(error: Exclude<RecordOverrideResult, { ok: true }>["error"]): string {
  // The legacy "no reason given" code stays so existing clients keep their message mapping.
  return error === "reason_required" ? "E_OVERRIDE_REASON_REQUIRED" : `override_${error}`;
}

export async function confirmOverride(
  client: Queryable,
  p: {
    context: OverrideContext;
    operatingCompanyId: string;
    actor: { userId: string; role: string };
    reasonCode?: string | null;
    systemReason?: string | null;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }
): Promise<ConfirmedOverride> {
  const code = typeof p.reasonCode === "string" && p.reasonCode.trim() ? p.reasonCode.trim() : null;
  const system = typeof p.systemReason === "string" ? p.systemReason.trim() : "";
  if (!code && system.length >= 10) return { ok: true, text: system, reason_code: null, role_override: false };
  const r = await recordOverride(client, {
    operatingCompanyId: p.operatingCompanyId,
    context: p.context,
    entityType: p.entityType,
    entityId: p.entityId,
    reasonCode: code,
    actor: p.actor,
    before: p.before ?? null,
    after: p.after ?? null,
  });
  if (!r.ok) return { ok: false, status: overrideRefusalStatus(r.error), error: overrideRefusalCode(r.error) };
  return { ok: true, text: `${r.label_en} [${r.reason_code}]`, reason_code: r.reason_code, role_override: r.role_override };
}
