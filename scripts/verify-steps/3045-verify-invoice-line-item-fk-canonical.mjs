#!/usr/bin/env node
/**
 * ACCT-F329 — an invoice line could not reference the item catalog on a TMS-native entity.
 *
 * accounting.invoice_lines linked to catalogs.items through ONE column: `qbo_item_id`, a free-text
 * QuickBooks id. USMCA has NO QuickBooks realm (owner ruling 2026-08-11; integrations.qbo_connections
 * USMCA = 0 of 4), so on the go-live entity a catalog item picked on an invoice line had nowhere to be
 * stored and the line could never resolve back to its item — 0 of 33.
 *
 * The fix added a real `item_id uuid REFERENCES catalogs.items(id)` alongside qbo_item_id (additive,
 * Rule 07). This guard keeps that fix honest in three ways, because a column is only worth what its
 * writers persist:
 *
 *   1. The migration must ADD the column AS A REAL FK — a bare uuid would re-create the same
 *      unenforced-link problem in a new spelling.
 *   2. qbo_item_id must SURVIVE — it is the correct linkage for entities that DO have a QBO realm.
 *      "Fixing" this by replacing qbo_item_id would break the TRANSP/TRK mirror.
 *   3. The route must PERSIST item_id on BOTH create and patch. A create-only wire is the same dead
 *      end in slower motion: an item set once and never correctable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3045-verify-invoice-line-item-fk-canonical";
const MIGRATION = path.join(ROOT, "db/migrations/202612481100_invoice_lines_item_id_canonical_fk.sql");
const ROUTE = path.join(ROOT, "apps/backend/src/accounting/invoice-lines.routes.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Comments are prose, not code — strip before asserting (learned on guards 3029/3033). */
function stripSql(sql) {
  return sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}
function stripTs(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

function audit() {
  const problems = [];

  if (!fs.existsSync(MIGRATION)) {
    problems.push(`missing migration ${path.relative(ROOT, MIGRATION)}`);
  } else {
    const sql = stripSql(fs.readFileSync(MIGRATION, "utf8"));
    if (!/ALTER TABLE\s+accounting\.invoice_lines/i.test(sql)) {
      problems.push("migration must ALTER TABLE accounting.invoice_lines");
    }
    // A real FK, not a loose uuid.
    if (!/ADD COLUMN IF NOT EXISTS\s+item_id\s+uuid\s+REFERENCES\s+catalogs\.items\s*\(\s*id\s*\)/i.test(sql)) {
      problems.push(
        "migration must add item_id as `uuid REFERENCES catalogs.items(id)` — a bare uuid recreates the same unenforced link ACCT-F329 exists to fix"
      );
    }
    if (/DROP COLUMN[\s\S]{0,40}qbo_item_id/i.test(sql)) {
      problems.push("migration must NOT drop qbo_item_id — it is the correct linkage for entities WITH a QuickBooks realm (Rule 07 additive-only)");
    }
  }

  if (!fs.existsSync(ROUTE)) {
    problems.push(`missing ${path.relative(ROOT, ROUTE)}`);
    return problems;
  }
  const src = stripTs(fs.readFileSync(ROUTE, "utf8"));

  // qbo_item_id must still be accepted — both linkages coexist by design.
  if (!/qbo_item_id/.test(src)) {
    problems.push("route no longer handles qbo_item_id — the QBO-realm linkage must survive alongside item_id");
  }

  // CREATE path: column named in the INSERT and a value bound for it.
  const insertBlock = src.match(/INSERT INTO accounting\.invoice_lines[\s\S]*?RETURNING \*/);
  if (!insertBlock) {
    problems.push("could not locate the INSERT INTO accounting.invoice_lines block — guard cannot verify the create path and must not pass silently");
  } else if (!/\bitem_id\b/.test(insertBlock[0])) {
    problems.push("the invoice-line INSERT does not persist item_id — the column would be decoration (ACCT-F329)");
  }
  if (!/body\.data\.item_id/.test(src)) {
    problems.push("route never reads body.data.item_id — the API would accept an item and silently discard it");
  }

  // PATCH path: settable AND clearable.
  if (!/"item_id" in body\.data/.test(src)) {
    problems.push("the PATCH path does not persist item_id — a line whose item cannot be corrected is the same dead end in slower motion");
  }

  return problems;
}

function selftest() {
  const originalMig = fs.readFileSync(MIGRATION, "utf8");
  const originalRoute = fs.readFileSync(ROUTE, "utf8");
  const restore = () => {
    fs.writeFileSync(MIGRATION, originalMig);
    fs.writeFileSync(ROUTE, originalRoute);
  };
  let planted = 0;

  const mutations = [
    ["FK downgraded to a bare uuid", () => fs.writeFileSync(MIGRATION, originalMig.replace(/item_id\s+uuid\s+REFERENCES\s+catalogs\.items\s*\(\s*id\s*\)/i, "item_id uuid"))],
    ["qbo_item_id dropped (would break QBO-realm entities)", () => fs.writeFileSync(MIGRATION, originalMig.replace(/COMMIT;/, "ALTER TABLE accounting.invoice_lines DROP COLUMN qbo_item_id;\nCOMMIT;"))],
    ["create path stops persisting item_id", () => fs.writeFileSync(ROUTE, originalRoute.replace(/\n\s*item_id,\n(\s*display_order\n)/, "\n$1"))],
    ["patch path stops persisting item_id", () => fs.writeFileSync(ROUTE, originalRoute.replace(/if \("item_id" in body\.data\) add\("item_id", body\.data\.item_id \?\? null\);/, ""))],
  ];

  for (const [name, mutate] of mutations) {
    restore();
    const beforeMig = fs.readFileSync(MIGRATION, "utf8");
    const beforeRoute = fs.readFileSync(ROUTE, "utf8");
    mutate();
    const changed =
      fs.readFileSync(MIGRATION, "utf8") !== beforeMig || fs.readFileSync(ROUTE, "utf8") !== beforeRoute;
    if (!changed) {
      restore();
      fail(`selftest INERT: mutation "${name}" did not apply — the guard proves nothing`);
    }
    const stillClean = audit().length === 0;
    restore();
    if (stillClean) fail(`selftest: expected FAIL after mutation "${name}"`);
    planted += 1;
  }

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS — invoice_lines.item_id is a real FK to catalogs.items, persisted on create AND patch, with qbo_item_id preserved for QBO-realm entities`);
}
