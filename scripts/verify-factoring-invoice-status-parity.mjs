#!/usr/bin/env node
/**
 * verify-factoring-invoice-status-parity — CC-2 / verify-step 19915
 *
 * CODER-34 Secured-Borrowing law: Faro factoring is a secured loan, NOT a sale.
 * invoice.status MUST remain 'sent' (or 'partial'/'paid') after an advance.
 * 'factored' is an illegal status under CODER-34.
 *
 * Also verifies that every invoice with factoring_status IN
 * ('advanced','reserve_held','collected','released') is linked to a posted
 * factoring_purchase_line (the purchase recorded the advance).
 *
 * Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B).
 *
 * Usage: node scripts/verify-factoring-invoice-status-parity.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-factoring-invoice-status-parity";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

export function factoringStatusVerdict(factoredCount, orphanCount) {
  if (factoredCount > 0) return { kind: "fail", reason: `F1: ${factoredCount} invoice(s) have status='factored' — illegal under CODER-34` };
  if (orphanCount > 0) return { kind: "fail", reason: `F2: ${orphanCount} advanced invoice(s) lack a factoring_purchase_line` };
  return { kind: "pass" };
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["0 factored + 0 orphan → PASS", factoringStatusVerdict(0, 0).kind === "pass"],
    ["1 factored → FAIL", factoringStatusVerdict(1, 0).kind === "fail"],
    ["0 factored + 1 orphan → FAIL", factoringStatusVerdict(0, 1).kind === "fail"],
  ];
  const bad = cases.filter(([, ok]) => !ok).length;
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  console.log(bad ? `${LABEL} --selftest FAIL (${bad} bad)` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

async function live() {
  const { client } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const factoredRes = await client.query(`
      SELECT COUNT(*)::int AS n
      FROM accounting.invoices
      WHERE status = 'factored'
        AND COALESCE(is_sample_data, false) = false
    `);

    const orphanRes = await client.query(`
      SELECT COUNT(*)::int AS n
      FROM accounting.invoices i
      WHERE i.factoring_status IN ('advanced','reserve_held','collected','released')
        AND COALESCE(i.is_sample_data, false) = false
        AND NOT EXISTS (
          SELECT 1
          FROM accounting.factoring_purchase_lines fpl
          WHERE fpl.invoice_id = i.id
        )
    `);

    await client.query("COMMIT");

    const factoredCount = Number(factoredRes.rows[0].n);
    const orphanCount = Number(orphanRes.rows[0].n);
    const verdict = factoringStatusVerdict(factoredCount, orphanCount);

    if (verdict.kind === "fail") {
      console.error(`${LABEL}: FAIL — ${verdict.reason}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — factored-status=0 advanced-without-purchase-line=0`);
  } finally {
    await client.end().catch(() => {});
  }
}

live();
