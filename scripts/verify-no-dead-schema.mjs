#!/usr/bin/env node
/**
 * verify-no-dead-schema — LAW OF THE LAND (§10a Total Connectivity) enforcement, layer 1.
 *
 * WHY THIS EXISTS: §10a says every record/field must be wired to its financial primitives and
 * operational modules. That law was the ONLY law in this repo with no CI guard, so it kept being
 * substituted with the signals that DO have guards ("CI green", "file present on main"). Route
 * orphans get caught by verify-no-orphan-routes.mjs; COLUMN orphans had nothing. Result: columns
 * and tables shipped to prod that nothing ever reads, implying features that do not exist
 * (e.g. mdata.drivers.has_b1_visa / b1_visa_number — B1-visa tracking is a real business
 * requirement for this carrier, the storage exists, and no line of code reads it).
 *
 * WHAT IT ASSERTS: every table and every column created by a migration is read by non-test source
 * under apps/backend/src or apps/frontend/src. Two distinct failure kinds, because they are
 * different defects and deserve different words:
 *
 *   DEAD  — the identifier appears NOWHERE in non-test source. Storage with no reader at all.
 *   WEAK  — the identifier appears somewhere, but in no file that touches this table. This is the
 *           "substring illusion": a column named `driver_id` or `employment_status` looks read
 *           because the same word exists elsewhere, while THIS table's column has no reader.
 *           mdata.drivers.employment_status is the worked example — migration 0301 added the free
 *           text column, 0343 superseded it with driver_employment_status_id, and a naive
 *           whole-corpus substring match reports it as "referenced" forever.
 *
 * MATCHING RULES (deliberate, and the reason this guard is not cosmetic):
 *   - Identifiers are matched as WHOLE TOKENS, never as substrings. `employment_status` is NOT
 *     satisfied by `employment_statuses` or `driver_employment_status_id`.
 *   - snake_case and camelCase are the same identifier (`payment_account_uuid` ≡ paymentAccountUuid),
 *     so a DTO/mapper counts as a reader.
 *   - "Touches this table" = the file names the qualified table, OR its token set / file path
 *     carries the table's base name (singular or plural). Path counts so that
 *     components/driver-profile/IdentityHeader.tsx reads as a driver-table reader.
 *   - Columns dropped or renamed by a later migration are excluded — they are not live schema.
 *
 * BASELINE: pre-existing dead/weak schema is a DEBT REGISTER, not an approval. NEW dead schema
 * fails the build. Wiring an object and deleting its baseline entry is the goal; the guard prints
 * entries that became wired so the register drains.
 *
 * STATIC: parses db/migrations/*.sql. It proves SCHEMA REACHABILITY IN CODE only — it cannot prove
 * rows are populated, that the poster runs, or that reverse drill-through exists in the UI. Those
 * are live-data audits (§0: prod wins). Never cite this guard as proof the books are wired.
 * Operational decision columns (for example suppression reason/provenance) must be named by their
 * table reader; merely using the table as an EXISTS predicate does not satisfy those columns.
 *
 * RESIDUAL LIMIT, stated honestly: context resolution is FILE-scope, not statement-scope. A dead
 * column whose name is also used for a DIFFERENT table in the same file (a dead
 * accounting.expenses.driver_id next to a live join on driver_id) still reads as wired. File scope
 * is a large improvement over whole-corpus substring matching, not a closed hole — do not report
 * this guard as proving every column has a reader.
 *
 * Run: node scripts/verify-no-dead-schema.mjs [--selftest] [--report]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "db/migrations");
const SOURCE_ROOTS = [join(ROOT, "apps/backend/src"), join(ROOT, "apps/frontend/src")];
const BASELINE_FILE = join(ROOT, "scripts/verify-no-dead-schema.baseline.json");

// Columns every table carries; presence is structural, not a feature claim.
const BOILERPLATE = new Set([
  "id", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id",
  "voided_at", "voided_by_user_id", "void_reason", "deactivated_at", "archived_at",
  "is_active", "operating_company_id", "tenant_id", "notes", "metadata",
]);

const COLUMN_TYPE =
  "uuid|text|numeric|integer|bigint|boolean|timestamptz|timestamp|date|jsonb|json|varchar|char|smallint|int|decimal|real|double|bytea|inet|interval|money|serial|bigserial";

export const normIdent = (s) => s.toLowerCase().replace(/_/g, "");
const normPath = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Split a migration into independently-parseable SQL chunks.
 *
 * Semicolons INSIDE a dollar-quoted DO body terminate the ALTER regex early and the "table" capture
 * drifts onto unrelated text (observed: "migration.test_seed_archive_ledger_0320"). The earlier fix
 * DISCARDED those bodies — but this repo creates real tables and columns inside `DO $$ ... $$`
 * blocks (maintenance.work_orders and safety.accident_reports among them), so discarding them made
 * that DDL invisible to the guard. Bodies are therefore EXTRACTED and parsed as their own chunks:
 * no drift, no blind spot.
 */
export function sqlChunks(sql) {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const bodies = [];
  const outer = noComments.replace(/\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1?\$/g, (_m, _tag, body) => {
    bodies.push(body);
    return " ";
  });
  return [outer, ...bodies];
}

/**
 * Split a CREATE TABLE body into column/constraint definitions.
 * Splitting on newlines alone loses every column after the first when a migration writes several
 * on one line (`id uuid, vendor_id uuid, ...`), so split on top-level commas too — depth-aware, so
 * `numeric(12,2)` and `CHECK (x IN ('a','b'))` stay intact.
 */
export function splitDefinitions(body) {
  const parts = [];
  let depth = 0, cur = "", quote = null;
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," || ch === "\n") && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/**
 * Extract live schema from a migration corpus.
 * Returns { tables: Map(schema.table -> migration), columns: Map("schema.table.col" -> {table,column,migration}) }
 * with DROP/RENAME'd objects removed — a column that no longer exists is not dead schema.
 *
 * Covers BOTH column forms. The earlier draft parsed only `ADD COLUMN`, which is 1,074 of this
 * repo's 5,740 live columns — 81% of every column ever written was invisible to it, because most
 * columns are born inside CREATE TABLE.
 */
export function extractSchema(sqlFiles) {
  const tables = new Map();
  const columns = new Map();
  const dropped = new Set();
  const droppedTables = new Set();
  const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;

  for (const { name, sql: raw } of sqlFiles) {
    for (const sql of sqlChunks(raw)) {

    for (const m of sql.matchAll(
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\n\s*\)\s*(?:PARTITION BY[^;]*)?;/gi
    )) {
      const table = m[1];
      if (!QUALIFIED.test(table)) continue;
      if (!tables.has(table)) tables.set(table, name);
      for (const line of splitDefinitions(m[2])) {
        const c = line.match(new RegExp(`^\\s*"?([a-z_][a-z0-9_]*)"?\\s+(?:${COLUMN_TYPE})\\b`, "i"));
        if (!c || BOILERPLATE.has(c[1])) continue;
        const key = `${table}.${c[1]}`;
        if (!columns.has(key)) columns.set(key, { table, column: c[1], migration: name });
      }
    }

    for (const m of sql.matchAll(/ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi)) {
      const table = m[1];
      if (!QUALIFIED.test(table)) continue;
      for (const c of m[2].matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        if (BOILERPLATE.has(c[1])) continue;
        const key = `${table}.${c[1]}`;
        if (!columns.has(key)) columns.set(key, { table, column: c[1], migration: name });
      }
      for (const c of m[2].matchAll(/DROP COLUMN(?:\s+IF EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        dropped.add(`${table}.${c[1]}`);
      }
      for (const c of m[2].matchAll(/RENAME COLUMN\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        dropped.add(`${table}.${c[1]}`);
      }
    }

    for (const m of sql.matchAll(/DROP TABLE(?:\s+IF EXISTS)?\s+([A-Za-z_][\w.]*)/gi)) {
      if (QUALIFIED.test(m[1])) droppedTables.add(m[1]);
    }
    }
  }

  for (const k of dropped) columns.delete(k);
  for (const t of droppedTables) {
    tables.delete(t);
    for (const k of [...columns.keys()]) if (k.startsWith(`${t}.`)) columns.delete(k);
  }
  return { tables, columns };
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(p) && !/\.(test|spec)\.[tj]sx?$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

/** Per-file whole-token index. Substring matching is what made the first draft blind. */
export function buildSourceIndex(files) {
  return files.map((f) => {
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch { /* unreadable file contributes nothing */ }
    const tokens = new Set();
    for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) tokens.add(normIdent(m[0]));
    return { path: normPath(f), text, tokens };
  });
}

/** Files that plausibly touch this table: qualified name, or base name in tokens or path. */
export function filesTouchingTable(index, table) {
  const short = table.split(".").pop();
  const cands = [short, short.replace(/s$/, ""), `${short}s`].map(normIdent);
  return index.filter(
    (f) => f.text.includes(table) || cands.some((c) => f.tokens.has(c) || f.path.includes(c))
  );
}

/** "strong" = read by a file that touches the table · "weak" = read only elsewhere · "none" = nowhere. */
export function referenceKind(ident, index, contextFiles) {
  if (!ident || ident.length < 4) return "strong"; // too short to match meaningfully; don't false-fail
  const n = normIdent(ident);
  if (contextFiles.some((f) => f.tokens.has(n))) return "strong";
  if (index.some((f) => f.tokens.has(n))) return "weak";
  return "none";
}

export function analyze({ tables, columns }, index) {
  const contextCache = new Map();
  const ctxFor = (t) => {
    if (!contextCache.has(t)) contextCache.set(t, filesTouchingTable(index, t));
    return contextCache.get(t);
  };
  const findings = [];

  for (const [table, migration] of tables) {
    const short = table.split(".").pop();
    const kind = referenceKind(short, index, ctxFor(table));
    if (kind !== "strong") findings.push({ object: table, kind: "TABLE", verdict: kind, migration });
  }
  for (const [key, { table, column, migration }] of columns) {
    const kind = referenceKind(column, index, ctxFor(table));
    if (kind !== "strong") findings.push({ object: key, kind: "COLUMN", verdict: kind, migration });
  }
  return findings.sort((a, b) => a.object.localeCompare(b.object));
}

function loadBaseline() {
  try {
    const b = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    return new Set((b.entries ?? []).map((e) => e.object));
  } catch {
    return new Set();
  }
}

function readMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }));
}

function main() {
  const migrations = readMigrations();
  const schema = extractSchema(migrations);
  const index = buildSourceIndex(SOURCE_ROOTS.flatMap((r) => walk(r)));
  const findings = analyze(schema, index);

  if (process.argv.includes("--report")) {
    console.log(JSON.stringify({ count: findings.length, entries: findings }, null, 2));
    return;
  }

  const baseline = loadBaseline();
  const fresh = findings.filter((f) => !baseline.has(f.object));
  const drained = [...baseline].filter((k) => !findings.some((f) => f.object === k));

  if (fresh.length > 0) {
    console.error("verify-no-dead-schema FAILED — schema created with no reader (§10a linkage law):\n");
    for (const f of fresh) {
      console.error(`  ${f.kind.padEnd(6)} ${f.object}`);
      console.error(`         added by ${f.migration}`);
      console.error(
        f.verdict === "none"
          ? `         nothing in apps/backend/src or apps/frontend/src reads "${f.object.split(".").pop()}"`
          : `         "${f.object.split(".").pop()}" appears elsewhere in the codebase but in NO file that` +
            ` touches ${f.object.split(".").slice(0, 2).join(".")} — the substring illusion, not a reader\n`
      );
    }
    console.error("\nA column or table nothing reads is dead schema: it implies a feature that does not exist.");
    console.error("Fix it by WIRING it in the same PR (read it, reach a financial primitive, expose");
    console.error("drill-through) — or add a baseline entry WITH A REASON if the deferral is tracked.");
    process.exit(1);
  }

  if (drained.length > 0) {
    console.log("verify-no-dead-schema: NOTE — these baseline entries are now wired; remove them:");
    for (const k of drained) console.log(`  • ${k}`);
  }
  const dead = findings.filter((f) => f.verdict === "none").length;
  console.log(
    `verify-no-dead-schema: OK — ${schema.tables.size} tables / ${schema.columns.size} live columns checked, ` +
      `${findings.length} baselined debt (${dead} unread anywhere, ${findings.length - dead} read-but-not-here), 0 new.`
  );
}

function selftest() {
  const failures = [];

  const { tables, columns } = extractSchema([
    {
      name: "0001_probe.sql",
      sql: `CREATE TABLE IF NOT EXISTS foo.bar (
              id uuid PRIMARY KEY,
              inline_live_column text NOT NULL,
              inline_dead_column text,
              created_at timestamptz
            );
            ALTER TABLE foo.baz ADD COLUMN IF NOT EXISTS added_live_column text,
              ADD COLUMN IF NOT EXISTS added_dead_column text;
            ALTER TABLE foo.baz DROP COLUMN IF EXISTS added_dead_column;`,
    },
  ]);
  // COVERAGE REGRESSION LOCK: columns born inside CREATE TABLE must be extracted. Parsing only
  // ADD COLUMN left 81% of this repo's columns unchecked and the guard reported OK regardless.
  if (!columns.has("foo.bar.inline_live_column")) failures.push("inline CREATE TABLE column not extracted (81% coverage hole)");
  if (!columns.has("foo.bar.inline_dead_column")) failures.push("second inline CREATE TABLE column not extracted");
  if (!columns.has("foo.baz.added_live_column")) failures.push("ADD COLUMN not extracted");
  if (columns.has("foo.baz.added_dead_column")) failures.push("DROP COLUMN'd column still reported as live schema");
  if (columns.has("foo.bar.created_at")) failures.push("boilerplate column not skipped");
  if (!tables.has("foo.bar")) failures.push("CREATE TABLE not extracted");

  const index = [
    { path: "appsbackendsrcfoobarservicets", text: "select inline_live_column from foo.bar", tokens: new Set(["inlinelivecolumn", "foo", "bar", "select", "from"]) },
    { path: "appsbackendsrcunrelatedservicets", text: "const x = added_live_column;", tokens: new Set(["addedlivecolumn", "const"]) },
  ];
  const ctxBar = filesTouchingTable(index, "foo.bar");
  if (referenceKind("inline_live_column", index, ctxBar) !== "strong") failures.push("a real reader was not scored strong");
  if (referenceKind("inline_dead_column", index, ctxBar) !== "none") failures.push("an unread column was not scored none");
  // SUBSTRING-ILLUSION REGRESSION LOCK: `added_live_column` is read, but only by a file that does
  // not touch foo.bar. Whole-corpus substring matching scored that "referenced" and let a dead
  // column named like a common one (driver_id, employment_status) pass forever.
  if (referenceKind("added_live_column", index, ctxBar) !== "weak") failures.push("substring illusion not caught (weak reference scored as read)");
  // WHOLE-TOKEN LOCK: employment_status must NOT be satisfied by employment_statuses.
  const plural = [{ path: "x", text: "reference.employment_statuses", tokens: new Set(["employmentstatuses", "reference"]) }];
  if (referenceKind("employment_status", plural, plural) !== "none") failures.push("substring match resurrected: plural token satisfied a singular column");
  const suppressionReader = [{
    path: "appsbackendsrcnotificationsemailservicets",
    text: "SELECT reason, auto_suppressed FROM notifications.suppression_rules",
    tokens: new Set(["select", "reason", "autosuppressed", "from", "notifications", "suppressionrules"]),
  }];
  const suppressionContext = filesTouchingTable(suppressionReader, "notifications.suppression_rules");
  if (referenceKind("reason", suppressionReader, suppressionContext) !== "strong") failures.push("suppression reason reader not recognized");
  if (referenceKind("auto_suppressed", suppressionReader, suppressionContext) !== "strong") failures.push("suppression provenance reader not recognized");

  if (failures.length) {
    console.error("verify-no-dead-schema SELFTEST FAILED:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("verify-no-dead-schema --selftest OK");
}

// Import-safe: importing a helper must not run the guard (or inherit its process.exit).
const INVOKED_DIRECTLY = process.argv[1] && normPath(process.argv[1]).endsWith(normPath("verify-no-dead-schema.mjs"));
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
