/**
 * Lead order, 2026-09-25 02:15 PM CT (19:15Z), item 1 — settlement 5812 is a zero-pay settlement
 * (TOTAL DUE -50.00, salary 0) whose loads (13588, 13600) could never close their tours under the
 * old isLoadTourOpen logic (settlement_lines-only path — a zero-pay settlement earns no pay line,
 * so the JOIN chain always found nothing and reported the tour open forever). R-169 (merged,
 * apps/backend/src/accounting/tour-open-gate.service.ts) fixed isLoadTourOpen to also resolve via
 * driver_bills.settled_in_settlement_id directly. This script is the literal next step the R-169
 * order itself named: "After merge, call the existing postHeldDocumentsForClosedTour for 5812."
 *
 * Mechanism: resolves settlement 5812's bookended load_ids via loadIdsForSettlement, then calls
 * postHeldDocumentsForClosedTour directly — the existing engine, unchanged. No new writer.
 *
 * loadIdsForSettlement itself needed a companion fix (same PR as this script, still
 * tour-open-gate.service.ts) — found live while writing this: it had the EXACT same zero-pay blind
 * spot R-169 just fixed in isLoadTourOpen, one level up. It resolved a settlement's bookended loads
 * ONLY via driver_bills -> settlement_lines (source_driver_bill_id, is_active) -> settlement_id -- a
 * zero-pay settlement earns no settlement_lines row at all, so for 5812 specifically it returned an
 * EMPTY load list and this script would have silently no-op'd even after isLoadTourOpen itself was
 * fixed. Widened it the identical way (settled_in_settlement_id, UNION, never narrows).
 *
 * Proof required (Lead's own words): 0 tour_open holds on the 48 August/September documents,
 * afterward. This script's own final query checks that GLOBALLY (every USMCA expense with
 * posting_status='unposted' AND posting_hold_reason='tour_open') rather than only the named 48
 * document numbers, which this script does not have an authoritative list of — a global zero is a
 * strictly stronger proof than a zero scoped to exactly 48 documents.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const SETTLEMENT_DOCUMENT_NUMBER = "5812";

/** One bypassed connection for the whole READ phase -- a plain pg.Pool.query() call has no
 * guaranteed session affinity under Neon's pooled endpoint (this session's own PgBouncer
 * backend-binding finding, Set B), so bypass must be set and used on the SAME held client. */
async function withBypassedClient<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const { postHeldDocumentsForClosedTour } = await import("../../apps/backend/src/accounting/tour-close-posting.service.js");
  const { loadIdsForSettlement } = await import("../../apps/backend/src/accounting/tour-open-gate.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const { settlementId, loadIds, loadNumbers } = await withBypassedClient(pool, async (client) => {
      const settlementRes = await client.query<{ id: string; status: string }>(
        `SELECT id::text, status FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1::uuid AND source_document_ref = $2
          LIMIT 2`,
        [USMCA_ID, SETTLEMENT_DOCUMENT_NUMBER]
      );
      if (settlementRes.rows.length !== 1) {
        throw new Error(`Expected exactly 1 settlement with source_document_ref=${SETTLEMENT_DOCUMENT_NUMBER}, found ${settlementRes.rows.length} -- STOP`);
      }
      const settlement = settlementRes.rows[0];
      console.log(`Settlement 5812: id=${settlement.id} status=${settlement.status}`);

      const ids = await loadIdsForSettlement(client as never, USMCA_ID, settlement.id);
      const loadNumRes = await client.query<{ load_number: string }>(
        `SELECT load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`,
        [USMCA_ID, ids]
      );
      return { settlementId: settlement.id, loadIds: ids, loadNumbers: loadNumRes.rows.map((r) => r.load_number) };
    });
    console.log(`Resolved ${loadIds.length} bookended load(s) for settlement ${settlementId}: ${loadNumbers.join(", ")}`);
    if (loadIds.length === 0) {
      throw new Error("loadIdsForSettlement resolved 0 loads for 5812 -- STOP, expected 13588 and 13600");
    }

    if (dryRun) {
      console.log("DRY_RUN=1 -- resolution only, not calling postHeldDocumentsForClosedTour.");
      return;
    }

    const result = await postHeldDocumentsForClosedTour(USMCA_ID, loadIds, { userId: SYSTEM_ACTOR_USER_ID });
    console.log("postHeldDocumentsForClosedTour result:", JSON.stringify(result, null, 2));

    const proofN = await withBypassedClient(pool, (client) =>
      client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND posting_status = 'unposted'
            AND posting_hold_reason = 'tour_open' AND status <> 'void'`,
        [USMCA_ID]
      )
    );
    const remaining = Number(proofN.rows[0].n);
    console.log(`PROOF: ${remaining} tour_open holds remain live, USMCA-wide (global, stronger than the 48-document scope named in the order).`);
    if (remaining > 0) {
      console.error("NOT ZERO -- some tour_open holds remain; investigate before calling this done.");
      process.exitCode = 1;
    } else {
      console.log("COMMITTED. 0 tour_open holds remain.");
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
