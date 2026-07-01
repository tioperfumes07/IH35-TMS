#!/usr/bin/env node
// AF-2b — item → income/expense account mapping loader (READ-ONLY).
// [HOLD-FOR-JORGE — TIER 1] Produces a CSV for Jorge/CPA review. WRITES NOTHING.
//
// WHAT IT DOES
//   For TRANSP, reads each QBO Item's IncomeAccountRef / ExpenseAccountRef / COGSAccountRef
//   and resolves them to catalogs.accounts.id for the SAME entity
//   (operating_company_id = TRANSP AND qbo_account_id = <ref>). Emits
//   docs/recon/af2b-item-account-map-<date>.csv. Fails loud (non-zero exit + printed list)
//   on any QBO account ref that is NOT in TRANSP's chart of accounts — no fallback, no guess.
//
// SOURCE OF THE QBO ITEM PAYLOAD (honest / DB-only, Neon-branch runnable)
//   The account refs are NOT derivable from item names. They live on each QBO Item.
//   apps/backend/src/qbo-sync/items-puller.ts mirrors every QBO Item into
//   mdata.qbo_items.payload_json (payload_json = JSON.stringify(rawQboItem)), which
//   includes IncomeAccountRef / ExpenseAccountRef / COGSAccountRef. This loader reads that
//   mirror instead of re-implementing QBO OAuth in a standalone script, so GUARD can run it
//   read-only on a Neon branch with no live QBO credentials. If the mirror is stale, re-run
//   the items-puller sync FIRST, then run this loader.
//
// USAGE
//   DATABASE_URL='postgres://.../neondb?sslmode=require' node scripts/af2b-item-account-map.mjs
//   node scripts/af2b-item-account-map.mjs --help
//   node scripts/af2b-item-account-map.mjs --dry-run   # prints plan, no DB connection
//
// SAFETY
//   * Read-only: opens a single BEGIN ... SET TRANSACTION READ ONLY ... ROLLBACK.
//   * DO NOT run against prod yourself (§1.5). GUARD runs it on a Neon branch.
//   * Never fabricate rows. Unresolved refs are reported, never mapped.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TRANSP_OPCO_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96"; // known TRANSP operating_company_id (cross-checked below)

const HEADER = [
  "qbo_item_id",
  "item_name",
  "item_type",
  "qbo_income_account_id",
  "qbo_expense_account_id",
  "resolved_income_account_uuid",
  "resolved_expense_account_uuid",
  "unmatched_reason",
];

function printHelp() {
  console.log(`AF-2b item -> income/expense account mapping loader (READ-ONLY)

Reads TRANSP QBO Items from mdata.qbo_items.payload_json, resolves each item's
IncomeAccountRef / ExpenseAccountRef to catalogs.accounts.id for the same entity, and
writes docs/recon/af2b-item-account-map-<date>.csv. Fails loud on any unmatched account ref.

Options:
  --help       Show this help and exit.
  --dry-run    Print the plan and CSV columns; do NOT connect to the DB.
  --out <path> Override the output CSV path.

Env:
  DATABASE_URL   Required (except --help / --dry-run). Read-only connection string
                 (a Neon branch — NOT prod). GUARD runs this; the coder is Neon-gated.

CSV columns:
  ${HEADER.join(", ")}
`);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsvRow(cols) {
  return cols.map(csvEscape).join(",");
}

function refValue(ref) {
  // QBO ReferenceType is { value: "123", name: "..." }
  if (!ref || typeof ref !== "object") return null;
  const v = ref.value;
  return v == null || v === "" ? null : String(v);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const dryRun = argv.includes("--dry-run");
  const outIdx = argv.indexOf("--out");
  const dateStr = new Date().toISOString().slice(0, 10);
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), "..");
  const outPath =
    outIdx >= 0 && argv[outIdx + 1]
      ? path.resolve(argv[outIdx + 1])
      : path.join(repoRoot, "docs", "recon", `af2b-item-account-map-${dateStr}.csv`);

  if (dryRun) {
    console.log("[dry-run] AF-2b loader plan:");
    console.log("  1. Resolve TRANSP operating_company_id from org.companies WHERE code='TRANSP'.");
    console.log("  2. Read mdata.qbo_items (payload_json) for TRANSP.");
    console.log("  3. Extract IncomeAccountRef / ExpenseAccountRef / COGSAccountRef .value per item.");
    console.log("  4. Resolve each ref -> catalogs.accounts.id (same entity + qbo_account_id).");
    console.log("  5. FAIL LOUD on any ref not in TRANSP COA; emit CSV either way for review.");
    console.log(`  Output CSV: ${outPath}`);
    console.log(`  Columns:    ${HEADER.join(", ")}`);
    console.log("[dry-run] no DB connection opened.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is required (read-only Neon branch, NOT prod). See --help.");
    process.exit(1);
  }

  // Guard against accidentally pointing at the prod endpoint from a stray env.
  if (process.env.AF2B_ALLOW_ANY_HOST !== "1" && /ep-broad-block-akykk7bw|br-fancy-credit/.test(url)) {
    console.error("REFUSING: DATABASE_URL looks like a prod endpoint. Run on a Neon branch (set AF2B_ALLOW_ANY_HOST=1 only if you are certain).");
    process.exit(1);
  }

  const pg = (await import("pg")).default;
  const { Pool } = pg;
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  const rows = [];
  const unmatchedRefs = new Set();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");

    // Resolve TRANSP by code (authoritative), cross-check against the known constant.
    const opco = await client.query("SELECT id::text AS id FROM org.companies WHERE code = 'TRANSP' LIMIT 1");
    if (opco.rowCount === 0) {
      throw new Error("org.companies has no row with code='TRANSP' — cannot scope the mapping.");
    }
    const transpId = opco.rows[0].id;
    if (transpId !== TRANSP_OPCO_ID) {
      console.warn(`WARN: resolved TRANSP id ${transpId} != expected ${TRANSP_OPCO_ID} (using resolved).`);
    }

    // RLS on mdata.qbo_items / catalogs.accounts is entity-scoped; set the GUC so a
    // non-superuser (ih35_app) role can SELECT. Owner/lucia-bypass ignores it.
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [transpId]);

    // Build the TRANSP COA lookup: qbo_account_id -> { id, account_type }.
    const coa = await client.query(
      `SELECT id::text AS id, qbo_account_id, account_type
         FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid
          AND qbo_account_id IS NOT NULL`,
      [transpId]
    );
    const coaByQbo = new Map();
    for (const a of coa.rows) coaByQbo.set(String(a.qbo_account_id), { id: a.id, type: a.account_type });

    // Read TRANSP QBO Items (the mirror carries the full QBO Item payload).
    const items = await client.query(
      `SELECT qbo_id, name, item_type, payload_json
         FROM mdata.qbo_items
        WHERE operating_company_id = $1::uuid
        ORDER BY name ASC`,
      [transpId]
    );

    for (const it of items.rows) {
      const payload = it.payload_json || {};
      const itemType = payload.Type ?? it.item_type ?? "";
      const incomeRef = refValue(payload.IncomeAccountRef);
      const expenseRef = refValue(payload.ExpenseAccountRef) ?? refValue(payload.COGSAccountRef);

      let resolvedIncome = "";
      let resolvedExpense = "";
      const reasons = [];

      if (incomeRef) {
        const hit = coaByQbo.get(incomeRef);
        if (hit) resolvedIncome = hit.id;
        else {
          unmatchedRefs.add(incomeRef);
          reasons.push(`income ref ${incomeRef} not in TRANSP COA`);
        }
      }
      if (expenseRef) {
        const hit = coaByQbo.get(expenseRef);
        if (hit) resolvedExpense = hit.id;
        else {
          unmatchedRefs.add(expenseRef);
          reasons.push(`expense ref ${expenseRef} not in TRANSP COA`);
        }
      }
      if (!incomeRef && !expenseRef) reasons.push("no QBO account ref on item (leave NULL)");

      rows.push([
        it.qbo_id,
        it.name,
        itemType,
        incomeRef ?? "",
        expenseRef ?? "",
        resolvedIncome,
        resolvedExpense,
        reasons.join("; "),
      ]);
    }

    await client.query("ROLLBACK");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    client.release();
    await pool.end();
    console.error("AF-2b loader failed:", err.message);
    process.exit(1);
  }
  client.release();
  await pool.end();

  // Write CSV (partial rows included so the reviewer sees unmatched items too).
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const csv = [toCsvRow(HEADER), ...rows.map(toCsvRow)].join("\n") + "\n";
  fs.writeFileSync(outPath, csv);
  console.log(`Wrote ${rows.length} item rows -> ${outPath}`);

  if (unmatchedRefs.size > 0) {
    console.error(
      `FAIL LOUD: ${unmatchedRefs.size} QBO account ref(s) not found in TRANSP COA (no fallback applied):`
    );
    for (const r of [...unmatchedRefs].sort()) console.error(`  - qbo_account_id ${r}`);
    console.error("Resolve these in catalogs.accounts (AF-1) before approving the mapping.");
    process.exit(2);
  }
  console.log("All referenced QBO accounts resolved to the TRANSP COA. CSV ready for Jorge/CPA review.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
