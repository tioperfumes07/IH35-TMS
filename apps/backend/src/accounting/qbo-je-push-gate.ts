import { isEnabled } from "../lib/feature-flags/service.js";

// IMPORT-P0 — the SINGLE source of truth for whether a journal entry may be pushed to QuickBooks.
// There are TWO live JE→QBO push paths and BOTH must consult this gate:
//   1. immediate best-effort — journal-entry-qbo-push.service.ts (on JE create)
//   2. the queue drain — sync-outbound-accounting.ts syncEntityToQbo (cron every minute; the primary path)
// QBO is the system of record through 12/31/2025 (double books + reconciliation, no sync-back).

export const JE_QBO_PUSH_FLAG = "QBO_JE_PUSH_ENABLED";
// Thrown / recorded when a QBO-origin / imported JE reaches a push path. Never replayable — an imported
// mirror entry round-tripping back into QuickBooks would corrupt the system of record.
export const QBO_PUSH_REFUSED_IMPORT_SOURCE = "qbo_push_refused_import_source";

// Matches the feature-flags service Queryable so the same client can be passed straight to isEnabled.
type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type JeQboPushDecision =
  | { decision: "allow"; sourceSystem: string | null }
  | { decision: "flag_off"; sourceSystem: string | null }
  | { decision: "import_source"; sourceSystem: string };

/**
 * Decide whether a journal entry may be pushed to QuickBooks. Two layers, evaluated in order:
 *   LAYER 2 (structural, flag-independent): source_system !== 'tms' (QBO-origin: 'qbo' today, a future
 *     'qbo_import') → NEVER push. Can't be flipped away.
 *   LAYER 1 (per-entity kill-switch): QBO_JE_PUSH_ENABLED (default OFF, per-entity-only) → push only when ON.
 * The caller MUST have set app.operating_company_id on `client`. Pass a known source_system via
 * opts.sourceSystem to avoid a redundant SELECT (the immediate path already has it from its probe).
 */
export async function evaluateJeQboPushGate(
  client: Queryable,
  operatingCompanyId: string,
  journalEntryId: string,
  opts?: { sourceSystem?: string | null }
): Promise<JeQboPushDecision> {
  let sourceSystem: string | null = opts?.sourceSystem ?? null;
  if (opts?.sourceSystem === undefined) {
    const res = await client.query<{ source_system: string | null }>(
      `SELECT source_system FROM accounting.journal_entries WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [journalEntryId, operatingCompanyId]
    );
    sourceSystem = res.rows[0]?.source_system ?? null;
  }

  // LAYER 2 — QBO-origin / imported entries never round-trip, even when the flag is ON.
  if (sourceSystem !== null && sourceSystem !== "tms") {
    return { decision: "import_source", sourceSystem };
  }

  // LAYER 1 — per-entity kill-switch (default OFF; global default/rollout can never enable it — the key
  // is in POSTING_FLAG_KEYS).
  const enabled = await isEnabled(client, JE_QBO_PUSH_FLAG, { operating_company_id: operatingCompanyId });
  if (!enabled) return { decision: "flag_off", sourceSystem };

  return { decision: "allow", sourceSystem };
}
