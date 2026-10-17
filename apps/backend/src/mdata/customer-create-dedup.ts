/**
 * LEAD 443.194 (verify-canonical-customers: 2 duplicate USMCA groups) — the create path checked for a same-name
 * customer in ONE transaction and inserted in ANOTHER, with nothing between them. Two creates of the same customer
 * submitted together (2026-10-16: "Tropic Brokers Inc" 270 ms apart, "STEPBYSTEPLOGISTICSLLC" 85 ms apart, same
 * Owner, same body) both passed the check and both inserted. The check also compared lower(btrim(name)), a weaker
 * key than the canonical engine's, so "Tropic Brokers, Inc." would pass beside "Tropic Brokers Inc".
 *
 * This runs INSIDE the insert transaction, before the INSERT:
 *   1. a transaction-scoped advisory lock on (company, canonical key) serialises concurrent creates of one name;
 *   2. under that lock, the existing customer with the same canonical key (the key verify-canonical-customers and the
 *      canonical merge engine group by — normalizedKeySql) is looked up in the company. The query itself does not
 *      filter on status; under the app role the customers_select policy hides deactivated rows, so an inactive
 *      same-key customer is caught only where the caller can see it (the pre-check has the same reach).
 * The second of two concurrent creates waits on the lock, then sees the first's committed row and is refused 409.
 */
import { normalizedKeySql } from "./canonical/canonical-entities.service.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** The canonical key in JS — same rule as normalizedKeySql (upper, A-Z/0-9 only). */
export function canonicalCustomerKey(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export type ExistingCanonicalCustomer = { id: string; customer_name: string; deactivated_at: string | null };

/**
 * Take the (company, key) create lock, then return the customer that already holds this canonical key, or null.
 * Must be called on the same client/transaction that performs the INSERT.
 */
export async function lockAndFindCanonicalCustomer(
  client: Db,
  operatingCompanyId: string,
  name: string
): Promise<ExistingCanonicalCustomer | null> {
  const key = canonicalCustomerKey(name);
  if (!key) return null;
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`mdata.customers.create:${operatingCompanyId}:${key}`]);
  const res = await client.query<ExistingCanonicalCustomer>(
    `SELECT id::text, customer_name, deactivated_at::text
       FROM mdata.customers
      WHERE operating_company_id = $1::uuid AND ${normalizedKeySql("customer_name")} = $2
      ORDER BY created_at
      LIMIT 1`,
    [operatingCompanyId, key]
  );
  return res.rows[0] ?? null;
}
