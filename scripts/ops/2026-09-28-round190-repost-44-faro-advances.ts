/**
 * ROUND 190 item 1 (Lead, P0, real money): repost the 44 reversed Faro advances
 * FAC-2026-00047..FAC-2026-00090. They are reversed with NO live funding JE -- real cash, zero GL
 * entry, per the P0 factoring-posting-defect investigation (ACCT-F2026092826, PR #23023).
 *
 * ROOT CAUSE RECAP: a one-time, never-committed script posted these 44 advances' real net-advance
 * amount into the wire-fee GL leg (ach_cents = net_adv, not the real ~$10 fee). A later partial
 * repair reversed each funding JE and zeroed the header's wire_fee_cents/cash_rsv_cents/
 * advance_amount_cents (and, for a few, left factor_fee_cents bundled with the wire fee) -- but
 * never re-posted, leaving these 44 real advances with NO live funding-event JE at all.
 *
 * SOURCE OF TRUTH: NOT the current header (verified corrupted in the three ways above). Each row's
 * own `notes` field carries the original FARO_FEES JSON written at import
 * ({"escrow_rsv","cash_rsv","discount","fees","sch_fee","net_adv","purchase","load"}) -- Faro's own
 * reported breakdown, untouched by the later repair. This script parses that JSON, RECONCILES it
 * (escrow_rsv + discount + fees + sch_fee + cash_rsv + net_adv === purchase === invoice_total_cents,
 * to the cent) before trusting it, and refuses any row that doesn't tie out or carries a nonzero
 * sch_fee (Faro's "Sch Fee" column has no GL role defined yet -- a separate, still-open owner
 * decision per the P0 investigation; forcing it here would be exactly the "never invent" violation
 * this whole incident is about).
 *
 * FIELD MAPPING (confirmed live against a known-good advance, FAC-2026-00042, before writing this):
 *   escrow_rsv -> reserve_amount_cents (Factoring Reserves)
 *   discount   -> factor_fee_cents     (Factoring Fees) -- ALONE, never bundled with the wire fee
 *   fees       -> wire_fee_cents       (Bank Service Charges & Wire Fees) -- the real ~$10 wire fee
 *   cash_rsv   -> cash_rsv_cents       (Faro Cash Reserve) -- 0 for all 44 rows here
 *   net_adv    -> advance_amount_cents (Undeposited Funds / cash_clearing) -- the real cash advanced
 *
 * WHAT THIS SCRIPT DOES, per row, in ONE transaction:
 *   1. Re-derive all 5 cent values from notes, reconcile to invoice_total_cents (abort row on any
 *      mismatch -- printed, not silently skipped).
 *   2. UPDATE the header: status='advanced' (was 'voided'), voided_at/void_reason/voided_by_user_id
 *      cleared, reserve_amount_cents/factor_fee_cents/wire_fee_cents/cash_rsv_cents/
 *      advance_amount_cents set to the reconciled values, notes APPENDED (never overwritten) with a
 *      ROUND-190 repost marker. This is a status/metadata correction, not new GL math -- the actual
 *      posting math happens only inside the sanctioned poster below.
 *   3. postFactoringAdvanceEventInClientTx (the SAME engine every other advance uses, reused
 *      verbatim, no new GL math written here) with funding_figures = the reconciled values,
 *      faro_invoice_number/faro_purchase_date restored from the notes' own "Wire / Faro DATE inv N"
 *      text. advanced_at is untouched (still holds the real original date, confirmed live before
 *      writing this) so resolveCanonicalEntryDate naturally lands on the correct historical date --
 *      no advanced_at_iso override needed.
 *   4. Verifies a NEW live (non-reversed) journal_entry_id came back; aborts the row's own
 *      transaction otherwise.
 *
 * Every row is its own transaction -- one bad row never blocks the other 43. DRY_RUN=1 prints the
 * full plan (parsed values, reconciliation result, computed legs) with zero writes.
 *
 * AUTHORIZATION: OWNER_AUTH_ID env var required, verified against an OPEN entry in
 * docs/bus/OWNER-AUTHORIZATIONS.md (ROUND 133 P0 law) -- "DIRECT INSERT AUTHORIZED" from the owner's
 * own ROUND 190 order is recorded there as AUTH-11x before this script is run for real.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const TARGET_DISPLAY_IDS = Array.from({ length: 44 }, (_, i) => `FAC-2026-${String(47 + i).padStart(5, "0")}`);
const ONLY_DISPLAY_ID = process.env.ONLY_DISPLAY_ID?.trim() || null;

type FaroFees = {
  escrow_rsv: number;
  cash_rsv: number;
  discount: number;
  fees: number;
  sch_fee: number;
  net_adv: number;
  purchase: number;
  load?: string;
};

function parseNotes(notes: string): { fees: FaroFees; header: string; faroInvoiceWas: string | null } {
  const jsonMatch = notes.match(/FARO_FEES=(\{.*?\})/);
  if (!jsonMatch) throw new Error("notes has no FARO_FEES JSON block");
  const fees = JSON.parse(jsonMatch[1]) as FaroFees;
  const headerMatch = notes.match(/^(Wire \/ Faro [\d/]+ inv \S+)/);
  const header = headerMatch ? headerMatch[1] : "";
  const invMatch = notes.match(/faro_inv_was=(\S+)/);
  return { fees, header, faroInvoiceWas: invMatch ? invMatch[1] : null };
}

function centsFromDollars(n: number): number {
  return Math.round(n * 100);
}

async function main() {
  const { postFactoringAdvanceEventInClientTx } = await import(
    "../../apps/backend/src/accounting/factoring-posting/poster.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  const targets = ONLY_DISPLAY_ID ? [ONLY_DISPLAY_ID] : TARGET_DISPLAY_IDS;
  if (ONLY_DISPLAY_ID && !TARGET_DISPLAY_IDS.includes(ONLY_DISPLAY_ID)) {
    throw new Error(`ONLY_DISPLAY_ID=${ONLY_DISPLAY_ID} is not one of this script's 44 target rows -- STOP`);
  }

  // READ PHASE, entirely separate from the write phase (same precedent as the R-159 script: reads
  // interleaved with writes on this Neon pooled endpoint have returned false-empty results before).
  const readClient = await pool.connect();
  let rows: Array<{
    id: string;
    display_id: string;
    invoice_total_cents: string;
    notes: string;
    status: string;
    advanced_at: string | null;
  }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await readClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
    const res = await readClient.query(
      `SELECT id::text, display_id, invoice_total_cents::text, notes, status::text, advanced_at::text
         FROM accounting.factoring_advances
        WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
        ORDER BY display_id`,
      [USMCA_ID, targets]
    );
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  if (rows.length !== targets.length) {
    throw new Error(`Expected ${targets.length} advances, found ${rows.length} -- STOP`);
  }

  for (const row of rows) {
    const plan: Record<string, unknown> = { display_id: row.display_id };
    try {
      const { fees, faroInvoiceWas } = parseNotes(row.notes);
      const reserveCents = centsFromDollars(fees.escrow_rsv);
      const feeCents = centsFromDollars(fees.discount);
      const wireFeeCents = centsFromDollars(fees.fees);
      const cashRsvCents = centsFromDollars(fees.cash_rsv);
      const advanceCents = centsFromDollars(fees.net_adv);
      const purchaseCents = centsFromDollars(fees.purchase);
      const schFeeCents = centsFromDollars(fees.sch_fee);
      const invoiceTotalCents = Number(row.invoice_total_cents);

      const sumCents = reserveCents + feeCents + wireFeeCents + cashRsvCents + schFeeCents + advanceCents;
      plan.parsed = { reserveCents, feeCents, wireFeeCents, cashRsvCents, advanceCents, schFeeCents, purchaseCents, invoiceTotalCents, sumCents };

      if (schFeeCents !== 0) {
        plan.status = "SKIP -- nonzero sch_fee, no GL role defined yet (separate open owner decision)";
        results.push(plan);
        console.log(JSON.stringify(plan));
        continue;
      }
      if (sumCents !== purchaseCents || purchaseCents !== invoiceTotalCents) {
        plan.status = `SKIP -- reconciliation failed: sum=${sumCents} purchase=${purchaseCents} invoice_total=${invoiceTotalCents}`;
        results.push(plan);
        console.log(JSON.stringify(plan));
        continue;
      }
      if (advanceCents <= 0) {
        plan.status = "SKIP -- computed advance_amount_cents <= 0, zero_amount gate would reject";
        results.push(plan);
        console.log(JSON.stringify(plan));
        continue;
      }

      plan.status = DRY_RUN ? "DRY_RUN -- would repost" : "POSTING";
      console.log(JSON.stringify(plan));
      if (DRY_RUN) {
        results.push(plan);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

        await client.query(
          `UPDATE accounting.factoring_advances
              SET status = 'advanced', voided_at = NULL, void_reason = NULL, voided_by_user_id = NULL,
                  reserve_amount_cents = $2, factor_fee_cents = $3, wire_fee_cents = $4,
                  cash_rsv_cents = $5, advance_amount_cents = $6,
                  notes = notes || ' | ROUND-190 REPOST: reconciled from FARO_FEES notes, re-posted via sanctioned poster'
            WHERE id = $1::uuid AND operating_company_id = $7::uuid`,
          [row.id, reserveCents, feeCents, wireFeeCents, cashRsvCents, advanceCents, USMCA_ID]
        );

        const faroPurchaseDateMatch = row.notes.match(/Wire \/ Faro (\d+\/\d+\/\d+)/);
        let faroPurchaseDateIso: string | null = null;
        if (faroPurchaseDateMatch) {
          const [m, d, y] = faroPurchaseDateMatch[1].split("/").map(Number);
          faroPurchaseDateIso = `20${String(y).padStart(2, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }

        const repost = await postFactoringAdvanceEventInClientTx(client, {
          operating_company_id: USMCA_ID,
          factoring_advance_id: row.id,
          actor_user_id: SYSTEM_ACTOR_USER_ID,
          funding_figures: {
            invoice_total_cents: invoiceTotalCents,
            reserve_cents: reserveCents,
            fee_cents: feeCents,
            ach_cents: wireFeeCents,
            cash_rsv_cents: cashRsvCents,
          },
          faro_invoice_number: faroInvoiceWas,
          faro_purchase_date: faroPurchaseDateIso,
        });

        if (!repost.posted || !repost.journal_entry_id) {
          throw new Error(`repost failed -- posted=${repost.posted} reason=${repost.reason}`);
        }

        await client.query("COMMIT");
        plan.status = "POSTED";
        plan.journal_entry_id = repost.journal_entry_id;
        console.log(`  -> posted, je=${repost.journal_entry_id}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        plan.status = `FAILED -- ${err instanceof Error ? err.message : String(err)}`;
        console.error(`  -> ${plan.status}`);
      } finally {
        client.release();
      }
      results.push(plan);
    } catch (err) {
      plan.status = `FAILED (parse) -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(JSON.stringify(plan));
      results.push(plan);
    }
  }

  console.log("\n=== SUMMARY ===");
  const byStatus = new Map<string, number>();
  for (const r of results) {
    const key = String(r.status).split(" -- ")[0];
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }
  for (const [k, v] of byStatus) console.log(`  ${k}: ${v}`);

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
