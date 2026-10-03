/**
 * ROUND 390.1 (CC-1) — a test fixture can never write production.
 *
 * Measured 2026-10-03 (prod, USMCA): db-fixture.ts ensureSecondEntityLoad() -> seedLoadForCompany() wrote
 * "E2E Customer 2E-95603e75" + load "E2E-2E-95603e75" (2026-09-30 04:07Z) and "E2E Customer 2E-06daf76e" /
 * "E2E Customer 2E-edd081e8" (2026-10-02 14:58Z) into REAL USMCA, and granted the integration Owner user USMCA access —
 * an integration suite had been pointed at the production database and nothing in the fixture looked at where it was
 * connected. Every fixture writer now refuses production twice:
 *   1. the connection string names the production endpoint (before connecting);
 *   2. the live Neon branch is the production branch (after connecting — catches a tunnel / proxy / alias).
 * The two constants mirror scripts/lib/prod-target-guard.mjs (DEFAULT_PROD_HOST_MARKERS) and
 * scripts/lib/assert-not-production.mjs (KNOWN_PRODUCTION_BRANCH_ID); verify-test-fixtures-refuse-production keeps them equal.
 */
type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const PRODUCTION_ENDPOINT_MARKER = "ep-broad-block-akykk7bw";
export const PRODUCTION_BRANCH_ID = "br-fancy-credit-akjnd07a";

export class FixtureRefusedProductionError extends Error {}

export function refuseProductionConnectionString(connectionString: string | undefined): void {
  if (!connectionString) return;
  let decoded = connectionString;
  try {
    decoded = decodeURIComponent(connectionString);
  } catch {
    /* keep raw */
  }
  const extra = (process.env.PROD_HOST_BLOCKLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if ([PRODUCTION_ENDPOINT_MARKER, ...extra].some((m) => decoded.includes(m))) {
    throw new FixtureRefusedProductionError(
      "test fixture REFUSED: DATABASE_URL / DATABASE_DIRECT_URL points at the PRODUCTION database. Integration fixtures seed " +
        "customers, loads, users and access grants — never on production (ROUND 390.1). Use a local database or a Neon fork."
    );
  }
}

export async function refuseProductionDatabase(client: Queryable): Promise<void> {
  const r = await client.query<{ branch: string | null }>(`SELECT current_setting('neon.branch_id', true) AS branch`);
  if (r.rows[0]?.branch === PRODUCTION_BRANCH_ID) {
    throw new FixtureRefusedProductionError(
      `test fixture REFUSED: this connection is the PRODUCTION Neon branch (${PRODUCTION_BRANCH_ID}). Integration fixtures never write production (ROUND 390.1).`
    );
  }
}
