/**
 * Runtime column-capability probe for insurance.claim.
 *
 * WHY THIS EXISTS (two independent prod facts, both verified against the Neon prod branch
 * br-fancy-credit-akjnd07a on 2026-07-22, RLS-immune via pg_catalog/information_schema):
 *
 *  1. insurance.claim.operating_company_id EXISTS on prod and is the LIVE RLS key. The forced
 *     policy is
 *       (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
 *     on polcmd '*' — so it is the WITH CHECK for INSERT too. The column is nullable with NO
 *     default, and every claim writer in this repo sets only tenant_id. A row with a NULL
 *     operating_company_id therefore fails the WITH CHECK and the INSERT is REJECTED (the route
 *     sets app.operating_company_id, never app.bypass_rls='lucia', so the bypass leg is false).
 *     insurance.claim.n_tup_ins on prod is 0 — no claim has ever been successfully inserted.
 *     That column came from HELD migration 202607490000, which was hand-applied to prod but is
 *     skipped by db:migrate, so a fresh CI database does NOT have it.
 *
 *  2. The six WIZARD-CLAIM-ECONOMICS-DEPTH slice-2 columns (202607730000, also HELD) do not exist
 *     on a database until that migration is hand-applied. Reading them unconditionally 500s the
 *     entire claims module — list, graph, create read-back and patch read-back — on any database
 *     that is a migration behind.
 *
 * Held migrations put prod and a fresh DB in genuinely different shapes, so the shape has to be
 * asked at runtime rather than assumed from the repo. Probed once per process (the answer only
 * changes when a migration runs, which restarts the process), and skipped entirely without
 * DATABASE_URL so unit tests keep their mocked clients.
 *
 * Pattern mirrors apps/backend/src/accounting/startup-column-probe.ts, with one deliberate
 * difference: that probe THROWS on a missing column because the posting engine must never run
 * half-shaped. Here the columns are additive capture fields, so degrading (omit the column, return
 * its neutral default) keeps the module usable instead of taking it down.
 */
type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/** Columns whose presence depends on a HELD migration having been hand-applied. */
export const CLAIM_ECONOMICS_COLUMNS = [
  "fault",
  "driver_responsible",
  "trailer_id",
  "deductible_cents",
  "recovery_rail",
  "repair_books_treatment",
] as const;

export type ClaimColumnCapabilities = {
  /** insurance.claim.operating_company_id exists (held 202607490000 applied). */
  operatingCompanyId: boolean;
  /** All six slice-2 economics columns exist (held 202607730000 applied). */
  economics: boolean;
};

/**
 * Shape assumed when the probe comes back INCONCLUSIVE — i.e. information_schema reported that
 * insurance.claim has zero columns, which no live Postgres ever says about a table that exists.
 * In practice that means either a mocked client (unit tests, which assert the fully-migrated SQL)
 * or a database with no insurance.claim at all, where the module is already non-functional and
 * degrading buys nothing. Deliberately NOT cached, so the next request probes again.
 *
 * Note that `!process.env.DATABASE_URL` is NOT a usable "no database" signal in this repo:
 * apps/backend/src/test-env.ts fills in a placeholder DATABASE_URL so eagerly-validating modules
 * can load under Vitest.
 */
const ASSUME_MIGRATED: ClaimColumnCapabilities = { operatingCompanyId: true, economics: true };

let cached: ClaimColumnCapabilities | null = null;
let inFlight: Promise<ClaimColumnCapabilities> | null = null;

export async function getClaimColumnCapabilities(client: Queryable): Promise<ClaimColumnCapabilities> {
  if (cached) return cached;
  // Concurrent first-requests must share one probe, not race N of them.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await client.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'insurance' AND table_name = 'claim'`
    );
    const rows = res?.rows ?? [];
    inFlight = null;
    if (rows.length === 0) return ASSUME_MIGRATED;

    const present = new Set(rows.map((r) => r.column_name.toLowerCase()));
    cached = {
      operatingCompanyId: present.has("operating_company_id"),
      economics: CLAIM_ECONOMICS_COLUMNS.every((c) => present.has(c)),
    };
    return cached;
  })().catch((err) => {
    // A failed probe must not poison the cache — the next request retries.
    inFlight = null;
    throw err;
  });

  return inFlight;
}

export function resetClaimColumnCapabilitiesForTest(): void {
  cached = null;
  inFlight = null;
}
