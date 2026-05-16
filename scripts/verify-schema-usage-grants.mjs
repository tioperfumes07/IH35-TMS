#!/usr/bin/env node
/**
 * WARNING-only: watchlisted schemas (email, banking, qbo) must grant ih35_app USAGE in the same
 * migration file where they both CREATE SCHEMA … and GRANT … ON schema.table TO ih35_app.
 * Catches the ih35_app runtime failure class seen when USAGE was omitted (Neon often masked via PUBLIC).
 *
 * Extend via IH35_SCHEMA_USAGE_WATCHLIST=email,banking,qbo,custom
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

const SCHEMA_USAGE_WATCHLIST = new Set(
  (process.env.IH35_SCHEMA_USAGE_WATCHLIST ?? "email,banking,qbo")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function main() {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  /** @type {Array<{ file: string; schema: string }>} */
  const findings = [];

  for (const name of files) {
    const text = stripComments(fs.readFileSync(path.join(MIG_DIR, name), "utf8"));
    for (const schema of SCHEMA_USAGE_WATCHLIST) {
      const creates =
        new RegExp(`CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${schema}\\s*;`, "i").test(text);
      const tableGrant =
        new RegExp(
          `GRANT\\s+(?:SELECT|INSERT|UPDATE|DELETE)(?:\\s*,\\s*(?:SELECT|INSERT|UPDATE|DELETE))*\\s+ON\\s+${schema}\\.`,
          "i",
        ).test(text);
      const usage = new RegExp(
        `GRANT\\s+USAGE\\s+ON\\s+SCHEMA\\s+${schema}\\b[^;]*TO\\s+ih35_app`,
        "i",
      ).test(text);
      if (creates && tableGrant && !usage) {
        findings.push({ file: name, schema });
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      `verify:schema-usage-grants — OK (watchlist ${[...SCHEMA_USAGE_WATCHLIST].sort().join(", ")})`,
    );
    process.exit(0);
    return;
  }

  console.warn(
    "\nverify:schema-usage-grants — WARNING (watchlisted schema: CREATE + table GRANT without SCHEMA USAGE TO ih35_app in same file):\n",
  );
  for (const f of findings) {
    console.warn(`  ${f.schema}`);
    console.warn(`    ← db/migrations/${f.file}`);
  }
  console.warn(`\nTotal: ${findings.length} (informational only; exit 0)\n`);
  process.exit(0);
}

main();
