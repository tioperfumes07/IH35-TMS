#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r15513-j5-resolve-zero-line-presettlements.ts — AUTH-102
 *
 * ROUND 155.13 item 5 (also 155.13 J5): P-0001 ($1,694.50), P-0003 ($910.90), P-0005 ($940.27),
 * P-0007 ($3.46) — four USMCA open pre-settlements. Live-verified before this script was written
 * (not from any earlier snapshot): all four now HAVE lines (a concurrent backfill process
 * materialized driver_finance.settlement_lines from driver_finance.driver_bills between the
 * original "zero lines" report and now), so the defect is not "missing lines" — it is that the
 * lines that exist are WRONG for two independent, evidenced reasons:
 *
 * (1) P-0001 (Genaro Guerrero Chavez) covers loads 13610 and 13619 — the SAME two loads already
 *     correctly, real-posted this session as settlement 5817 (driver_finance.driver_settlements
 *     P-0015, source_document_ref='5817'), built from the signed Driver_Settlement_5817.pdf at
 *     $0.45/mile: 13610 = $830.88, 13619 = $714.02 + $122.76 empty = $836.78. P-0001's own lines
 *     use DIFFERENT numbers for the SAME loads (13610 = $913.44, 13619 = $781.06) sourced from
 *     driver_finance.driver_bills at a flat $0.48/mile with different (GPS-tracked, not
 *     AlwaysTrack-printed) mileage. Keeping P-0001 open would double-count driver pay for loads
 *     already paid via the real, signed-document-verified 5817. P-0001 is cancelled here, not
 *     built out further and not deleted (void-not-delete).
 *
 * (2) P-0003 (Carlos Mauricio Pena Carvallo, load 13613), P-0005 (Jorge Luis Infante Corona, load
 *     13615), P-0007 (Rafael Rogelio Rivero Reynoso, load 13563) do NOT overlap any already-posted
 *     real settlement, but their existing lines were ALSO sourced from driver_bills rows carrying
 *     the same anomalous rate_per_mile_cents=48 — and critically, all five of the affected
 *     driver_bills rows (13610, 13613, 13615, 13619, 13563) share the EXACT SAME created_at
 *     timestamp, 2026-09-25T01:15:48.605Z, to the millisecond: a single batch write, not five
 *     independent real rates. The company's real, established per-mile rate is $0.45 — confirmed
 *     from three independent signed/historical sources: (a) Genaro's own signed 5817 PDF, (b)
 *     Ruben's own signed 5818 PDF, (c) this same driver Rafael's own OTHER driver_bills row for
 *     load 13544 (rate_per_mile_cents=45, a real value stored outside the anomalous batch), and
 *     (d) Jorge Luis Infante Corona's own multiple historical PAID settlements (e.g. load 13504,
 *     Paid settlement 5771, rate_per_mile_cents=45). Only Neftali's real settlement 5819 used
 *     $0.50/mile (a different truck/route), so $0.45 is not a blind company-wide assumption — it
 *     is this driver's own confirmed rate in 4 of 5 cases and the company-standard baseline in the
 *     fifth (Carlos), whose own specific historical per-mile rate could not be independently
 *     recovered from stored data (older paid driver_bills rows for Carlos have miles_basis/
 *     rate_per_mile_cents both NULL — only a final gross_amount_cents survives). This is disclosed
 *     as a rate-correction judgment call, not a certainty, exactly per the law: "read the export
 *     before deciding which side is wrong; do not zero a header to make a check go green" — this
 *     script does not zero anything; it corrects a demonstrably wrong per-mile rate to the
 *     company's own confirmed real rate and computes the resulting total honestly, whatever it is.
 *
 * NO_DIRECT_SQL_FOR_WRITES is not fully achievable here: there is no existing service function for
 * "correct a settlement line's rate and recompute the header" (the Settlement Creator engine only
 * builds NEW settlements from a draft, it does not edit an existing pre-settlement's lines) — this
 * follows the exact precedent this session already set for the same class of correction:
 * scripts/ops/2026-09-28-cc2-r15511b-fix-5812-deductions.ts (void the wrong line via is_active=
 * false + void_reason, INSERT the corrected line, recompute net_pay/gross_pay as SUM of active
 * lines, REFUSE if it does not land on the honestly-computed target — never plug a total).
 *
 * `is_sample_data` is never set true — these are real USMCA operations.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15513-j5-resolve-zero-line-presettlements.ts --dry-run
 *   OWNER_AUTH_ID=AUTH-102 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15513-j5-resolve-zero-line-presettlements.ts --apply
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // identity.users tioperfumes07@gmail.com, Owner
const AUTH_ID = "AUTH-102";
const CORRECT_RATE_CENTS = 45;

const P0001 = "b69dfafb-7287-42f6-b46b-19257c9e7095";
const P0003 = "8018fe04-aa8b-417b-aeb5-fbb95edd6901";
const P0005 = "ad9b4662-4b0d-47ad-9709-73f2c359b913";
const P0007 = "404c9b38-4c5c-467c-b732-47f6eca7cb0f";

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (apply && process.env.OWNER_AUTH_ID !== AUTH_ID) {
    console.error(
      `REFUSED: --apply requires OWNER_AUTH_ID=${AUTH_ID} and an OPEN ${AUTH_ID} entry in ` +
        `docs/bus/OWNER-AUTHORIZATIONS.md. Neither is present. Run --dry-run instead.`,
    );
    process.exit(1);
  }
  if (apply) {
    execFileSync("node", ["scripts/verify-owner-authorization.mjs", AUTH_ID], {
      cwd: ROOT,
      stdio: "inherit",
    });
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    // ---- Fresh live state, inside this transaction ----
    const headers = await client.query<{
      id: string;
      display_id: string;
      status: string;
      net_pay: string;
      gross_pay: string;
    }>(
      `SELECT id, display_id, status, net_pay, gross_pay FROM driver_finance.driver_settlements
       WHERE id = ANY($1::uuid[]) ORDER BY display_id`,
      [[P0001, P0003, P0005, P0007]],
    );
    console.log("Fresh headers:");
    console.table(headers.rows);

    // ---- Part 1: P-0001 -- cancel, superseded by real settlement 5817 (P-0015) ----
    const p0001Lines = await client.query<{ id: string; description: string; amount: string; load_id: string }>(
      `SELECT id, description, amount, load_id FROM driver_finance.settlement_lines
       WHERE settlement_id = $1 AND is_active = true`,
      [P0001],
    );
    console.log(`P-0001 active lines (${p0001Lines.rowCount}):`, p0001Lines.rows);

    // Verify the loads on P-0001's lines really are the same loads already covered by real
    // settlement 5817/P-0015 -- refuse to cancel blind.
    const overlap = await client.query<{ load_id: string; settlement_display_id: string }>(
      `SELECT sl.load_id, ds.display_id AS settlement_display_id
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
       WHERE sl.load_id = ANY($1::uuid[]) AND sl.settlement_id != $2 AND sl.is_active = true
         AND ds.source_document_ref = '5817'`,
      [p0001Lines.rows.map((r) => r.load_id), P0001],
    );
    const overlapLoadIds = new Set(overlap.rows.map((r) => r.load_id));
    const p0001LoadIds = new Set(p0001Lines.rows.map((r) => r.load_id));
    const missing = [...p0001LoadIds].filter((id) => !overlapLoadIds.has(id));
    if (missing.length > 0) {
      console.error(
        `REFUSED: ${missing.length} of P-0001's loads do NOT appear as an active line on the real ` +
          `5817 settlement: ${missing.join(", ")}. Re-investigate before cancelling.`,
      );
      process.exit(1);
    }
    console.log(`overlap detail (${overlap.rowCount} matching active-line rows on real 5817, covering ${overlapLoadIds.size} distinct loads):`, overlap.rows);
    console.log("Confirmed: every P-0001 load is already an active line on real settlement 5817. Safe to cancel P-0001.");

    if (apply) {
      for (const line of p0001Lines.rows) {
        await client.query(
          `UPDATE driver_finance.settlement_lines
             SET is_active = false, voided_at = now(), voided_by_user_id = $2,
                 void_reason = $3
           WHERE id = $1`,
          [
            line.id,
            OWNER_USER_ID,
            `AUTH-102: duplicate of real, signed-PDF-verified settlement 5817 (driver_finance.driver_settlements P-0015) for the same load -- this line's $0.48/mi driver_bills-sourced figure ($${line.amount}) does not match the signed document's $0.45/mi figure. P-0001 is cancelled, not built out.`,
          ],
        );
      }
      await client.query(
        `UPDATE driver_finance.driver_settlements
           SET status = 'cancelled', voided_at = now(), voided_by_user_id = $2,
               void_reason = $3
         WHERE id = $1`,
        [
          P0001,
          OWNER_USER_ID,
          "AUTH-102 (ROUND 155.13 J5): both loads on this shell (13610, 13619) are already real, signed-PDF-verified settlement 5817 (P-0015), built from Driver_Settlement_5817.pdf at $0.45/mi. This shell's lines were auto-materialized from driver_finance.driver_bills at an anomalous flat $0.48/mi rate (batch created 2026-09-25T01:15:48.605Z) with different GPS-tracked mileage than the signed document. Cancelled as a duplicate to prevent double-paying Genaro Guerrero Chavez for the same two loads.",
        ],
      );
    }

    // ---- Part 2: P-0003, P-0005, P-0007 -- correct the rate, recompute, finalize ----
    const targets = [
      { id: P0003, label: "P-0003 (Carlos Mauricio Pena Carvallo)" },
      { id: P0005, label: "P-0005 (Jorge Luis Infante Corona)" },
      { id: P0007, label: "P-0007 (Rafael Rogelio Rivero Reynoso)" },
    ];

    for (const t of targets) {
      const lines = await client.query<{
        id: string;
        description: string;
        amount: string;
        load_id: string;
        source_driver_bill_id: string;
      }>(
        `SELECT id, description, amount, load_id, source_driver_bill_id FROM driver_finance.settlement_lines
         WHERE settlement_id = $1 AND is_active = true`,
        [t.id],
      );
      if (lines.rowCount !== 1) {
        console.error(`REFUSED: ${t.label} expected exactly 1 active line, found ${lines.rowCount}. Skipping, investigate manually.`);
        continue;
      }
      const oldLine = lines.rows[0];
      const bill = await client.query<{ miles_basis: string; rate_per_mile_cents: number; gross_amount_cents: number; load_number: string }>(
        `SELECT miles_basis, rate_per_mile_cents, gross_amount_cents, load_number FROM driver_finance.driver_bills WHERE id = $1`,
        [oldLine.source_driver_bill_id],
      );
      if (bill.rowCount !== 1) {
        console.error(`REFUSED: ${t.label} could not resolve its source driver_bills row. Skipping.`);
        continue;
      }
      const b = bill.rows[0];
      if (Number(b.rate_per_mile_cents) !== 48) {
        console.error(`REFUSED: ${t.label} source driver_bills rate is ${b.rate_per_mile_cents}, not the expected anomalous 48. Re-investigate before correcting -- do not assume.`);
        continue;
      }
      const miles = Number(b.miles_basis);
      const correctedCents = Math.round(miles * CORRECT_RATE_CENTS);
      const correctedAmount = dollars(correctedCents);

      console.log(
        `${t.label}: load ${b.load_number}, ${miles}mi. Old line $${oldLine.amount} @ $0.48/mi -> ` +
          `corrected $${correctedAmount} @ $0.45/mi (company-confirmed real rate).`,
      );

      if (apply) {
        await client.query(
          `UPDATE driver_finance.settlement_lines
             SET is_active = false, voided_at = now(), voided_by_user_id = $2, void_reason = $3
           WHERE id = $1`,
          [
            oldLine.id,
            OWNER_USER_ID,
            `AUTH-102: sourced from driver_finance.driver_bills at an anomalous flat $0.48/mi rate (batch created 2026-09-25T01:15:48.605Z, shared identically by 5 unrelated loads) -- not this driver's real, established $0.45/mi rate. Corrected line inserted.`,
          ],
        );
        const ins = await client.query<{ id: string }>(
          `INSERT INTO driver_finance.settlement_lines
             (settlement_id, line_type, description, amount, load_id, is_active, driver_visible,
              approval_status, operating_company_id, source_driver_bill_id, quantity, rate_cents,
              unit_of_measure, is_sample_data)
           VALUES
             ($1, 'earnings', $2, $3, $4, true, true, 'pending', $5, $6, $7, $8, 'mi', false)
           RETURNING id`,
          [
            t.id,
            `Load ${b.load_number} — Loaded Miles (rate corrected $0.48→$0.45/mi, AUTH-102)`,
            correctedAmount,
            oldLine.load_id,
            USMCA,
            oldLine.source_driver_bill_id,
            miles,
            CORRECT_RATE_CENTS,
          ],
        );
        console.log(`  inserted corrected line ${ins.rows[0].id}`);

        const sum = await client.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM driver_finance.settlement_lines
           WHERE settlement_id = $1 AND is_active = true`,
          [t.id],
        );
        const total = sum.rows[0].total;
        if (Number(total) !== Number(correctedAmount)) {
          console.error(`REFUSED: ${t.label} active-line sum ($${total}) does not equal the single corrected line ($${correctedAmount}) -- unexpected extra active lines. Rolling back.`);
          process.exit(1);
        }
        await client.query(
          `UPDATE driver_finance.driver_settlements
             SET gross_pay = $2, net_pay = $2, deductions_total = 0.00
           WHERE id = $1`,
          [t.id, total],
        );
        console.log(`  ${t.label} header updated: net_pay=gross_pay=$${total}`);
      }
    }

    if (apply) {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN ONLY — no rows changed. Re-run with --apply once AUTH-102 is OPEN.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
