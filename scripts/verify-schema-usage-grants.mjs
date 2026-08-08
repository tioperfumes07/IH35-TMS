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

/**
 * ACCT-F180 — every `INSERT ... ON CONFLICT ... DO UPDATE` target must have UPDATE granted.
 *
 * Recognises all three ways this repo grants UPDATE, because a grants guard that cannot read the
 * project's own grants idiom reports correct code as broken. My first version knew only the literal
 * forms and immediately produced a FALSE POSITIVE on owner.todays_attention_snapshot -- schema
 * `owner` is granted solely via the format()-over-array loop in
 * 202606271510_f1_ih35app_grants_extend.sql. I nearly boarded a defect that does not exist; the
 * dynamic branch below is the fix, mirroring collectUsageGranted() above rather than reinventing it.
 */
const ONCONFLICT_BLANKET_SCHEMAS = new Set([
  "accounting", "audit", "banking", "catalogs", "compliance", "dispatch", "docs",
  "driver_finance", "factoring", "fuel", "identity", "maintenance", "master_data",
  "mdata", "neon_auth", "org", "outbox", "reports", "safety", "views",
]);

function collectOnConflictGrantGaps(fileTexts) {
  const SRC_DIR = path.join(__dirname, "..", "apps", "backend", "src");
  if (!fs.existsSync(SRC_DIR)) return [];

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const q = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "__tests__") walk(q);
      } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) files.push(q);
    }
  })(SRC_DIR);

  const targets = new Map();
  const re = /INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)([\s\S]{0,4000}?)ON\s+CONFLICT\b([\s\S]{0,600}?)DO\s+UPDATE/gi;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      if (/INSERT\s+INTO\s+[a-z_]/i.test(m[3])) continue;
      const key = `${m[1]}.${m[2]}`;
      if (!targets.has(key)) targets.set(key, path.relative(path.join(__dirname, ".."), f));
    }
  }

  // Schemas granted UPDATE dynamically: ARRAY['a','b'] + format('... ON ALL TABLES IN SCHEMA %I ...').
  const dyn = new Set();
  const dynRe = /GRANT\s+[A-Z,\s]*\bUPDATE\b[A-Z,\s]*\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+%I[^']*?\bTO\s+ih35_app/i;
  for (const { text } of fileTexts) {
    if (!dynRe.test(text)) continue;
    for (const q of text.matchAll(/'([a-z_][a-z0-9_]*)'/gi)) dyn.add(q[1].toLowerCase());
  }

  const all = fileTexts.map((f) => f.text).join("\n");
  const gaps = [];
  for (const [target, file] of targets) {
    const [schema, table] = target.split(".");
    if (ONCONFLICT_BLANKET_SCHEMAS.has(schema) || dyn.has(schema)) continue;
    const explicit = new RegExp(`GRANT\\s+[A-Z,\\s]*\\bUPDATE\\b[A-Z,\\s]*\\s+ON\\s+(?:TABLE\\s+)?${schema}\\.${table}\\b`, "i");
    const schemaWide = new RegExp(`GRANT\\s+[A-Z,\\s]*\\bUPDATE\\b[A-Z,\\s]*\\s+ON\\s+ALL\\s+TABLES\\s+IN\\s+SCHEMA\\s+${schema}\\b`, "i");
    if (explicit.test(all) || schemaWide.test(all)) continue;
    gaps.push(`${target} (${file}) — no migration grants UPDATE on it to ih35_app`);
  }
  return gaps;
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

  // ACCT-F180 — SECOND GRANT CLASS, SAME FAILURE MODE, folded in here rather than shipped as an
  // orphan guard. This file's remit is "a grant the runtime needs is missing, so the code cannot
  // run"; USAGE-on-schema was one instance, and INSERT ... ON CONFLICT DO UPDATE without UPDATE is
  // another. PostgreSQL requires BOTH INSERT and UPDATE for ON CONFLICT DO UPDATE and checks them at
  // PLAN time, so a missing UPDATE fails EVERY execution, not only the conflicting ones.
  //
  // public.idempotency_keys was granted SELECT, INSERT, DELETE. Its store is an ON CONFLICT DO
  // UPDATE. It therefore never stored a single row (n_tup_ins = 0) while the endpoint kept 400-ing
  // without an Idempotency-Key -- advertising a retry guarantee it could not deliver. One retried
  // POST /accounting/bills produced TWO payables 295 ms apart on prod.
  const conflictFindings = collectOnConflictGrantGaps(fileTexts);

  if (findings.length === 0 && conflictFindings.length === 0) {
    console.log(`verify:schema-usage-grants — OK (${scope}; ON CONFLICT DO UPDATE targets all have UPDATE)`);
    process.exit(0);
    return;
  }

  if (conflictFindings.length > 0) {
    console.error(
      "\nverify:schema-usage-grants — FAIL: INSERT ... ON CONFLICT DO UPDATE without an UPDATE grant\n" +
        "(ACCT-F180). PostgreSQL checks the privilege at PLAN time, so every such statement fails\n" +
        'with "permission denied" -- not just the conflicting ones:\n',
    );
    for (const f of conflictFindings) console.error(`  ✗ ${f}`);
    if (findings.length === 0) {
      console.error("");
      process.exit(1);
    }
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
