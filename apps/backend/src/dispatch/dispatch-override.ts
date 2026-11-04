/**
 * Row 28 (443.294) — the dispatch booking overrides (hard-block / HOS / locked-load / unit-repair / DOT qualification)
 * all confirm through the ONE engine, recordOverride (catalogs.override_reasons), inside the caller's transaction.
 *
 *   • The wire carries a catalog `reason_code` (or nothing, for an Owner / Accountant confirm) — never a typed sentence.
 *     The HTTP schemas (loads.routes.ts) REFUSE the old free-text `override_reason` / `override_rules[].reason`.
 *   • `systemReason` is the one internal exception: a trusted engine (the Settlement Creator's automatic Owner
 *     attestation) that has no person to pick a reason. A route can never set it — the schemas do not carry it.
 *   • The stored line is "<catalog label> [<code>]" so every downstream audit / outbox payload keeps a readable reason.
 */
import { z } from "zod";
import { confirmOverride, overrideReasonCodeSchema, refusedTypedReason, type ConfirmedOverride } from "../overrides/confirm-override.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** Wire fields (create + edit). `override_reason` / `reason` exist only to be REFUSED: typing a reason is not allowed. */
export const dispatchOverrideWireShape = {
  override_reason: refusedTypedReason("override_reason"),
  override_reason_code: overrideReasonCodeSchema.nullable().optional(),
  override_rules: z
    .array(
      z.object({
        rule_code: z.string().trim().min(1).max(80),
        reason: refusedTypedReason("override_rules.reason"),
        reason_code: overrideReasonCodeSchema.nullable().optional(),
        subject: z.string().trim().max(200).optional(),
      })
    )
    .max(40)
    .optional(),
};

export type DispatchOverrideRule = { rule_code: string; reason_code?: string | null; reason?: string; subject?: string };

export type DispatchOverrideInput = {
  override_token?: string;
  override_requested?: boolean;
  override_reason_code?: string | null;
  /** INTERNAL (trusted engines only; no route schema carries it). */
  override_reason?: string;
  override_rules?: DispatchOverrideRule[];
};

/** True when the caller asked to override something (a token, a picked code, a rule row, or an explicit confirm). */
export function dispatchOverrideRequested(input: DispatchOverrideInput): boolean {
  return Boolean(
    input.override_token ||
      input.override_requested ||
      (typeof input.override_reason_code === "string" && input.override_reason_code.trim()) ||
      (typeof input.override_reason === "string" && input.override_reason.trim().length >= 10) ||
      (Array.isArray(input.override_rules) && input.override_rules.length > 0)
  );
}

export type DispatchOverrideOutcome = ConfirmedOverride;

export class DispatchOverrideRefusedError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = "DispatchOverrideRefusedError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Confirm ONE dispatch override through recordOverride (context 'dispatch'), writing its audit row on `client` — the
 * caller's open transaction. `reasonCode` null is a plain Owner / Accountant confirm; anyone else must pass a code.
 */
export function confirmDispatchOverride(
  client: Queryable,
  p: {
    operatingCompanyId: string;
    actor: { userId: string; role: string };
    reasonCode?: string | null;
    systemReason?: string | null;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }
): Promise<DispatchOverrideOutcome> {
  return confirmOverride(client, { ...p, context: "dispatch" });
}
