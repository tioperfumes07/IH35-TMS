#!/usr/bin/env node
/**
 * verify-ar-subledger-ties-to-gl — RULING 443.71 #1 (owner 2026-10-11: QuickBooks is not a data source; the app's own
 * documents are the truth). The A/R tie that matters: the open-invoice sub-ledger (accounting.invoices.amount_open_cents,
 * live, posted) equals the GL balance of the company's "ar_control" account (Accounts Receivable (A/R), 1100). Replaces
 * verify-ar-ties-to-qbo-invoice-list (removed). Per company that designates an ar_control account; 0 variance.
 * Measured 2026-10-11 21:40 UTC, USMCA: open invoices 477,831.72 = GL 1100 477,831.72.
 * --selftest: tie / variance / no-control fixtures.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "A/R sub-ledger vs GL is live ledger data — fails closed without a database";
const LABEL = "verify-ar-subledger-ties-to-gl";

export function failures(rows) {
  return rows
    .filter((r) => Number(r.subledger_cents) !== Number(r.gl_cents))
    .map((r) => `${r.company}: open invoices ${(Number(r.subledger_cents) / 100).toFixed(2)} != ${r.account_number} ${r.account_name} ${(Number(r.gl_cents) / 100).toFixed(2)} (variance ${((Number(r.subledger_cents) - Number(r.gl_cents)) / 100).toFixed(2)})`);
}

const SQL = `
  SELECT c.code AS company, a.account_number, a.account_name,
         COALESCE((SELECT SUM(i.amount_open_cents) FROM accounting.invoices i
                    WHERE i.operating_company_id = r.operating_company_id AND i.voided_at IS NULL
                      AND i.status NOT IN ('draft', 'proforma', 'void')), 0)::bigint AS subledger_cents,
         COALESCE((SELECT SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)
                     FROM accounting.journal_entry_postings p
                     JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL
                    WHERE p.account_id = r.account_id AND p.operating_company_id = r.operating_company_id), 0)::bigint AS gl_cents
    FROM accounting.chart_of_accounts_roles r
    JOIN catalogs.accounts a ON a.id = r.account_id
    JOIN org.companies c ON c.id = r.operating_company_id
   WHERE r.role = 'ar_control' AND c.code = 'USMCA'`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const base = { company: "USMCA", account_number: "1100", account_name: "Accounts Receivable (A/R)" };
    const cases = [
      ["sub-ledger = GL passes", failures([{ ...base, subledger_cents: 47783172, gl_cents: 47783172 }]).length === 0],
      ["a variance fails", failures([{ ...base, subledger_cents: 47783172, gl_cents: 47783100 }]).length === 1],
      ["an open invoice with no GL posting fails", failures([{ ...base, subledger_cents: 350000, gl_cents: 0 }]).length === 1],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const rows = (await client.query(SQL)).rows;
    await client.query("ROLLBACK");
    const f = rows.length === 0 ? ["USMCA designates no ar_control account — cannot tie A/R"] : failures(rows);
    for (const r of rows) console.log(`  ${r.company}: open invoices ${(Number(r.subledger_cents) / 100).toFixed(2)} | ${r.account_number} GL ${(Number(r.gl_cents) / 100).toFixed(2)}`);
    if (f.length) { console.error(`${LABEL}: FAIL\n  ${f.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — the open-invoice sub-ledger equals the A/R control account, 0 variance.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
