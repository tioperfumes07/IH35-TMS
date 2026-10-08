#!/usr/bin/env tsx
/**
 * ROUND 441.16 — convert every live money-OUT bank line still categorized as a BARE journal entry into an EXPENSE document,
 * whatever account was chosen (owner/Lead ruling: QBO "Add" always mints the document; the category is only the other
 * leg). Measured 2026-10-07: 30 lines to 2410 Owner / Related-Party Loan Payable, $53,985.00. Same date, same amount, same
 * account (NOT re-coded to 2410's sub-accounts — which person each belongs to is the owner's call), same payer. Only the
 * shape changes; the trial balance moves by exactly $0.00.
 *
 * Through the app, as the Owner:
 *   1. Undo the line (undoBankLineOnClient); the reversal names this finding.
 *   2. Re-categorize it (POST /api/v1/banking/transactions/:id/categorize) with the same account, payer, memo, and the item
 *      for the account. Since ROUND 441.16 that creates and posts the Expense, linked both ways.
 * Every expense line names an item (Lead law 2026-09-30). An account with no item gets one created through POST
 * /api/v1/catalogs/items (owner standing order 2026-08-07). An account with several items is STOPPED and named.
 *
 * RESUMABLE. Undo and re-record are two transactions, so the plan (each line's account, payer, memo and item) is written to
 * --plan-file BEFORE anything changes. A re-run first re-records any planned line that was undone but not re-recorded.
 * Never loses a line's tags.
 *
 * Dry run by default. --execute needs --expect-host = DATABASE_URL's host.
 */
import fs from "node:fs";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "../../apps/backend/src/banking/categorization.routes.js";
import { registerItemRoutes } from "../../apps/backend/src/catalogs/items.routes.js";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { undoBankLineOnClient } from "../../apps/backend/src/banking/bank-line-state-machine.service.js";

const FINDING = "ROUND 441.16: re-recorded as an Expense document (owner: ours works exactly as QuickBooks)";

type PlanLine = {
  bt: string; je: string; date: string; amount_cents: number; description: string;
  account_id: string; account_number: string; account_name: string;
  vendor_id: string | null; customer_id: string | null; memo: string | null; item_id: string | null;
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actor = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const planFile = arg("--plan-file");
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !actor || !planFile) throw new Error("DATABASE_URL, --actor-user-id and --plan-file are required");
  if (execute && new URL(url).hostname !== expectHost) throw new Error("--execute needs --expect-host equal to DATABASE_URL's host");

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  const read = async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const r = await c.query(sql, params);
      await c.query("ROLLBACK");
      return r.rows as T[];
    } finally {
      c.release();
    }
  };
  const [co] = await read<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'USMCA'`);
  const oc = co!.id;
  const [owner] = await read<{ role: string }>(`SELECT role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL`, [actor]);
  if (owner?.role !== "Owner") throw new Error("--actor-user-id must be an active Owner");

  // The plan: carried over from a previous run, plus every live bare money-out categorization now.
  const plan: PlanLine[] = fs.existsSync(planFile) ? (JSON.parse(fs.readFileSync(planFile, "utf8")) as PlanLine[]) : [];
  const fresh = await read<PlanLine & { amount_cents: string }>(
    `SELECT DISTINCT ON (bt.id) bt.id::text AS bt, je.id::text AS je, bt.transaction_date::text AS date,
            abs(bt.amount_cents)::text AS amount_cents, COALESCE(bt.description, '') AS description,
            a.id::text AS account_id, a.account_number, a.account_name,
            bt.categorization_vendor_id::text AS vendor_id, bt.categorization_customer_id::text AS customer_id,
            bt.categorization_memo AS memo, bt.categorization_item_id::text AS item_id
       FROM accounting.journal_entries je
       JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.source_transaction_type = 'bank_categorization'
       JOIN banking.bank_transactions bt ON bt.id::text = p.source_transaction_id AND bt.operating_company_id = je.operating_company_id
       JOIN catalogs.accounts a ON a.id = bt.categorization_gl_account_id
      WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND bt.is_credit = false
      ORDER BY bt.id, je.created_at`,
    [oc]
  );
  for (const f of fresh) if (!plan.some((p) => p.bt === f.bt)) plan.push({ ...f, amount_cents: Number(f.amount_cents) });
  if (execute) fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

  const accountNumbers = [...new Set(["1000", ...plan.map((l) => l.account_number)])];
  const tb = async () =>
    read<{ account_number: string; net_cents: string }>(
      `SELECT a.account_number, COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS net_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings p ON p.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
        WHERE a.operating_company_id = $1::uuid AND a.account_number = ANY($2::text[]) AND (p.id IS NULL OR je.id IS NOT NULL)
        GROUP BY 1 ORDER BY 1`,
      [oc, accountNumbers]
    );
  const before = await tb();

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerItemRoutes(a);
    await registerBankTxCategorizationRoutes(a);
  });
  const headers = { "x-test-auth": Buffer.from(JSON.stringify({ id: actor, role: "Owner", email: null }), "utf8").toString("base64url") };
  const total = plan.reduce((s, l) => s + l.amount_cents, 0);
  const log: string[] = [`ROUND 441.16 convert money-out — ${execute ? "EXECUTE" : "DRY RUN (no writes)"} — USMCA — ${plan.length} lines, ${(total / 100).toFixed(2)}`];
  const done: string[] = [];

  const itemFor = async (l: PlanLine): Promise<string | null> => {
    if (l.item_id) return l.item_id;
    const items = await read<{ id: string }>(
      `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND default_expense_account_id = $2::uuid`,
      [oc, l.account_id]
    );
    if (items.length === 1) return items[0]!.id;
    if (items.length > 1) return null; // a choice among several is a ruling: stop
    const name = `${l.account_name} — Payment`;
    if (!execute) { log.push(`  would CREATE item "${name}" (Charge → ${l.account_number})`); return "dry-run"; }
    const res = await app.inject({
      method: "POST", url: "/api/v1/catalogs/items", headers,
      payload: { operating_company_id: oc, item_name: name, item_type: "Charge", default_expense_account_id: l.account_id,
                 description: `Money paid out against ${l.account_number} ${l.account_name}. Created ROUND 441.16 (no item named it).` },
    });
    if (res.statusCode !== 201) throw new Error(`item create ${name}: ${res.statusCode} ${res.body}`);
    log.push(`  CREATED item "${name}" (Charge → ${l.account_number})`);
    return (JSON.parse(res.body) as { id: string }).id;
  };

  try {
    for (const l of plan) {
      const label = `${l.date} $${(l.amount_cents / 100).toFixed(2)} → ${l.account_number}`;
      const [state] = await read<{ review_state: string; expense_id: string | null; je_live: boolean }>(
        `SELECT bt.review_state, bt.matched_expense_id::text AS expense_id,
                EXISTS (SELECT 1 FROM accounting.journal_entries je WHERE je.id = $2::uuid AND je.reversed_by_je_id IS NULL AND je.status = 'posted') AS je_live
           FROM banking.bank_transactions bt WHERE bt.id = $1::uuid`,
        [l.bt, l.je]
      );
      if (state?.expense_id) { log.push(`  SKIP ${label}: already an expense`); continue; }
      const itemId = await itemFor(l);
      if (!itemId) { log.push(`  STOP ${label}: several items on ${l.account_number}; choosing one is a ruling`); continue; }
      if (!execute) { log.push(`  would CONVERT ${label} (JE ${l.je})`); continue; }
      if (state?.je_live) {
        await withCompanyScope(actor, oc, (client) =>
          undoBankLineOnClient(client as never, { operatingCompanyId: oc, bankTransactionId: l.bt, actorUserId: actor, reason: FINDING })
        );
      } else {
        log.push(`  RESUME ${label}: undone earlier, re-recording from the plan`);
      }
      const payload: Record<string, unknown> = { category_kind: l.account_name, gl_account_id: l.account_id, item_id: itemId };
      if (l.vendor_id) payload.vendor_id = l.vendor_id;
      if (l.customer_id) payload.customer_id = l.customer_id;
      if (l.memo) payload.memo = l.memo;
      const res = await app.inject({ method: "POST", url: `/api/v1/banking/transactions/${l.bt}/categorize?operating_company_id=${oc}`, headers, payload });
      if (res.statusCode >= 300) throw new Error(`categorize ${label}: ${res.statusCode} ${res.body}`);
      const [after] = await read<{ expense_id: string | null; num: string | null; je: string | null }>(
        `SELECT e.id::text AS expense_id, e.expense_number AS num, e.journal_entry_id::text AS je
           FROM banking.bank_transactions bt LEFT JOIN accounting.expenses e ON e.id = bt.matched_expense_id WHERE bt.id = $1::uuid`,
        [l.bt]
      );
      if (!after?.expense_id) throw new Error(`categorize ${label}: no expense linked after re-record`);
      done.push(`${label}: voided JE ${l.je} -> ${after.num} (${after.expense_id}), entry ${after.je}`);
    }
  } finally {
    await app.close();
  }

  const after = await tb();
  log.push("", "account | net before (cents) | net after (cents) | delta");
  let delta = 0;
  for (const b of before) {
    const a = after.find((x) => x.account_number === b.account_number);
    const d = Number(a?.net_cents ?? 0) - Number(b.net_cents);
    delta += d;
    log.push(`${b.account_number} | ${b.net_cents} | ${a?.net_cents} | ${d}`);
  }
  log.push(`net trial-balance delta across these accounts: ${delta} cents`);
  if (done.length) log.push("", `converted ${done.length}:`, ...done);
  await pool.end();
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
