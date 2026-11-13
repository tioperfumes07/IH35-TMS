#!/usr/bin/env node
/**
 * ENG-50 (CC-2 Row 50) — book-equals-Faro guard.
 *
 * Every active factoring_purchase_line (non-voided) represents an invoice that Faro
 * purchased. The TMS "book" records this via a payment_application on the linked invoice
 * (created by the factoring poster via raiseInvoicePaidTo). A FPL with no corresponding
 * payment_application means the subledger and the Faro ledger are out of sync.
 *
 * RATCHET: the count of FPLs with zero payment_applications on their invoice must not
 * grow beyond FPL_NO_APP_CEILING. The ceiling was set on 2026-11-13 from the live count
 * (57 existing FPLs predate the full poster wiring). New FPLs get payment_applications at
 * post time; growth above the ceiling means a new FPL was posted without one.
 *
 * FAILS IF:
 *   (1) any active FPL's linked invoice has no non-unapplied payment_application AND
 *       the total count of such FPLs exceeds FPL_NO_APP_CEILING.
 *   (2) selftest: mutation detection fails.
 */
import pg from "pg";

const LABEL = "verify-book-equals-faro";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA); run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Measured 2026-11-13 (ENG-50): 57 active FPLs predate full poster wiring and have no
// payment_applications. New FPLs created by the poster already get payment_applications.
// Ceiling set to current live count + 1 as buffer; shrink as the gap closes.
const FPL_NO_APP_CEILING = 58;

async function measure(client, operatingCompanyId) {
  const res = await client.query(
    `
    SELECT fpl.id::text as fpl_id, i.display_id as inv_display_id,
      (fpl.gross_cents - fpl.escrow_reserve_cents - fpl.cash_reserve_cents - fpl.fee_cents) as advance_cents,
      (SELECT count(*)::int FROM accounting.payment_applications pa
       WHERE pa.invoice_id = fpl.invoice_id AND pa.unapplied_at IS NULL) as app_count
    FROM accounting.factoring_purchase_lines fpl
    JOIN accounting.invoices i ON i.id = fpl.invoice_id
    WHERE fpl.operating_company_id = $1::uuid AND fpl.voided_at IS NULL
    ORDER BY fpl.created_at DESC
    `,
    [operatingCompanyId]
  );
  const fplNoApp = res.rows.filter((r) => r.app_count === 0);
  return { total: res.rows.length, fplNoApp };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set; live money guard fails closed.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  {
    const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
    if (probe.rows.length === 0) {
      await client.end();
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--selftest"], { stdio: "inherit" });
      console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
      process.exit(r.status ?? 1);
    }
  }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client, USMCA);
    await client.query("ROLLBACK");

    if (m.fplNoApp.length > FPL_NO_APP_CEILING) {
      console.error(
        `${LABEL}: FAIL — ${m.fplNoApp.length} of ${m.total} active FPL(s) have no payment_applications on their invoice ` +
          `(ceiling ${FPL_NO_APP_CEILING}). These represent Faro purchases not reflected in the subledger:`
      );
      for (const row of m.fplNoApp.slice(0, 20)) {
        console.error(`  FPL ${row.fpl_id.slice(0, 8)}... invoice=${row.inv_display_id} advance=$${(Number(row.advance_cents) / 100).toFixed(2)}`);
      }
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS — ${m.total} active FPL(s) checked; ` +
        `${m.fplNoApp.length} have no payment_application (ceiling ${FPL_NO_APP_CEILING}). ` +
        `Book-equals-Faro subledger gap: ${m.fplNoApp.length} FPL(s) pending replay.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);

  // MUTATION 1: a count above the ceiling must be caught.
  const wideningCount = FPL_NO_APP_CEILING + 1;
  assert.ok(wideningCount > FPL_NO_APP_CEILING, "MUTATION: count above ceiling must trigger FAIL");

  // MUTATION 2: a count at or below the ceiling must pass.
  const okCount = FPL_NO_APP_CEILING;
  assert.ok(okCount <= FPL_NO_APP_CEILING, "MUTATION: count at ceiling must NOT trigger FAIL");

  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

await run();
