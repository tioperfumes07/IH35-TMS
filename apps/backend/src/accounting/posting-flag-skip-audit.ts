import { appendCrudAudit } from "../audit/crud-audit.js";

// Shared guard helper for the "silent flag-gated no-op posting" class (Tier-1 0007).
// When a money-posting leg is gated behind a per-entity feature flag and that flag resolves OFF,
// the posting is (correctly) skipped — but historically the surrounding operation returned success
// with NO signal, so an operator/auditor could not tell "posted" from "flag off, nothing posted".
// That is a fake-green / silent-failure violation of the hardline rule.
//
// Every flag-gated posting gate MUST, in its OFF branch, EITHER surface an explicit discriminated
// result (e.g. `{ result: "blocked_flag_off" }` / a 409) OR — when the enclosing writer returns a
// bare value (a count, void) — call `recordPostingFlagSkip` so the skip is recorded append-only.
// Enforced by scripts/verify-no-silent-noop-posting.mjs (a gate with no honest signal fails CI).

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<unknown>;
};

/** Canonical discriminated value for a posting leg skipped because its flag was OFF. */
export const POSTING_FLAG_SKIP_RESULT = "blocked_flag_off" as const;

export interface PostingFlagSkipInput {
  /** The feature-flag key that resolved OFF (e.g. "CUSTOMER_PAYMENT_GL_POSTING_ENABLED"). */
  flagKey: string;
  /** Dotted posting domain used to name the audit event (e.g. "customer_payment"). */
  postingDomain: string;
  /** Entity whose per-entity flag was resolved. */
  operatingCompanyId: string;
  /** Optional identifiers tying the skip to the source record(s). */
  context?: Record<string, unknown>;
}

/**
 * Record — append-only — that a flag-gated posting leg was skipped because its flag was OFF.
 * Emits `<postingDomain>.posting.skipped_flag_off` with `result: "blocked_flag_off"`.
 * Never writes to the GL; never throws on the happy path beyond what the audit primitive does.
 */
export async function recordPostingFlagSkip(
  client: QueryableClient,
  actorUserId: string,
  input: PostingFlagSkipInput
): Promise<void> {
  await appendCrudAudit(
    client,
    actorUserId,
    `${input.postingDomain}.posting.skipped_flag_off`,
    {
      result: POSTING_FLAG_SKIP_RESULT,
      flag_key: input.flagKey,
      operating_company_id: input.operatingCompanyId,
      ...(input.context ?? {}),
    },
    "info",
    "NO-SILENT-NOOP-POSTING"
  );
}
