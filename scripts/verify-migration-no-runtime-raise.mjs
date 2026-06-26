#!/usr/bin/env node
/**
 * verify-migration-no-runtime-raise.mjs  —  BLOCK-RELIABILITY-07
 *
 * Codifies the #1495 lesson: a migration must NEVER hard-fail (RAISE) based on the
 * PRESENCE/ABSENCE of runtime/QBO-synced DATA. #1495 added a migration with
 * `RAISE EXCEPTION` when TRANSP lacked a QBO-synced account; on a CI FRESH DB (no
 * such data) the RAISE fired and broke fresh-DB replay. It "passed" only on a
 * prod-COPY branch where the data existed. Migrations must replay green on an empty
 * DB from 0001.
 *
 * DANGEROUS vs SAFE (the key refinement):
 *   - raise-on-ABSENCE  (e.g. `IF NOT EXISTS (SELECT .. FROM data_table) THEN RAISE`)
 *       -> fires on a FRESH/empty DB -> BREAKS replay. THIS is the #1495 class. BLOCKING under enforce.
 *   - raise-on-PRESENCE (e.g. `IF EXISTS (SELECT .. bad rows ..) THEN RAISE`)
 *       -> does NOT fire on a fresh DB (no rows) -> usually replay-safe. Advisory only.
 *   - unknown           -> controlling condition not classifiable -> advisory + flag for human.
 *
 * SCOPE / CORRECTNESS:
 *   - Flags only MIGRATION-TIME raises: in a `DO ..` block or top-level.
 *   - Does NOT flag RAISE inside a `CREATE [OR REPLACE] FUNCTION ..` body -- those run at call-time
 *     (trigger validation etc.), not during migration replay. (Key false-positive guard.)
 *   - Only aborting raises (RAISE EXCEPTION / RAISE SQLSTATE / RAISE 'msg'); NOTICE/WARNING/LOG/INFO/
 *     DEBUG ignored. Excludes structural refs (information_schema, pg_catalog, to_regclass, has_*_privilege).
 *
 * MODE: ADVISORY by default (lists offenders, exit 0). MIGRATION_RAISE_LINT_ENFORCE=true -> BLOCKING
 * (exit 1) ONLY on raise-on-ABSENCE offenders (presence/unknown stay advisory). Pure static analysis,
 * no DB. Run self-tests with: node scripts/verify-migration-no-runtime-raise.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const ENFORCE = process.env.MIGRATION_RAISE_LINT_ENFORCE === "true";
const WINDOW = 12; // lines to look back for the controlling data-table reference (tight = fewer false refs)

const DATA_SCHEMA_RE =
  /\b(mdata|accounting|driver_finance|banking|factor|fuel|hos|dispatch|sales|geo|events|catalogs)\.[a-z_][a-z0-9_]*/i;
const STRUCTURAL_RE =
  /\b(information_schema|pg_catalog|pg_class|pg_namespace|pg_roles|pg_tables|pg_proc|pg_attribute|to_regclass|to_regtype|has_schema_privilege|has_table_privilege)\b/i;
const ABORTING_RAISE_RE = /\braise\s+(exception|sqlstate|'|")/i;
const FUNC_OPEN_RE = /\bcreate\s+(or\s+replace\s+)?function\b/i;
const ABSENCE_RE = /\bnot\s+exists\b|count\(\*\)\s*(=|<)\s*[01]\b|\bis\s+null\b|\bnot\s+in\b|having\s+count\(\*\)\s*=\s*0/i;
const PRESENCE_RE = /\bexists\b|count\(\*\)\s*(>|>=|<>|!=)|\bis\s+not\s+null\b/i;

/** Pure analyzer (exported for self-test). Returns offenders with absence/presence/unknown variant. */
export function analyzeSql(text) {
  const lines = text.split(/\r?\n/);
  const offenders = [];
  let inDollar = false;
  let dollarTag = null;
  let bodyKind = null; // 'function' | 'do' | null
  let pendingFunc = false;

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();

    // Classify a RAISE against the body kind AT LINE START — before this line's own tags toggle it.
    // Handles `.. RAISE ..; END $$;` (closing tag on the RAISE line) inside a function body.
    const lineStartBodyKind = bodyKind;

    // FUNC_OPEN must be checked BEFORE the tag toggle so a same-line `CREATE FUNCTION .. AS $$`
    // opens the body as 'function', not 'do'.
    if (FUNC_OPEN_RE.test(lower)) pendingFunc = true;
    const tags = lower.match(/\$[a-z0-9_]*\$/g) || [];
    for (const t of tags) {
      if (!inDollar) {
        inDollar = true; dollarTag = t; bodyKind = pendingFunc ? "function" : "do"; pendingFunc = false;
      } else if (t === dollarTag) {
        inDollar = false; dollarTag = null; bodyKind = null;
      }
    }

    if (ABORTING_RAISE_RE.test(lower) && lineStartBodyKind !== "function") {
      let dataRef = null;
      let condStart = i;
      for (let j = i; j >= Math.max(0, i - WINDOW); j--) {
        if (STRUCTURAL_RE.test(lines[j])) continue;
        const m = lines[j].match(DATA_SCHEMA_RE);
        if (m && /\b(select|from|join|exists|count|into)\b/i.test(lines[j])) {
          dataRef = m[0]; condStart = j; break;
        }
      }
      if (dataRef) {
        const condText = lines.slice(Math.max(0, condStart - 2), i + 1).join(" ").toLowerCase();
        let variant = "unknown";
        if (ABSENCE_RE.test(condText)) variant = "absence";
        else if (PRESENCE_RE.test(condText)) variant = "presence";
        offenders.push({ line: i + 1, raiseText: lines[i].trim().slice(0, 100), dataRef, variant });
      }
    }
  }
  return offenders;
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

// ---- self-test fixtures (the #1495 acceptance: absence caught, presence advisory, clean passes) ----
function selftest() {
  const cases = [
    {
      name: "#1495-style raise-on-ABSENCE (must be 'absence')",
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM catalogs.accounts WHERE qbo_synced) THEN
          RAISE EXCEPTION 'no QBO account';
        END IF; END $$;`,
      expect: "absence",
    },
    {
      name: "raise-on-PRESENCE bad-state (must be 'presence')",
      sql: `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM accounting.journal_entry_postings WHERE amount_cents < 0) THEN
          RAISE EXCEPTION 'bad rows exist';
        END IF; END $$;`,
      expect: "presence",
    },
    {
      name: "RAISE inside CREATE FUNCTION body (must NOT flag)",
      sql: `CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM mdata.loads) THEN RAISE EXCEPTION 'x'; END IF; END $$;`,
      expect: null,
    },
    {
      name: "structural-only RAISE (must NOT flag)",
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='x') THEN
          RAISE EXCEPTION 'missing table'; END IF; END $$;`,
      expect: null,
    },
    { name: "clean migration (must NOT flag)", sql: `ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS x text;`, expect: null },
  ];
  let pass = 0;
  for (const c of cases) {
    const off = analyzeSql(c.sql);
    const got = off.length ? off[0].variant : null;
    const ok = got === c.expect;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (expected=${c.expect} got=${got})`);
    if (ok) pass++;
  }
  console.log(`\nself-test: ${pass}/${cases.length} passed`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const migrations = listMigrations();
  const all = migrations.flatMap((f) =>
    analyzeSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")).map((o) => ({ file: f, ...o })),
  );
  const dangerous = all.filter((o) => o.variant === "absence");

  if (all.length === 0) {
    console.log(`[anti-RAISE-lint] PASS — no migration-time RAISE conditioned on data-table rows (${migrations.length} files).`);
    process.exit(0);
  }

  const blocking = ENFORCE && dangerous.length > 0;
  console.error(`\n${blocking ? "ANTI-RAISE LINT FAILED" : "ANTI-RAISE LINT — ADVISORY"}`);
  console.error("=".repeat(64));
  console.error("Migration-time RAISE keyed on a DATA table. raise-on-ABSENCE breaks fresh-DB replay (#1495).");
  console.error("Gate on STRUCTURE only; move data assertions to app-layer fail-loud.\n");
  for (const o of all) {
    const tag = o.variant === "absence" ? "DANGEROUS(absence)" : o.variant === "presence" ? "advisory(presence)" : "advisory(unknown)";
    console.error(`  [${tag}] ${o.file}:${o.line}  ref=${o.dataRef}`);
    console.error(`     ${o.raiseText}`);
  }
  console.error("=".repeat(64));
  console.error(`${all.length} offender(s): ${dangerous.length} DANGEROUS(absence), ${all.length - dangerous.length} advisory.`);

  if (blocking) process.exit(1);
  if (!ENFORCE) console.error("Advisory mode (MIGRATION_RAISE_LINT_ENFORCE!=true).");
  else console.error("Enforce mode: 0 dangerous(absence) offenders — passing.");
  process.exit(0);
}

main();
