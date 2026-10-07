#!/usr/bin/env tsx
/**
 * ROUND 441.5 — convert the five money-out bank lines categorized to cost accounts as BARE journal entries into EXPENSE
 * documents. The owner ruled (2026-10-07, "ours should work exactly as quickbooks"): same date, same amount, same
 * expense account — only the shape changes; the trial balance moves by exactly $0.00.
 *
 * Through the app only, never SQL writes:
 *   1. Undo the line — banking/bank-line-state-machine undoBankLineOnClient (the engine behind POST
 *      /transactions/:id/undo-categorization). Its reversal carries this finding as the reason.
 *   2. Re-record the line — POST /api/v1/banking/transactions/:id/categorize with the same account, the vendor and the
 *      item. Since ROUND 441.5 Phase 1 that creates and posts the Expense document, linked to the line both ways.
 * Items that do not exist are created first through POST /api/v1/catalogs/items (owner standing order 2026-08-07: create
 * missing USMCA items). A line whose item would be a CHOICE among several, or whose vendor does not resolve exactly, is
 * STOPPED and named, never guessed.
 *
 * Dry run by default. --execute needs --expect-host = DATABASE_URL's host.
 *   DATABASE_URL=<target> npx tsx scripts/ops/round-441-5-convert-categorized-costs-to-expenses.ts --actor-user-id <owner uuid> [--execute --expect-host <host>]
 */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "../../apps/backend/src/banking/categorization.routes.js";
import { registerItemRoutes } from "../../apps/backend/src/catalogs/items.routes.js";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { undoBankLineOnClient } from "../../apps/backend/src/banking/bank-line-state-machine.service.js";

const FINDING = "ROUND 441.5 LST-F433: re-recorded as an Expense document (owner: ours works exactly as QuickBooks)";

type Plan = {
  journalEntryId: string;
  label: string;
  accountNumber: string;
  vendorName: string;
  /** an existing item by exact name, or a new item to create for the account */
  item: { existing: string } | { create: { name: string; description: string } } | { stop: string };
};

// The five, measured 2026-10-07 (verify-costs-are-expenses-not-handwritten-jes).
const PLAN: Plan[] = [
  { journalEntryId: "4d293634-800c-4967-9c6e-d296a64621c0", label: "External transfer fee 01/15 $5.00", accountNumber: "6300", vendorName: "Bank Of America", item: { existing: "BC-Bank Ach & Wire Fees" } },
  { journalEntryId: "3558febf-bd50-46ac-a865-c89b8f787f6a", label: "Wire Transfer Fee 06/01 $30.00", accountNumber: "6300", vendorName: "Bank Of America", item: { existing: "BC-Bank Ach & Wire Fees" } },
  {
    journalEntryId: "0133f7dc-c3b4-419e-8276-099086694ed9",
    label: "Cash Deposit Processing 03/02 $12.00",
    accountNumber: "6300",
    vendorName: "Bank Of America",
    // None of 6300's six items names a cash-deposit processing fee, so picking one would be a guess. The fitting item is
    // missing, not ambiguous: created under the owner's standing order (2026-08-07, create missing USMCA items).
    item: { create: { name: "BC-Cash Deposit Processing Fee", description: "Bank fee for processing a cash deposit. Created ROUND 441.5 (no 6300 item named it)." } },
  },
  {
    journalEntryId: "a6d06fc6-fa12-443e-be6b-b1df0a0287f2",
    label: "Overdraft item fee 01/20 $10.00",
    accountNumber: "6310",
    vendorName: "Bank Of America",
    item: { create: { name: "BC-Overdraft Fee", description: "Bank overdraft item fee. Created ROUND 441.5 (6310 had no item)." } },
  },
  {
    journalEntryId: "d11b4ffc-5077-4461-9d7e-191a6c5dcbdb",
    label: "ED-HER PLASTICS 08/18 $146.14",
    accountNumber: "6900",
    vendorName: "ED-HER PLASTICS INC",
    item: { create: { name: "Miscellaneous Expense", description: "Miscellaneous purchase. Created ROUND 441.5 (6900 had no item)." } },
  },
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actor = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !actor) throw new Error("DATABASE_URL and --actor-user-id are required");
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

  const tb = async () =>
    read<{ account_number: string; net_cents: string }>(
      `SELECT a.account_number, COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS net_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings p ON p.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
        WHERE a.operating_company_id = $1::uuid AND a.account_number IN ('1000','6300','6310','6900')
          AND (p.id IS NULL OR je.id IS NOT NULL)
        GROUP BY 1 ORDER BY 1`,
      [oc]
    );
  const before = await tb();

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerItemRoutes(a);
    await registerBankTxCategorizationRoutes(a);
  });
  const headers = { "x-test-auth": Buffer.from(JSON.stringify({ id: actor, role: "Owner", email: null }), "utf8").toString("base64url") };
  const log: string[] = [`ROUND 441.5 convert — ${execute ? "EXECUTE" : "DRY RUN (no writes)"} — USMCA`];
  const done: string[] = [];

  try {
    for (const p of PLAN) {
      const [line] = await read<{ bt: string; account_id: string; account_number: string; account_name: string; is_credit: boolean; amount_cents: string; je_status: string; reversed: boolean }>(
        `SELECT bt.id::text AS bt, bt.categorization_gl_account_id::text AS account_id, a.account_number, a.account_name, bt.is_credit,
                abs(bt.amount_cents)::text AS amount_cents, je.status::text AS je_status, (je.reversed_by_je_id IS NOT NULL) AS reversed
           FROM accounting.journal_entries je
           JOIN accounting.journal_entry_postings jp ON jp.journal_entry_uuid = je.id AND jp.source_transaction_type = 'bank_categorization'
           JOIN banking.bank_transactions bt ON bt.id::text = jp.source_transaction_id
           JOIN catalogs.accounts a ON a.id = bt.categorization_gl_account_id
          WHERE je.id = $1::uuid AND je.operating_company_id = $2::uuid
          LIMIT 1`,
        [p.journalEntryId, oc]
      );
      if (!line) { log.push(`  SKIP ${p.label}: entry ${p.journalEntryId} not found as a categorization`); continue; }
      if (line.reversed) { log.push(`  SKIP ${p.label}: already reversed (converted earlier)`); continue; }
      if (line.account_number !== p.accountNumber || line.is_credit) { log.push(`  STOP ${p.label}: line is not money-out on ${p.accountNumber}`); continue; }
      if ("stop" in p.item) { log.push(`  STOP ${p.label}: ${p.item.stop}`); continue; }

      const vendors = await read<{ id: string }>(
        `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
            AND COALESCE(is_sample_data,false) = false AND lower(vendor_name) = lower($2)`,
        [oc, p.vendorName]
      );
      if (vendors.length !== 1) { log.push(`  STOP ${p.label}: vendor "${p.vendorName}" resolves to ${vendors.length} rows`); continue; }
      const vendorId = vendors[0]!.id;

      let itemId: string | null = null;
      if ("existing" in p.item) {
        const items = await read<{ id: string }>(
          `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND item_name = $2 AND default_expense_account_id = $3::uuid`,
          [oc, p.item.existing, line.account_id]
        );
        if (items.length !== 1) { log.push(`  STOP ${p.label}: item "${p.item.existing}" on ${p.accountNumber} resolves to ${items.length} rows`); continue; }
        itemId = items[0]!.id;
      } else {
        const existing = await read<{ id: string }>(
          `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND item_name = $2`,
          [oc, p.item.create.name]
        );
        if (existing[0]) itemId = existing[0].id;
        else if (execute) {
          const res = await app.inject({
            method: "POST",
            url: "/api/v1/catalogs/items",
            headers,
            payload: { operating_company_id: oc, item_name: p.item.create.name, item_type: "Charge", description: p.item.create.description, default_expense_account_id: line.account_id },
          });
          if (res.statusCode !== 201) throw new Error(`item create ${p.item.create.name}: ${res.statusCode} ${res.body}`);
          itemId = (JSON.parse(res.body) as { id: string }).id;
          log.push(`  CREATED item "${p.item.create.name}" (Charge, expense → ${p.accountNumber})`);
        } else log.push(`  would CREATE item "${p.item.create.name}" (Charge, expense → ${p.accountNumber})`);
      }

      if (!execute) { log.push(`  would CONVERT ${p.label}: undo ${p.journalEntryId}, re-categorize ${p.accountNumber} vendor "${p.vendorName}"`); continue; }

      await withCompanyScope(actor, oc, (client) =>
        undoBankLineOnClient(client as never, { operatingCompanyId: oc, bankTransactionId: line.bt, actorUserId: actor, reason: FINDING })
      );
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/banking/transactions/${line.bt}/categorize?operating_company_id=${oc}`,
        headers,
        // category_kind is what the categorize screen sends: the chosen account's name.
        payload: { category_kind: line.account_name, gl_account_id: line.account_id, vendor_id: vendorId, item_id: itemId },
      });
      if (res.statusCode >= 300) throw new Error(`categorize ${p.label}: ${res.statusCode} ${res.body}`);
      const [after] = await read<{ expense_id: string | null; expense_number: string | null; je: string | null }>(
        `SELECT e.id::text AS expense_id, e.expense_number, e.journal_entry_id::text AS je
           FROM banking.bank_transactions bt LEFT JOIN accounting.expenses e ON e.id = bt.matched_expense_id
          WHERE bt.id = $1::uuid`,
        [line.bt]
      );
      if (!after?.expense_id) throw new Error(`categorize ${p.label}: no expense document linked after re-record`);
      done.push(`${p.label}: voided JE ${p.journalEntryId} -> expense ${after.expense_number} (${after.expense_id}), entry ${after.je}`);
      log.push(`  CONVERTED ${p.label} -> ${after.expense_number}`);
    }
  } finally {
    await app.close();
  }

  const after = await tb();
  log.push("", "account | net before (cents) | net after (cents) | delta");
  let total = 0;
  for (const b of before) {
    const a = after.find((x) => x.account_number === b.account_number);
    const d = Number(a?.net_cents ?? 0) - Number(b.net_cents);
    total += d;
    log.push(`${b.account_number} | ${b.net_cents} | ${a?.net_cents} | ${d}`);
  }
  log.push(`net trial-balance delta across these accounts: ${total} cents`);
  if (done.length) log.push("", ...done);
  await pool.end();
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
