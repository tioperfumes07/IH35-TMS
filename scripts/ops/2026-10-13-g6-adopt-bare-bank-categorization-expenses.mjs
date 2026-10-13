#!/usr/bin/env node
/**
 * G6 / DEGH-02 — adopt expense documents for the 4 legacy bare bank_categorization JEs on USMCA
 * expense accounts (NP Wireless ×2 @ 6100, Intuit checks @ 6210-00-001, Intuit QBooks @ 6500-00-001).
 *
 * ONE JE each — the document adopts the live entry (no re-post, no new GL math). Set-based item
 * ensure for accounts with zero mapped items; 6100 picks the preferred "UE-Telephone & Internet"
 * item (4 items mapped — never guess).
 *
 * Usage:
 *   DATABASE_URL=… node scripts/ops/2026-10-13-g6-adopt-bare-bank-categorization-expenses.mjs
 *   DATABASE_URL=… node scripts/ops/2026-10-13-g6-adopt-bare-bank-categorization-expenses.mjs --dry-run
 *
 * Proof: rows written · batches · seconds · rows/second · single transaction per batch (Rule 53).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRY = process.argv.includes("--dry-run");

/** Preferred item name substring when an account has several mapped items (6100). */
const PREFERRED_ITEM_BY_ACCOUNT = {
  "6100": "Telephone",
};
/** Item names to create when an account has zero mapped items. */
const ENSURE_ITEM_BY_ACCOUNT = {
  "6210-00-001": "Office Supplies — Checks",
  "6500-00-001": "QuickBooks Online",
};
/** qbo_categories.display_name for new items (item_category_required trigger). */
const CATEGORY_BY_ACCOUNT = {
  "6210-00-001": "Other Expenses",
  "6500-00-001": "Software Expenses",
};

const BARE_LINE_IDS = [
  "4eff83b7-979a-4d69-beba-09e785f8994a", // NP Wireless 2026-04-30 @ 6100
  "47ca815d-3b6b-44a8-9a5c-6e52a1654e82", // NP Wireless 2026-06-01 @ 6100
  "b8734660-e730-429e-b5b5-ee07cc1a403f", // Intuit Checks 2026-06-03 @ 6210-00-001
  "17a308c2-7abc-49e3-9232-a4e84c4b7f9c", // Intuit QBooks 2026-09-28 @ 6500-00-001
];

async function loadAdopt() {
  const mod = await import(
    pathToFileURL(path.join(ROOT, "apps/backend/src/accounting/bank-line-expense.service.ts")).href
  ).catch(async () => {
    // Compiled / vitest path — prefer the .js sibling when ts is not directly importable.
    return import(
      pathToFileURL(path.join(ROOT, "apps/backend/dist/accounting/bank-line-expense.service.js")).href
    ).catch(() => null);
  });
  if (mod?.adoptBankCategorizationExpenseDocument) return mod;
  // Run via tsx-style dynamic eval of the source through the backend package entry is heavy;
  // instead inline a minimal SQL adopt for ops when the TS module isn't loadable, by spawning
  // node --import tsx. Prefer tsx when available.
  const { spawnSync } = await import("node:child_process");
  const probe = spawnSync("npx", ["tsx", "--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error("Need tsx (or compiled dist) to import adoptBankCategorizationExpenseDocument");
  }
  // Write a tiny runner that imports via tsx and returns JSON — caller uses direct SQL path below.
  return null;
}

async function ensureItem(client, { accountId, accountNumber, accountName, actorId }) {
  const existing = await client.query(
    `SELECT id::text, item_name FROM catalogs.items
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND default_expense_account_id = $2::uuid
      ORDER BY item_name`,
    [USMCA, accountId]
  );
  if (existing.rows.length === 1) return existing.rows[0].id;
  if (existing.rows.length > 1) {
    const prefer = PREFERRED_ITEM_BY_ACCOUNT[accountNumber];
    const hit = prefer
      ? existing.rows.find((r) => String(r.item_name).toLowerCase().includes(prefer.toLowerCase()))
      : null;
    if (!hit) {
      throw new Error(
        `Account ${accountNumber} has ${existing.rows.length} items (${existing.rows.map((r) => r.item_name).join(", ")}) and no preferred match`
      );
    }
    return hit.id;
  }
  const name = ENSURE_ITEM_BY_ACCOUNT[accountNumber] ?? `${accountNumber} ${accountName}`.slice(0, 80);
  const catName = CATEGORY_BY_ACCOUNT[accountNumber];
  if (!catName) {
    throw new Error(`No CATEGORY_BY_ACCOUNT for ${accountNumber} — cannot create item without category`);
  }
  const cat = await client.query(
    `SELECT id::text FROM catalogs.qbo_categories
      WHERE operating_company_id = $1::uuid AND is_active AND display_name = $2 LIMIT 1`,
    [USMCA, catName]
  );
  if (!cat.rows[0]) throw new Error(`qbo_categories missing "${catName}" for USMCA`);
  if (DRY) {
    console.log(`  [dry-run] would create item "${name}" on ${accountNumber} cat=${catName}`);
    return null;
  }
  const ins = await client.query(
    `INSERT INTO catalogs.items (
        operating_company_id, item_name, item_type, default_expense_account_id, category_id,
        created_by_user_id, updated_by_user_id
      ) VALUES ($1::uuid, $2, 'Service', $3::uuid, $4::uuid, $5::uuid, $5::uuid)
      RETURNING id::text`,
    [USMCA, name, accountId, cat.rows[0].id, actorId]
  );
  console.log(`  created item "${name}" → ${ins.rows[0].id} (cat=${catName})`);
  return ins.rows[0].id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const t0 = Date.now();
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Import adopt via tsx child is awkward; call the service through a dynamic import with tsx register.
  let adopt;
  try {
    process.env.TSX_TSCONFIG_PATH = path.join(ROOT, "apps/backend/tsconfig.json");
    await import("tsx/esm");
    const mod = await import(
      pathToFileURL(path.join(ROOT, "apps/backend/src/accounting/bank-line-expense.service.ts")).href
    );
    adopt = mod.adoptBankCategorizationExpenseDocument;
  } catch (e) {
    console.error("Failed to load adoptBankCategorizationExpenseDocument via tsx:", e.message);
    await client.end();
    process.exit(1);
  }
  void loadAdopt;

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1,true)`, [USMCA]);

    const actorRes = await client.query(
      `SELECT created_by_user_id::text AS id FROM accounting.journal_entries je
         JOIN banking.bank_transactions bt ON bt.matched_journal_entry_id = je.id
        WHERE bt.id = $1::uuid LIMIT 1`,
      [BARE_LINE_IDS[0]]
    );
    const actorId = actorRes.rows[0]?.id;
    if (!actorId) throw new Error("No actor on legacy JE");

    const lines = await client.query(
      `SELECT bt.id::text, bt.matched_journal_entry_id::text AS je, bt.matched_expense_id::text AS expense,
              a.id::text AS account_id, a.account_number, a.account_name
         FROM banking.bank_transactions bt
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = bt.matched_journal_entry_id
           AND p.operating_company_id = bt.operating_company_id AND p.debit_or_credit = 'debit'
           AND p.source_transaction_type = 'bank_categorization'
         JOIN catalogs.accounts a ON a.id = p.account_id
          AND a.account_type IN ('Expense','CostOfGoodsSold','OtherExpense')
        WHERE bt.operating_company_id = $1::uuid AND bt.id = ANY($2::uuid[])
        ORDER BY bt.transaction_date, bt.id`,
      [USMCA, BARE_LINE_IDS]
    );
    if (lines.rows.length !== BARE_LINE_IDS.length) {
      throw new Error(`Expected ${BARE_LINE_IDS.length} bare lines, found ${lines.rows.length}`);
    }

    // Resolve / create items once per account (set-based, not per row).
    const itemByAccount = new Map();
    for (const row of lines.rows) {
      if (itemByAccount.has(row.account_id)) continue;
      const itemId = await ensureItem(client, {
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        actorId,
      });
      itemByAccount.set(row.account_id, itemId);
    }

    let created = 0;
    let existed = 0;
    const results = [];
    for (const row of lines.rows) {
      const itemId = itemByAccount.get(row.account_id);
      if (DRY) {
        console.log(`  [dry-run] would adopt ${row.id} je=${row.je} acct=${row.account_number} item=${itemId}`);
        created += 1;
        continue;
      }
      const out = await adopt(
        client,
        { operatingCompanyId: USMCA, bankTransactionId: row.id, itemId },
        { userId: actorId }
      );
      results.push({ bank_transaction_id: row.id, ...out });
      if (out.outcome === "created") created += 1;
      else existed += 1;
    }

    if (DRY) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    const seconds = (Date.now() - t0) / 1000;
    const written = DRY ? 0 : created;
    console.log(
      JSON.stringify(
        {
          dry_run: DRY,
          rows_written: written,
          already_existed: existed,
          batches: 1,
          seconds,
          rows_per_second: seconds > 0 ? +(written / seconds).toFixed(2) : written,
          single_transaction_per_batch: true,
          results,
        },
        null,
        2
      )
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("G6 adopt FAIL:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
