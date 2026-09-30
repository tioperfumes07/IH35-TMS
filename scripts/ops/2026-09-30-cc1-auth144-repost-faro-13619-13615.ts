/**
 * AUTH-144: repost the 2 factoring advances for loads 13619 and 13615, which currently carry
 * ZERO live GL entry, using REAL numbers verified against Faro's own source workbooks (not the
 * corrupted/disputed load-attribution theory that caused them to be voided in the first place).
 *
 * BACKGROUND -- WHY THESE TWO ARE DIFFERENT FROM THE OTHER 42 IN AUTH-113/ROUND-190.
 * AUTH-113 (2026-09-28) found that 42 of the original 44 "reversed with no live posting" advances
 * already had an ALREADY-LIVE correct twin elsewhere, so none of the 44 needed reposting -- EXCEPT
 * it explicitly named these same two loads (13615/13619, then FAC-2026-00086/00090) as ALSO having
 * live twins at that time (FAC-2026-00125 and FAC-2026-00097). Verified live today (2026-09-30):
 * those twins, and every subsequent "ROUND-175 restore" attempt on top of them, are ALL voided now
 * (a second, later correction round -- "ROUND-175 reversal -- load identity unproven, Lead ruling
 * 172-Updated" -- voided the restores too, chasing an alternate load-identity theory). Current live
 * state: mdata.loads 13619 and 13615 each have exactly ONE invoice (faf63fe4.../3cbd5b56...) and
 * ZERO live factoring_advances row. AUTH-113's "already correct elsewhere" conclusion is no longer
 * true -- the elsewhere copy was itself voided one round later.
 *
 * THE LOAD-IDENTITY DISPUTE IS RESOLVED, WITH SOURCE, NOT GUESSED.
 * ROUND-172's void reasoned "AT+Faro say ON POINT/34217" (for 13619) and "AT+Faro 095 say SEM66529"
 * (for 13615) instead of the original attribution. Checked directly against the owner's own Faro
 * export workbooks today:
 *   - `~/Downloads/IH35-MASTER-RECONCILIATION/07-RECONCILIATION-OUTPUT/09-22-2026-FARO-COMPLETE-
 *     CROSS-REFERENCE-FINAL.xlsx`, sheet "FARO INVOICE -> LOAD": Faro Inv# 87 / PO SEM66538 = Load#
 *     13615, note "W.O. digit variant between Faro and AlwaysTrack; load confirmed by the prior
 *     reconciliation" -- i.e. SEM66538 (exactly what the live invoice's customer_wo_number already
 *     is) is the CORRECT PO, not SEM66529.
 *   - `~/Downloads/IH35-MASTER-RECONCILIATION/07-RECONCILIATION-OUTPUT/IH35-FARO-FULL-
 *     RECONCILIATION-2026-09-22.xlsx`, raw Faro AGING sheet: ID 405560 / Invoice 1013272-2 /
 *     Refrigerx Transportation LLC -- 1013272-2 is exactly load 13619's own customer_wo_number.
 *     (This same raw sheet's "PO" column wrongly shows "59" for this row -- THE-CLOSE-LOCKED
 *     section 2 already flags this exact field-swap: invoice 59 is Armstrong Transport, this
 *     Refrigerx purchase is genuinely unnumbered by Faro's own invoice-number scheme. "59" is
 *     NEVER written anywhere as this purchase's faro_invoice_number in this script.)
 * Both loads' own live customer_wo_number already ties to the correct Faro reference by an exact
 * string match, not a fuzzy one. The ON POINT/34217 and SEM66529 alternate theories are not used.
 *
 * THE DOLLAR FIGURES -- FROM FARO'S OWN REPORT, TIE TO THE PENNY, MATCH THE ORIGINAL VOIDED ROW.
 * 13619 (Faro ID 405560, invoice 1013272-2, purchased 9/8/26): Purchase $5,210.00, Escrow Rsv
 * $78.15, Cash Rsv $0, Discount $78.15, Fees $0, Net Adv $5,053.70 -- and the Faro PAYMENTS sheet
 * confirms this was actually wired 9/8/26 ("USMCA Tank 09/08/2026"). 78.15+78.15+0+5053.70 =
 * 5210.00 exactly. These are the EXACT cents already sitting on the original voided row
 * (1f09c82c-81f2-4908-b1a4-577461be4ade, advance_amount_cents=505370) -- the row's own numbers were
 * correct all along; only the void (over a load-identity theory since refuted) was wrong.
 * 13615 (Faro invoice 87, PO SEM66538, purchased 9/21/26): Purchase $4,900.00, Escrow Rsv $73.50,
 * Cash Rsv $0, Discount $73.50, Fees $0, Net Adv $4,753.00 (Faro's "FUNDS DUE" sheet lists this
 * exact $4,753.00/Wire as due against invoice 87 -- consistent with every other S E Mares invoice
 * in the same report, which are same-day-or-next-day wires). 73.50+73.50+0+4753.00 = 4900.00
 * exactly -- again the EXACT cents already on the original voided row
 * (9667e71c-9f29-44ff-af31-f28ffb43282b, advance_amount_cents=475300).
 *
 * WHAT THIS SCRIPT DOES -- same sanctioned pattern as
 * scripts/ops/2026-09-28-round190-repost-44-faro-advances.ts (reused verbatim, no new GL math):
 *   1. UPDATE the header back to status='advanced', clear voided_at/void_reason/voided_by_user_id,
 *      set reserve/factor_fee/wire_fee/cash_rsv/advance cents to the reconciled values above
 *      (they are already these values, but set explicitly so the write is self-documenting and
 *      idempotent against any future drift), append (never overwrite) a note.
 *   2. postFactoringAdvanceEventInClientTx (apps/backend/src/accounting/factoring-posting/
 *      poster.service.ts) -- the SAME engine every other advance uses -- with these funding_figures,
 *      faro_invoice_number/faro_purchase_date set from the values above. Never a raw INSERT into
 *      journal_entries/journal_entry_postings.
 *   3. Verifies a NEW live journal_entry_id came back; aborts that row's own transaction otherwise.
 * Each row is its own transaction. DRY_RUN=1 (default) prints the full plan, zero writes.
 *
 * PRE-FLIGHT CHECKED LIVE BEFORE WRITING THIS SCRIPT: uq_factoring_advances_faro_invoice_number is
 * a partial unique index on (operating_company_id, faro_invoice_number) WHERE faro_invoice_number
 * IS NOT NULL -- it does NOT exclude voided rows. Checked live: no OTHER row (voided or live) in
 * USMCA currently holds faro_invoice_number = '1013272-2' or '87' except these same two target rows
 * -- this UPDATE cannot collide with the index.
 *
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-144, docs/bus/OWNER-AUTHORIZATIONS.md, verified via
 * scripts/verify-owner-authorization.mjs (run from repo root).
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth144-repost-faro-13619-13615.ts
 *   OWNER_AUTH_ID=AUTH-144 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth144-repost-faro-13619-13615.ts
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

type Target = {
  id: string;
  load: string;
  faroInvoiceNumber: string;
  faroPurchaseDateIso: string;
  invoiceTotalCents: number;
  reserveCents: number;
  feeCents: number;
  wireFeeCents: number;
  cashRsvCents: number;
  advanceCents: number;
};

const TARGETS: Target[] = [
  {
    id: "1f09c82c-81f2-4908-b1a4-577461be4ade",
    load: "13619",
    faroInvoiceNumber: "1013272-2",
    faroPurchaseDateIso: "2026-09-08",
    invoiceTotalCents: 521000,
    reserveCents: 7815,
    feeCents: 7815,
    wireFeeCents: 0,
    cashRsvCents: 0,
    advanceCents: 505370,
  },
  {
    id: "9667e71c-9f29-44ff-af31-f28ffb43282b",
    load: "13615",
    faroInvoiceNumber: "87",
    faroPurchaseDateIso: "2026-09-21",
    invoiceTotalCents: 490000,
    reserveCents: 7350,
    feeCents: 7350,
    wireFeeCents: 0,
    cashRsvCents: 0,
    advanceCents: 475300,
  },
];

async function main() {
  const { postFactoringAdvanceEventInClientTx } = await import(
    "../../apps/backend/src/accounting/factoring-posting/poster.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  // READ PHASE -- confirm current header state before writing anything.
  const readClient = await pool.connect();
  let rows: Array<{ id: string; display_id: string; status: string; voided_at: string | null; invoice_total_cents: string; faro_invoice_number: string | null }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await readClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
    const res = await readClient.query(
      `SELECT id::text, display_id, status::text, voided_at::text, invoice_total_cents::text, faro_invoice_number
         FROM accounting.factoring_advances
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])
        ORDER BY id`,
      [USMCA_ID, TARGETS.map((t) => t.id)]
    );
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  if (rows.length !== TARGETS.length) {
    throw new Error(`Expected ${TARGETS.length} advances, found ${rows.length} -- STOP`);
  }

  // Collision pre-check: no OTHER row may already hold either target faro_invoice_number.
  const collideClient = await pool.connect();
  try {
    await collideClient.query("BEGIN");
    await collideClient.query("RESET ROLE");
    await collideClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const collide = await collideClient.query(
      `SELECT id::text, display_id, faro_invoice_number FROM accounting.factoring_advances
        WHERE operating_company_id = $1::uuid AND faro_invoice_number = ANY($2::text[])
          AND id != ALL($3::uuid[])`,
      [USMCA_ID, TARGETS.map((t) => t.faroInvoiceNumber), TARGETS.map((t) => t.id)]
    );
    await collideClient.query("COMMIT");
    if (collide.rows.length > 0) {
      throw new Error(`Collision pre-check FAILED -- another row already holds a target faro_invoice_number: ${JSON.stringify(collide.rows)}`);
    }
  } finally {
    collideClient.release();
  }

  for (const target of TARGETS) {
    const row = rows.find((r) => r.id === target.id)!;
    const plan: Record<string, unknown> = { load: target.load, display_id: row.display_id, id: target.id };

    const sumCents = target.reserveCents + target.feeCents + target.wireFeeCents + target.cashRsvCents + target.advanceCents;
    plan.reconciliation = { sumCents, invoiceTotalCents: target.invoiceTotalCents, ties: sumCents === target.invoiceTotalCents };
    if (sumCents !== target.invoiceTotalCents) {
      plan.status = `SKIP -- reconciliation failed: sum=${sumCents} invoice_total=${target.invoiceTotalCents}`;
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }
    if (Number(row.invoice_total_cents) !== target.invoiceTotalCents) {
      plan.status = `SKIP -- live invoice_total_cents (${row.invoice_total_cents}) does not match expected (${target.invoiceTotalCents})`;
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
                cash_rsv_cents = $5, advance_amount_cents = $6, faro_invoice_number = $7,
                faro_purchase_date = $8::date,
                notes = notes || ' | AUTH-144 REPOST: load-identity dispute resolved against Faro source workbooks (FARO-COMPLETE-CROSS-REFERENCE-FINAL.xlsx, FARO-FULL-RECONCILIATION-2026-09-22.xlsx), figures tie to the cent, reconciled and reposted via sanctioned poster'
          WHERE id = $1::uuid AND operating_company_id = $9::uuid`,
        [target.id, target.reserveCents, target.feeCents, target.wireFeeCents, target.cashRsvCents, target.advanceCents, target.faroInvoiceNumber, target.faroPurchaseDateIso, USMCA_ID]
      );

      const repost = await postFactoringAdvanceEventInClientTx(client, {
        operating_company_id: USMCA_ID,
        factoring_advance_id: target.id,
        actor_user_id: SYSTEM_ACTOR_USER_ID,
        funding_figures: {
          invoice_total_cents: target.invoiceTotalCents,
          reserve_cents: target.reserveCents,
          fee_cents: target.feeCents,
          ach_cents: target.wireFeeCents,
          cash_rsv_cents: target.cashRsvCents,
        },
        faro_invoice_number: target.faroInvoiceNumber,
        faro_purchase_date: target.faroPurchaseDateIso,
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
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
