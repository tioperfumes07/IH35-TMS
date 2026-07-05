#!/usr/bin/env node
/**
 * BLOCKING guard (exit 1 on real finding).
 *
 * The runtime failure class: a migration does `CREATE SCHEMA IF NOT EXISTS <s>` and grants
 * TABLE privileges on <s>.<table> to ih35_app in the SAME file, but never grants
 * `GRANT USAGE ON SCHEMA <s> TO ih35_app`. Without schema USAGE the runtime role cannot
 * resolve any object in the schema and every call 500s ("permission denied for schema <s>").
 * Neon frequently masks this in dev via a stray PUBLIC grant, so it only surfaces in prod.
 *
 * By DEFAULT this watches EVERY schema that appears in a `CREATE SCHEMA IF NOT EXISTS <s>`
 * anywhere under db/migrations (not a hand-maintained watchlist — the earlier 3-item list
 * missed the schema class that actually broke, e.g. `events`).
 *
 * CROSS-FILE USAGE scan (critical to avoid false positives): USAGE is very often granted in a
 * LATER migration than the one that creates the schema — most commonly the 0065 "permanent
 * grants" pattern that loops over a schema-name array and does
 * `format('GRANT USAGE ON SCHEMA %I TO ih35_app', s)`. So a schema is treated as USAGE-granted
 * if ANY migration anywhere grants it USAGE to ih35_app (or PUBLIC), whether via a literal
 * statement OR the dynamic format()-over-array pattern. A schema is only flagged when NO
 * migration anywhere grants it USAGE.
 *
 * Optional NARROWING (not widening): set IH35_SCHEMA_USAGE_WATCHLIST=email,banking,qbo to
 * restrict the check to a subset of the created schemas. Unset = all created schemas.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

const SCHEMA_IDENT = "[a-z_][a-z0-9_]*";

// Optional NARROWING only — when set, restrict to this subset. Unset ⇒ every created schema.
const NARROW_WATCHLIST = (() => {
  const raw = process.env.IH35_SCHEMA_USAGE_WATCHLIST;
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.size > 0 ? set : null;
})();

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** All schema names created via `CREATE SCHEMA IF NOT EXISTS <s>` across every migration. */
function collectCreatedSchemas(fileTexts) {
  const created = new Set();
  const re = new RegExp(`CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+"?(${SCHEMA_IDENT})"?`, "gi");
  for (const { text } of fileTexts) {
    let m;
    while ((m = re.exec(text)) !== null) created.add(m[1].toLowerCase());
  }
  return created;
}

/**
 * Every schema that is USAGE-granted to ih35_app (or PUBLIC) ANYWHERE, covering:
 *   (a) literal:  GRANT USAGE ON SCHEMA <s> TO ih35_app        (incl. inside EXECUTE '…')
 *   (b) dynamic:  format('GRANT USAGE ON SCHEMA %I TO ih35_app', s) looping a '<s>' array (0065)
 */
function collectUsageGranted(fileTexts, createdSchemas) {
  const granted = new Set();

  // (a) literal grants — allow ih35_app or PUBLIC (PUBLIC includes ih35_app).
  const literalRe = new RegExp(
    `GRANT\\s+USAGE\\s+ON\\s+SCHEMA\\s+"?(${SCHEMA_IDENT})"?\\b[^;]*?\\bTO\\s+(?:ih35_app|PUBLIC)\\b`,
    "gi",
  );
  // (b) dynamic loop grant to ih35_app via format(... %I ...).
  const dynamicUsageRe = /GRANT\s+USAGE\s+ON\s+SCHEMA\s+%I\b[^']*?\bTO\s+ih35_app\b/i;
  const quotedLiteralRe = new RegExp(`'(${SCHEMA_IDENT})'`, "gi");

  for (const { text } of fileTexts) {
    let m;
    literalRe.lastIndex = 0;
    while ((m = literalRe.exec(text)) !== null) granted.add(m[1].toLowerCase());

    // Dynamic 0065-style: file grants USAGE to ih35_app over an array of schema-name literals.
    // Credit every quoted literal in the file that is a real created schema (bounded → safe).
    if (dynamicUsageRe.test(text)) {
      quotedLiteralRe.lastIndex = 0;
      while ((m = quotedLiteralRe.exec(text)) !== null) {
        const name = m[1].toLowerCase();
        if (createdSchemas.has(name)) granted.add(name);
      }
    }
  }
  return granted;
}

function main() {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  const fileTexts = files.map((name) => ({
    name,
    text: stripComments(fs.readFileSync(path.join(MIG_DIR, name), "utf8")),
  }));

  const createdSchemas = collectCreatedSchemas(fileTexts);
  const usageGranted = collectUsageGranted(fileTexts, createdSchemas);

  // Watch set: default = every created schema; env = optional NARROWING to a subset.
  const watch = NARROW_WATCHLIST
    ? new Set([...createdSchemas].filter((s) => NARROW_WATCHLIST.has(s)))
    : createdSchemas;

  /** @type {Array<{ file: string; schema: string }>} */
  const findings = [];
  for (const { name, text } of fileTexts) {
    for (const schema of watch) {
      const created = new RegExp(
        `CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+"?${schema}"?\\s*;`,
        "i",
      ).test(text);
      const tableGrant = new RegExp(
        `GRANT\\s+(?:SELECT|INSERT|UPDATE|DELETE)(?:\\s*,\\s*(?:SELECT|INSERT|UPDATE|DELETE))*\\s+ON\\s+"?${schema}"?\\.`,
        "i",
      ).test(text);
      // Only flag when the schema is NEVER USAGE-granted to ih35_app in ANY migration.
      if (created && tableGrant && !usageGranted.has(schema)) {
        findings.push({ file: name, schema });
      }
    }
  }

  const scope = NARROW_WATCHLIST
    ? `narrowed to ${[...watch].sort().join(", ") || "(none matched)"}`
    : `all ${watch.size} created schemas`;

  if (findings.length === 0) {
    console.log(`verify:schema-usage-grants — OK (${scope})`);
    process.exit(0);
    return;
  }

  console.error(
    "\nverify:schema-usage-grants — FAIL: schema CREATE + table GRANT to ih35_app but NO\n" +
      "GRANT USAGE ON SCHEMA <s> TO ih35_app in ANY migration (runtime will 500 with\n" +
      '"permission denied for schema <s>"). Add the USAGE grant (see the 0065 pattern):\n',
  );
  // De-dupe schema→files for a compact report.
  const bySchema = new Map();
  for (const f of findings) {
    if (!bySchema.has(f.schema)) bySchema.set(f.schema, []);
    bySchema.get(f.schema).push(f.file);
  }
  for (const [schema, fileList] of [...bySchema].sort()) {
    console.error(`  ${schema}`);
    for (const file of fileList) console.error(`    ← db/migrations/${file}`);
  }
  console.error(`\nTotal: ${bySchema.size} schema(s) missing USAGE grant.\n`);
  process.exit(1);
}

main();
