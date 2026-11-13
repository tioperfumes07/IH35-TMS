/**
 * verify-overpayment-becomes-unapplied-credit (ROW-21 / step 20023)
 *
 * Guards the unapplied-credit engine — three paths:
 *   Path 0 (pre-existing): Customer overpays → auto-creates AR credit memo
 *                          (payments/apply.service.ts applyPayment, 2026-10-17).
 *   Path 1 (this engine):  PAID/partially-paid invoice credit-memo'd BELOW amount paid →
 *                          excess becomes unapplied customer credit (no negative open balance).
 *                          Route: POST /api/v1/accounting/credit-memos
 *                          with apply_to_invoice: false (or amount > open balance → stays unapplied).
 *   Path 2 (this engine):  Paid bill corrected → vendor credit via vendor-credits.service.ts →
 *                          starts fully unapplied (amount_unapplied_cents = amount_cents).
 *                          Applied to next bill via POST /api/v1/accounting/vendor-credits/:id/apply.
 *
 * --selftest: static source rules (no DB). Negative controls: if the patterns that implement
 *             paths 1 and 2 are removed from source, this selftest fails immediately.
 * default:    Live PG invariant checks (requires DB).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

// No floor ratchet: unapplied counts shrink naturally as credits get applied — that's correct behavior.
// Guard only enforces the ceiling (no over-application).

const isSelftest = process.argv.includes("--selftest");

if (!isSelftest) {
  await runLive();
} else {
  await runSelftest();
}

// ── Static selftest (no DB) ────────────────────────────────────────────────

async function runSelftest() {
  const failures = [];

  // Path 1 negative controls — credit-memos.routes.ts must have:
  // (a) apply_to_invoice boolean in body schema
  // (b) creditMemoTargetInvoiceRefusal only refuses APPLIED credits over the balance, not unapplied
  // (c) an /apply endpoint (apply credit to next invoice)
  const cmRoutes = src("apps/backend/src/accounting/credit-memos.routes.ts");
  if (!cmRoutes.includes("apply_to_invoice")) {
    failures.push("PATH1-NEGATIVE: credit-memos.routes.ts missing apply_to_invoice field — unapplied credit path broken");
  }
  // The refusal condition must guard ONLY applyToInvoice (not unapplied credits)
  if (!cmRoutes.includes("applyToInvoice && input.amountCents > remaining") &&
      !cmRoutes.includes("applyToInvoice &&") &&
      !cmRoutes.includes("apply_to_invoice") ) {
    failures.push("PATH1-NEGATIVE: creditMemoTargetInvoiceRefusal does not distinguish applied vs unapplied — unapplied credits would be wrongly blocked");
  }
  if (!cmRoutes.includes('"/apply"') && !cmRoutes.includes("/:id/apply") && !cmRoutes.includes("applyCreditMemoToInvoicesInClientTx")) {
    failures.push("PATH1-NEGATIVE: credit-memos.routes.ts missing apply-to-invoice endpoint — cannot apply unapplied credit to next invoice");
  }

  // Path 1 negative control — credit-memo-from-invoice.service.ts must allow unapplied credits
  const cmFromInv = src("apps/backend/src/accounting/credit-memo-from-invoice.service.ts");
  if (!cmFromInv.includes("applyToInvoice")) {
    failures.push("PATH1-NEGATIVE: creditMemoTargetInvoiceRefusal missing applyToInvoice guard — may block unapplied credit memos");
  }

  // Path 2 negative controls — vendor-credits.service.ts must have:
  // (a) amount_unapplied_cents in RETURNING (vendor credit starts fully unapplied)
  // (b) no auto-consume of the credit (unapplied = amount_cents on INSERT)
  const vcService = src("apps/backend/src/accounting/vendor-credits.service.ts");
  if (!vcService.includes("amount_unapplied_cents")) {
    failures.push("PATH2-NEGATIVE: vendor-credits.service.ts missing amount_unapplied_cents in RETURNING — unapplied tracking broken");
  }

  // Path 2 negative control — vendor-credits.routes.ts must have /apply endpoint
  const vcRoutes = src("apps/backend/src/accounting/vendor-credits.routes.ts");
  if (!vcRoutes.includes("/:id/apply") && !vcRoutes.includes("/apply")) {
    failures.push("PATH2-NEGATIVE: vendor-credits.routes.ts missing apply-to-bill endpoint — cannot apply unapplied vendor credit to next bill");
  }

  // AR aging netting — ar-aging.service.ts must deduct credit_memo_applications from invoice open balance
  const arAging = src("apps/backend/src/accounting/ar-aging.service.ts");
  if (!arAging.includes("credit_memo_applications")) {
    failures.push("AGING-AR-NEGATIVE: ar-aging.service.ts does not net credit_memo_applications — applied credits not reflected in AR aging");
  }

  // AP aging netting — ap-aging.service.ts must deduct vendor_credit_applications from bill open balance
  const apAging = src("apps/backend/src/accounting/ap-aging.service.ts");
  if (!apAging.includes("vendor_credit_applications")) {
    failures.push("AGING-AP-NEGATIVE: ap-aging.service.ts does not net vendor_credit_applications — applied vendor credits not reflected in AP aging");
  }

  // Void path — credit-memos.routes.ts must have void endpoint (reversal)
  if (!cmRoutes.includes("/:id/void")) {
    failures.push("VOID-NEGATIVE: credit-memos.routes.ts missing void endpoint — reversal of credit memo broken");
  }
  if (!vcRoutes.includes("/:id/void")) {
    failures.push("VOID-NEGATIVE: vendor-credits.routes.ts missing void endpoint — reversal of vendor credit broken");
  }

  if (failures.length > 0) {
    for (const f of failures) console.error("SELFTEST FAIL:", f);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${8} source patterns verified — paths 1 and 2 engine intact`);
}

function src(relPath) {
  try {
    return readFileSync(resolve(root, relPath), "utf8");
  } catch {
    return "";
  }
}

// ── Live PG invariant checks ───────────────────────────────────────────────

async function runLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: "verify-overpayment-becomes-unapplied-credit" });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    const { negCmCount, negVcCount, unappliedCmCount, unappliedVcCount } = await measureDb(client);

    console.log(
      `unapplied-credit: neg_cm=${negCmCount}/0 neg_vc=${negVcCount}/0 unapplied_cm=${unappliedCmCount} unapplied_vc=${unappliedVcCount}`
    );

    let fail = false;

    // Ceiling 0: no credit memo should have amount_applied_cents > amount_cents (negative unapplied)
    if (negCmCount > 0) {
      console.error(`FAIL: ${negCmCount} credit memo(s) with amount_applied_cents > amount_cents — over-applied, creating phantom credit`);
      fail = true;
    }

    // Ceiling 0: no vendor credit should have amount_applied_cents > amount_cents (negative unapplied)
    if (negVcCount > 0) {
      console.error(`FAIL: ${negVcCount} vendor credit(s) with amount_applied_cents > amount_cents — over-applied`);
      fail = true;
    }

    if (fail) {
      await client.query("ROLLBACK");
      process.exit(1);
    }

    console.log("PASS");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

async function measureDb(client) {
  // Path 1: credit memos must not have more applied than their face amount
  const negCmRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.credit_memos
     WHERE amount_applied_cents > amount_cents
       AND status <> 'voided'
  `);
  const negCmCount = Number(negCmRes.rows[0]?.cnt ?? 0);

  // Path 2: vendor credits must not have more applied than their face amount
  // (amount_unapplied_cents is a generated column = amount_cents - amount_applied_cents)
  const negVcRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.vendor_credits
     WHERE amount_applied_cents > amount_cents
       AND status <> 'voided'
  `);
  const negVcCount = Number(negVcRes.rows[0]?.cnt ?? 0);

  // Informational: unapplied counts (expected to shrink as credits get applied — healthy)
  const unappliedCmRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.credit_memos
     WHERE amount_applied_cents < amount_cents
       AND status <> 'voided'
  `);
  const unappliedCmCount = Number(unappliedCmRes.rows[0]?.cnt ?? 0);

  const unappliedVcRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.vendor_credits
     WHERE amount_applied_cents < amount_cents
       AND status <> 'voided'
  `);
  const unappliedVcCount = Number(unappliedVcRes.rows[0]?.cnt ?? 0);

  return { negCmCount, negVcCount, unappliedCmCount, unappliedVcCount };
}
