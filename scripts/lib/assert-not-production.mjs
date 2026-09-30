// Shared assertNotProduction() -- ROUND 293 P0 (owner-ordered, every seat).
//
// WHY THIS EXISTS: a rehearsal script on 2026-09-30 reused a stale, already-in-scope connection
// string instead of fetching its intended Neon rehearsal branch's own, and called voidDocument
// against PRODUCTION on a real, funded factoring advance (FAC-2026-00001). No data was damaged
// only because the destructive status stamp happens one function-call layer above where the
// script actually touched (the route, not the service function it called directly) -- that is
// luck, not a control, and one refactor moving the stamp down would have voided a real advance
// with no approval and no register entry.
//
// THE LEAD'S RULE, verbatim: "Query the branch identity from the connection itself; do not trust
// the string's shape." A hostname regex on DATABASE_URL is exactly the kind of control that looks
// safe and isn't -- a proxy, a tunnel, an SNI override, or a stale variable all defeat it silently.
//
// THE MECHANISM: Neon exposes the live branch identity as an ordinary Postgres GUC on every
// connection, set by the compute itself, not by whatever string dialed in:
//   SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'
// This is queried FROM THE OPEN CONNECTION -- it reflects which physical branch answered the
// query, independent of DNS, proxies, or what the caller believes it typed. Confirmed live
// 2026-09-30 against the real prod branch: returns exactly 'br-fancy-credit-akjnd07a', the same
// id already used as a known-prod constant elsewhere in this repo's guards (grep it).
//
// FAIL CLOSED: if the GUC is missing, the query errors, or the branch id doesn't positively prove
// this is NOT the known production branch, this throws. "Unknown" is never "assume safe" -- it is
// always "assume production, refuse."

export const KNOWN_PRODUCTION_BRANCH_ID = "br-fancy-credit-akjnd07a";
export const KNOWN_PRODUCTION_PROJECT_ID = "tiny-field-89581227";

export class ProductionWriteRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductionWriteRefusedError";
  }
}

/**
 * Query the LIVE connection's own Neon branch identity. Never parses a connection string --
 * every value here comes from a query answered by the actual compute the caller is talking to.
 * @param {{query: (sql: string) => Promise<{rows: Array<Record<string, unknown>>}>}} client
 * @returns {Promise<{branchId: string | null, projectId: string | null}>}
 */
export async function queryLiveNeonIdentity(client) {
  const res = await client.query(
    `SELECT name, setting FROM pg_settings WHERE name IN ('neon.branch_id', 'neon.project_id')`
  );
  const rows = res.rows ?? [];
  const branchRow = rows.find((r) => r.name === "neon.branch_id");
  const projectRow = rows.find((r) => r.name === "neon.project_id");
  return {
    branchId: branchRow ? String(branchRow.setting) : null,
    projectId: projectRow ? String(projectRow.setting) : null,
  };
}

/**
 * THE control. Call this on an OPEN client connection, as the very first thing you do after
 * connecting, BEFORE any INSERT/UPDATE/DELETE or any call into a mutating service function
 * (voidDocument, reinstateDocument, postFactoringAdvanceEventInClientTx, etc.).
 *
 * Fails closed (throws ProductionWriteRefusedError) unless it can POSITIVELY prove, via a live
 * query answered by the connection itself, that the target is NOT the known production branch.
 * A query failure, a missing GUC, or a branch id that matches known production are all refusals --
 * there is no code path in this function that returns successfully without a live, non-prod
 * branch id in hand.
 *
 * @param {{query: (sql: string) => Promise<{rows: Array<Record<string, unknown>>}>}} client
 * @param {{label?: string}} [opts]
 * @returns {Promise<{branchId: string, projectId: string | null}>}
 */
export async function assertNotProduction(client, opts = {}) {
  const label = opts.label ?? "assertNotProduction";
  let identity;
  try {
    identity = await queryLiveNeonIdentity(client);
  } catch (err) {
    throw new ProductionWriteRefusedError(
      `[${label}] REFUSED -- could not query the live connection's Neon branch identity ` +
        `(neon.branch_id GUC). A query failure is treated as "cannot prove this is not ` +
        `production" and this write is refused. Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!identity.branchId) {
    throw new ProductionWriteRefusedError(
      `[${label}] REFUSED -- the connection answered with no neon.branch_id GUC at all. ` +
        `This is either not a Neon Postgres connection, or something is masking the GUC. ` +
        `Unknown is never treated as safe -- this write is refused.`
    );
  }

  if (identity.branchId === KNOWN_PRODUCTION_BRANCH_ID) {
    throw new ProductionWriteRefusedError(
      `[${label}] REFUSED -- this connection's live neon.branch_id is '${identity.branchId}', ` +
        `which IS the known production branch (project ${KNOWN_PRODUCTION_PROJECT_ID}). ` +
        `A rehearsal/test script must never write here. If this write is genuinely intended for ` +
        `production (an authorized AUTH-gated ops script's real run, not a rehearsal), that ` +
        `script must call assertIsIntendedProduction() instead -- never bypass this function by ` +
        `deleting the call.`
    );
  }

  console.error(`[${label}] target verified NOT production: neon.branch_id=${identity.branchId} (project=${identity.projectId ?? "?"})`);
  return { branchId: identity.branchId, projectId: identity.projectId };
}

/**
 * The DELIBERATE opposite assertion, for the small set of real, AUTH-gated ops scripts whose
 * entire purpose is to write to production once a human has reviewed and approved the AUTH entry.
 * Requires the caller to explicitly acknowledge they intend production -- this is not a bypass of
 * assertNotProduction, it is a SEPARATE, named, harder-to-reach-by-accident function a script must
 * deliberately call instead. It still fails closed if the connection's live identity does not
 * match the known production branch exactly (protects against the opposite mistake: an
 * OWNER_AUTH_ID-gated script accidentally running against a rehearsal branch and reporting a
 * false real-execution proof).
 * @param {{query: (sql: string) => Promise<{rows: Array<Record<string, unknown>>}>}} client
 * @param {{label?: string}} [opts]
 */
export async function assertIsIntendedProduction(client, opts = {}) {
  const label = opts.label ?? "assertIsIntendedProduction";
  const identity = await queryLiveNeonIdentity(client);
  if (identity.branchId !== KNOWN_PRODUCTION_BRANCH_ID) {
    throw new ProductionWriteRefusedError(
      `[${label}] REFUSED -- this script explicitly requires production, but the live ` +
        `neon.branch_id is '${identity.branchId ?? "(none)"}', not the known production branch ` +
        `'${KNOWN_PRODUCTION_BRANCH_ID}'. Refusing rather than silently running an AUTH-gated ` +
        `real execution against the wrong database.`
    );
  }
  return { branchId: identity.branchId, projectId: identity.projectId };
}
