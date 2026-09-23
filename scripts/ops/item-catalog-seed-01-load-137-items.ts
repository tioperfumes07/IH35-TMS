#!/usr/bin/env tsx
// ITEM CATALOG SEED (owner ruling, 2026-09-23): "THE ITEM CATALOG IS BUILT AND MAPPED. YOU LOAD
// IT, YOU DO NOT MAP IT." scripts/ops/item-catalog-seed-01-137-items.csv (checked-in copy of
// ~/Downloads/item_catalog_seed.csv) -- 137 items, 20 categories, every row resolved to a real
// account in the live USMCA chart (121 from the live QuickBooks company file + 11 from Rounds
// 87/88, plus 5 more resolved after the 4-account migration 202614270000 closed the last gaps).
// ~/Downloads/item_catalog_gaps.csv is empty -- zero unmapped, nothing to report.
//
// This script does NOT decide any mapping. Every account_number in the CSV is resolved by exact
// match against the LIVE catalogs.accounts row created earlier this session (gl-fix-06,
// migration 202614270000) -- if any CSV account_number does not resolve live, the script aborts
// loudly rather than silently skipping or guessing.
//
// No backend HTTP server reachable from this environment -- mirrors the REAL routes' own
// INSERT/UPDATE exactly (apps/backend/src/catalogs/items.routes.ts POST /api/v1/catalogs/items,
// apps/backend/src/catalogs/qbo-categories -- category rows created the same way qbo_categories
// is populated elsewhere): upsert on (operating_company_id, item_code) since item_code is
// deterministic and unique per CSV row; category rows upsert on (operating_company_id, code).
//
// posts_to -> account slot (real accounting semantics, matches the existing precedent already on
// prod -- ACCT-F190's own comment: a pure-expense item legitimately carries NO income account,
// "requiring an account for a type I cannot evidence would block legitimate creates"):
//   revenue -> default_income_account_id   (an invoice line item; credits this account)
//   income  -> default_income_account_id   (driver-deduction items posting to 7200, also income)
//   expense -> default_expense_account_id  (a bill/expense line item; debits this account)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const CSV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "item-catalog-seed-01-137-items.csv");

type Row = {
  item_category: string;
  item_name: string;
  item_type: string;
  item_code: string;
  description: string;
  account_number: string;
  account_name: string;
  posts_to: string;
  mirrors_shortpay_account: string;
  source: string;
};

// Minimal RFC4180 CSV parser -- handles quoted fields with embedded commas/quotes (the real CSV
// has both, e.g. "Operational Licenses, Permits & Taxes" and "Rent-Truck Yard-Colombia, Nuevo
// León"). No external dependency added for a 137-row, one-time ops load.
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const header = rows[0]!;
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj as unknown as Row;
  });
}

function slugifyCategoryCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  console.log(`Parsed ${rows.length} rows from ${CSV_PATH}`);
  if (rows.length !== 137) {
    throw new Error(`ABORT: expected 137 rows, got ${rows.length} -- CSV shape changed, re-verify before loading.`);
  }
  for (const r of rows) {
    if (!["revenue", "expense", "income"].includes(r.posts_to)) {
      throw new Error(`ABORT: unknown posts_to "${r.posts_to}" on item "${r.item_name}" -- never guessed.`);
    }
    if (!r.item_code || !r.item_name || !r.item_type || !r.account_number) {
      throw new Error(`ABORT: row missing a required field: ${JSON.stringify(r)}`);
    }
  }

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  // ---- resolve every account_number live, abort loudly on any miss (never guess) ----
  const acctRows = await client.query<{ account_number: string; id: string }>(
    `SELECT account_number, id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  const acctByNumber = new Map(acctRows.rows.map((a) => [a.account_number, a.id]));
  const distinctAccountNumbers = [...new Set(rows.map((r) => r.account_number))];
  const missingAccounts = distinctAccountNumbers.filter((n) => !acctByNumber.has(n));
  if (missingAccounts.length) {
    throw new Error(`ABORT: account_number(s) not found live for USMCA: ${missingAccounts.join(", ")}`);
  }
  console.log(`All ${distinctAccountNumbers.length} distinct account_numbers resolved live.`);

  // ---- categories ----
  const distinctCategories = [...new Set(rows.map((r) => r.item_category).filter((c) => c.trim() !== ""))];
  console.log(`${distinctCategories.length} distinct non-blank categories, ${rows.filter((r) => r.item_category.trim() === "").length} rows with no category (left uncategorized, matches the CSV -- not guessed).`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made. Re-run with --execute to load.");
    return;
  }

  const categoryIdByName = new Map<string, string>();
  for (const [i, name] of distinctCategories.entries()) {
    const code = slugifyCategoryCode(name);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name, is_active, sort_order)
        VALUES ($1::uuid, $2, $3, true, $4)
        ON CONFLICT (operating_company_id, code)
        DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
        RETURNING id::text
      `,
      [USMCA_COMPANY_ID, code, name, i]
    );
    categoryIdByName.set(name, res.rows[0]!.id);
  }
  console.log(`Upserted ${categoryIdByName.size} category rows.`);

  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const accountId = acctByNumber.get(r.account_number)!;
    const incomeAccountId = r.posts_to === "revenue" || r.posts_to === "income" ? accountId : null;
    const expenseAccountId = r.posts_to === "expense" ? accountId : null;
    const categoryId = r.item_category.trim() === "" ? null : categoryIdByName.get(r.item_category) ?? null;
    const notesParts = [
      `posts_to=${r.posts_to}`,
      `source=${r.source}`,
      r.mirrors_shortpay_account ? `mirrors_shortpay_account=${r.mirrors_shortpay_account}` : null,
    ].filter(Boolean);
    const res = await client.query<{ xmax: string; id: string }>(
      `
        INSERT INTO catalogs.items (
          operating_company_id, item_name, item_code, item_type, description,
          default_income_account_id, default_expense_account_id, category_id,
          taxable, notes, created_by_user_id, updated_by_user_id
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid, false, $9, $10::uuid, $10::uuid
        )
        ON CONFLICT (operating_company_id, item_code) WHERE item_code IS NOT NULL
        DO UPDATE SET
          item_name = EXCLUDED.item_name,
          item_type = EXCLUDED.item_type,
          description = EXCLUDED.description,
          default_income_account_id = EXCLUDED.default_income_account_id,
          default_expense_account_id = EXCLUDED.default_expense_account_id,
          category_id = EXCLUDED.category_id,
          notes = EXCLUDED.notes,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
        RETURNING id::text, xmax::text
      `,
      [
        USMCA_COMPANY_ID,
        r.item_name,
        r.item_code,
        r.item_type,
        r.description || null,
        incomeAccountId,
        expenseAccountId,
        categoryId,
        notesParts.join("; "),
        OWNER_USER_ID,
      ]
    );
    // xmax = '0' means this was a fresh INSERT (no prior row to update); any other value means the
    // ON CONFLICT UPDATE branch ran. Standard Postgres idiom for counting insert-vs-update in one
    // upsert loop without a second round-trip.
    if (res.rows[0]!.xmax === "0") created++;
    else updated++;
  }
  console.log(`Items: ${created} created, ${updated} updated (of ${rows.length} total rows).`);

  const finalCount = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM catalogs.items WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Live active catalogs.items count for USMCA: ${finalCount.rows[0]!.n}`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
