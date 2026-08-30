/**
 * CC-1 CORRECTION ORDER (2026-08-30) -- fixes for FACT-INPUTS/MDATA-COPY-04/FACT-ASSIGN-05.
 *
 * Defect 2 (create the 4 missing Faro debtors that CREATE_NEW required -- 0 of 4 existed):
 *   DARDINI LLC, FLS Transport Inc., J RAYL TRANSPORT INC, S E Mares Forwarding Service LLC.
 *   None of the look-alike rows already in USMCA are these companies -- confirmed distinct legal
 *   entities per the debtor-match CSV ("DLS Dardini Logistics Services" / "FLS TRANSPORTATION
 *   SERVICES LIMITED" / "Semares Forwarding Services" / "SEMARES, INC." are NOT these debtors).
 *
 * Defect 1 (3 of the owner's 7 name rulings were never applied -- the copy's normalize()-based
 *   dedup only caught EXACT-after-normalize duplicates; these three groups have real TRANSP rows
 *   with spellings my override list did not include). WORM: void (deactivated_at), never delete.
 *   Watco:  keep "Watco Supply Chain Services LLC DBA Watco Logistics", void "Watco Supply Chain Services".
 *   NCC:    keep "NCC Logistics", void "NCC Logistics México" (a different entity per the owner).
 *   Simple: keep "Simple Logistics LLC", void "Silo Simple Logistics", "Simple Logistics", "Simplex logistics".
 *   Each losing row's own factoring.customer_factor_assignment row (already created by the
 *   completed TASK 5 run, before this dedup) is voided too, under that table's own WORM
 *   voided_at/void_reason columns -- not repointed (mutating an existing assignment's customer_id
 *   would corrupt its own history). Every survivor already has its own live assignment from the
 *   same TASK 5 run, confirmed before this script was written -- voiding the losers creates no
 *   new gap for them.
 *
 * Defect 5, customer half (mojibake UTF-8 double-encoding): "LogÃ­stica Comercial RGG" ->
 *   "Logística Comercial RGG" on the USMCA copy. Confirmed the SAME corruption already exists on
 *   the original TRANSP and TRK rows (pre-existing source data quality issue, not introduced by
 *   the copy script) -- fixing only the USMCA row per the correction's own scope; TRANSP/TRK stay
 *   frozen per standing rule. Vendor rows checked separately (see report) -- zero matches, nothing
 *   to fix there.
 *
 * Defect 4 (gap-fill): after Defect 1's dedup changes the denominator, re-derive which active
 *   USMCA customers (including the 4 new debtors from Defect 2) have no live assignment and assign
 *   them via the now-fixed assignCustomerToFactor (operating_company_id now set correctly).
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fact-assign-05-correction-dedupe-and-gapfill-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fact-assign-05-correction-dedupe-and-gapfill-once.mts --commit  # apply
 */
import pg from "pg";
import { assignCustomerToFactor } from "../apps/backend/src/factoring/factor.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FARO_FACTOR_ID = "40b3690b-f1d4-44b4-90cf-c1cfd4f79c33";
const EFFECTIVE_FROM = "2026-08-10";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

// Defect 2 -- the 4 CREATE_NEW debtors.
const NEW_DEBTORS = ["DARDINI LLC", "FLS Transport Inc.", "J RAYL TRANSPORT INC", "S E Mares Forwarding Service LLC"];

// Defect 1 -- (survivor id is resolved live by name; only the ids of the LOSERS are hardcoded
// here, taken from the live read this correction is based on).
const DEDUP_LOSERS = [
  { id: "39fbaa16-19e8-4e94-aca6-5876426d4965", name: "Watco Supply Chain Services", group: "Watco" },
  { id: "8a39ccca-bfb4-434b-aa26-59aa71dd0c33", name: "NCC Logistics MÃ©xico", group: "NCC" },
  { id: "117abcf6-0fba-42ff-9f38-475fc1a844fd", name: "Silo Simple Logistics", group: "Simple" },
  { id: "8ed137e5-d3d7-4e23-8718-8fa1cb157fde", name: "Simple Logistics", group: "Simple" },
  { id: "58f62ab8-0aee-4d23-a19d-3fe42c5a3484", name: "Simplex logistics", group: "Simple" },
];

// Defect 5, customer half.
const ENCODING_FIX_ID = "8067150a-a0f1-4e67-b667-45d9873cde78"; // "LogÃ­stica Comercial RGG" (USMCA copy)
const ENCODING_FIX_CORRECT = "Logística Comercial RGG";

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    // ---- Preflight reads (dry-run and --commit both do these) ----
    const existingDebtors = await client.query<{ customer_name: string }>(
      `SELECT customer_name FROM mdata.customers WHERE operating_company_id = $1::uuid AND customer_name = ANY($2::text[])`,
      [USMCA, NEW_DEBTORS]
    );
    console.log("Debtors already present (should be none):", existingDebtors.rows.map((r) => r.customer_name));

    const loserIds = DEDUP_LOSERS.map((l) => l.id);
    const loserCheck = await client.query<{ id: string; customer_name: string; deactivated_at: string | null }>(
      `SELECT id::text, customer_name, deactivated_at::text FROM mdata.customers WHERE id = ANY($1::uuid[])`,
      [loserIds]
    );
    console.log("Loser rows live state:", loserCheck.rows);

    const encodingCheck = await client.query<{ customer_name: string }>(
      `SELECT customer_name FROM mdata.customers WHERE id = $1::uuid`,
      [ENCODING_FIX_ID]
    );
    console.log("Encoding-fix row current name:", encodingCheck.rows[0]?.customer_name);

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      return;
    }
    if (existingDebtors.rows.length > 0) throw new Error("one or more of the 4 new debtors already exists -- refusing to duplicate");
    for (const row of loserCheck.rows) {
      if (row.deactivated_at) throw new Error(`loser row ${row.id} (${row.customer_name}) is already deactivated -- refusing to re-void`);
    }

    // ---- Defect 2: create the 4 debtors ----
    const createdDebtorIds: string[] = [];
    for (const name of NEW_DEBTORS) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      try {
        const res = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.customers (
              customer_name, operating_company_id, status, is_sample_data, factoring_eligible,
              source_system, source, created_by_user_id, updated_by_user_id
            )
            VALUES ($1, $2::uuid, 'active', false, true, 'tms', $3, $4::uuid, $4::uuid)
            RETURNING id::text
          `,
          [name, USMCA, "CC-1-CORRECTION-2026-08-30 defect 2: CREATE_NEW Faro debtor, distinct from any similarly-named USMCA row", ACTOR_USER_UUID]
        );
        const id = res.rows[0]!.id;
        createdDebtorIds.push(id);
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
          "mdata.customers.created",
          "info",
          JSON.stringify({ resource_type: "mdata.customers", resource_id: id, operating_company_id: USMCA, name }),
          ACTOR_USER_UUID,
          "CC1-CORRECTION-DEFECT2",
        ]);
        await client.query("COMMIT");
        console.log(`DEBTOR CREATED: ${name} -> ${id}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    // ---- Defect 1: void the 5 losing duplicate customer rows + their factor assignments ----
    for (const loser of DEDUP_LOSERS) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      try {
        const reason = `CC-1-CORRECTION-2026-08-30 defect 1 (${loser.group} dedup group): owner-ruled duplicate, superseded by the canonical row for this real company. Never copied/kept as a second USMCA customer.`;
        await client.query(
          `UPDATE mdata.customers SET deactivated_at = now(), notes = COALESCE(notes, '') || $2 WHERE id = $1::uuid AND deactivated_at IS NULL`,
          [loser.id, `\n${reason}`]
        );
        const voidedAssignment = await client.query<{ id: string }>(
          `
            UPDATE factoring.customer_factor_assignment
            SET voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid
            WHERE customer_id = $1::uuid AND voided_at IS NULL
            RETURNING id::text
          `,
          [loser.id, reason, ACTOR_USER_UUID]
        );
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
          "mdata.customers.deactivated",
          "warning",
          JSON.stringify({ resource_type: "mdata.customers", resource_id: loser.id, operating_company_id: USMCA, reason, voided_assignment_ids: voidedAssignment.rows.map((r) => r.id) }),
          ACTOR_USER_UUID,
          "CC1-CORRECTION-DEFECT1",
        ]);
        await client.query("COMMIT");
        console.log(`LOSER VOIDED: ${loser.name} (${loser.id}); assignment(s) voided: ${voidedAssignment.rows.map((r) => r.id).join(",") || "none"}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    // ---- Defect 5, customer half: fix the mojibake encoding on the USMCA copy ----
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    try {
      await client.query(`UPDATE mdata.customers SET customer_name = $2 WHERE id = $1::uuid`, [ENCODING_FIX_ID, ENCODING_FIX_CORRECT]);
      await client.query("COMMIT");
      console.log(`ENCODING FIXED: ${ENCODING_FIX_ID} -> "${ENCODING_FIX_CORRECT}"`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    // ---- Defect 4: gap-fill, recomputed AFTER the dedup ----
    const factorRes = await client.query<{ active: boolean; voided_at: string | null }>(
      `SELECT active, voided_at::text FROM factoring.factor WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [FARO_FACTOR_ID, USMCA]
    );
    const factor = factorRes.rows[0];
    if (!factor || !factor.active || factor.voided_at) throw new Error("Faro factor is not live -- refusing to assign");

    const gapRes = await client.query<{ id: string; customer_name: string }>(
      `
        SELECT c.id::text, c.customer_name
        FROM mdata.customers c
        WHERE c.operating_company_id = $1::uuid
          AND c.deactivated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM factoring.customer_factor_assignment a
            WHERE a.customer_id = c.id
              AND a.tenant_id = $1::uuid
              AND a.factor_id = $2::uuid
              AND a.voided_at IS NULL
              AND a.effective_to IS NULL
          )
        ORDER BY c.customer_name
      `,
      [USMCA, FARO_FACTOR_ID]
    );
    console.log(`GAP (active customers, no live assignment, post-dedup): ${gapRes.rows.length}`);

    let assigned = 0;
    const failures: Array<{ name: string; error: string }> = [];
    for (const row of gapRes.rows) {
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
        await assignCustomerToFactor(USMCA, row.id, FARO_FACTOR_ID, EFFECTIVE_FROM, { client: client as never });
        await client.query("COMMIT");
        assigned++;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        failures.push({ name: row.customer_name, error: (e as Error).message });
      }
    }
    console.log(`GAP-FILL ASSIGNED: ${assigned} / ${gapRes.rows.length}`);
    if (failures.length > 0) console.log("GAP-FILL FAILURES:", JSON.stringify(failures, null, 2));

    // ---- Final tallies ----
    const finalCustomers = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM mdata.customers WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL`, [USMCA]);
    const finalAssignments = await client.query<{ n: string; null_opco: string }>(
      `SELECT count(*)::text AS n, count(*) FILTER (WHERE operating_company_id IS NULL)::text AS null_opco FROM factoring.customer_factor_assignment WHERE tenant_id = $1::uuid AND voided_at IS NULL AND effective_to IS NULL`,
      [USMCA]
    );
    console.log("FINAL: active USMCA customers =", finalCustomers.rows[0]?.n, "| live Faro assignments =", finalAssignments.rows[0]?.n, "| with NULL operating_company_id =", finalAssignments.rows[0]?.null_opco);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
