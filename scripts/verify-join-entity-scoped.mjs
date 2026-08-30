#!/usr/bin/env node
/**
 * CLS-JOIN-ENTITY-UNSCOPED — a JOIN to an entity-scoped table that matches on a bare id.
 *
 * THE DEFECT: scoping the row you READ does not scope the row you JOIN TO. Both instances found this
 * session had a properly scoped driving table and an unscoped join hanging off it:
 *   legal/matters.service.ts   LEFT JOIN mdata.drivers d ON d.id = m.related_driver_id
 *   driver/loads.routes.ts     JOIN mdata.loads l ON l.id = s.load_id     (authorised only by driver id)
 * The matter row was scoped by `m.operating_company_id = $1`; the driver joined to it was not. Because
 * these are LEFT JOINs on ids, nothing errors and nothing returns zero rows — the query returns ANOTHER
 * ENTITY'S driver name or unit number, rendered as an authoritative label on a legal-evidence record.
 *
 * WHY THIS GUARD AND NOT verify-mdata-entity-scope: that guard is CHANGED-SQL only — it hashes literals
 * and compares against a baseline, so a dormant unscoped JOIN is invisible until somebody happens to
 * edit that literal. That is exactly how both instances surfaced: not by audit, but by accident, because
 * adding a display column re-hashed the literal. A class that can only be found by accident is not
 * under control. This scans the FULL TREE, every literal, every run.
 *
 * SCOPE COLUMNS ARE VERIFIED AGAINST PROD, NOT ASSUMED (information_schema, 2026-08-05):
 *   operating_company_id : mdata.{drivers,loads,customers,vendors,locations},
 *                          accounting.{bills,invoices,payments,bill_payments,journal_entries},
 *                          catalogs.{accounts,classes}
 *   owner/leased PAIR    : mdata.units AND mdata.equipment — these have NO operating_company_id at all
 *                          (querying it is a recurring 500). The correct predicate is
 *                          COALESCE(currently_leased_to_company_id, owner_company_id).
 *   NEITHER              : mdata.load_stops — it carries no scope column and is scoped through its load,
 *                          so it is deliberately NOT a target. Including it would manufacture offenders
 *                          for a table that cannot satisfy the rule.
 *
 * NOT CLAIMED: static SQL-text analysis. It proves a scope predicate for the joined alias is PRESENT in
 * the same SQL block; it cannot prove the value compared is the caller's entity (that is
 * withCompanyScope / RLS at runtime), and it cannot see SQL assembled across variables. It is a ratchet
 * over a known-dangerous shape, not an oracle.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { maskSqlComments } from "./lib/mask-comments.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-join-entity-scoped";
const SRC = "apps/backend/src";
const BASELINE_PATH = "scripts/join-entity-scope-baseline.json";

/** table -> the scope column(s) that satisfy it. Verified on prod; do not extend from memory. */
const OPCO = ["operating_company_id"];
const LEASE_PAIR = ["currently_leased_to_company_id", "owner_company_id"];
const TARGETS = new Map([
  ["mdata.drivers", OPCO],
  ["mdata.loads", OPCO],
  ["mdata.customers", OPCO],
  ["mdata.vendors", OPCO],
  ["mdata.locations", OPCO],
  ["mdata.units", LEASE_PAIR],
  ["mdata.equipment", LEASE_PAIR],
  ["accounting.bills", OPCO],
  ["accounting.invoices", OPCO],
  ["accounting.payments", OPCO],
  ["accounting.bill_payments", OPCO],
  ["accounting.journal_entries", OPCO],
  ["catalogs.accounts", OPCO],
  ["catalogs.classes", OPCO],
  // CLS-DISPLAYID-UNSCOPED (2026-08-22): driver_finance.driver_settlements and
  // accounting.factoring_advances both carry the same per-entity display_id hazard as
  // accounting.invoices — verified live on prod (br-fancy-credit-akjnd07a):
  // driver_settlements: operating_company_id uuid NOT NULL, display_id text NOT NULL,
  //   UNIQUE (operating_company_id, display_id).
  // factoring_advances: operating_company_id uuid, display_id text,
  //   UNIQUE (operating_company_id, display_id) + UNIQUE (operating_company_id, id).
  // The GUARD-WORKORDERS row that requested this asked for "invoices, bills, payments, settlements,
  // factoring advances" — settlements and accounting.factoring_advances were the two per-entity-
  // display_id tables missing from TARGETS (bare `factoring.*` schema tables have no display_id
  // column at all, confirmed by migration sweep, so that schema is correctly excluded — the actual
  // factoring-advance table lives in `accounting.*`, not `factoring.*`).
  ["driver_finance.driver_settlements", OPCO],
  ["accounting.factoring_advances", OPCO],
]);

/** Any backticked template literal that contains a JOIN. */
// Any backticked literal that reads a table. This deliberately matches FROM as well as JOIN: an earlier
// version keyed on JOIN alone, which meant a bare `SELECT ... FROM mdata.drivers WHERE id = $1` was never
// even scanned — the exact WO-611 shape the guard is supposed to catch.
const HAS_FROM_OR_JOIN = /\b(?:FROM|JOIN)\b/i;

/**
 * BACKTICK-BRIDGING BUG (found 2026-08-12, hit repeatedly: accounting/break-even.service.ts,
 * dispatch/book-load.service.ts, master-data/.../fuel-history.service.ts,
 * telematics/fleet-location-hos.service.ts). The old approach — `` /`([^`]*\b(?:FROM|JOIN)\b[^`]*)`/g ``
 * — has no concept of "this backtick already CLOSED a literal, it cannot also be the OPEN of the next
 * match." A short unrelated literal (e.g. a `set_config(...)` call) that does NOT itself contain FROM/
 * JOIN fails to match on its own true open/close pair; the regex engine then retries starting at that
 * literal's CLOSING backtick, treating it as a fresh open, and pairs it with the NEXT literal's opening
 * backtick — bridging everything in between (including plain code and `//` comments) into one bogus
 * "SQL block." A comment mentioning "FROM mdata.units" on the way to the real, already-correctly-scoped
 * query then gets misattributed to that real query's line number as an unscoped read.
 *
 * Fix: tokenize template literals by SEQUENTIALLY PAIRING backticks (1st-with-2nd, 3rd-with-4th, ...),
 * exactly how JS/TS actually delimits them — a backtick can never appear unescaped inside a literal, so
 * this pairing is exact, not heuristic. Each pair is one true literal; no literal can borrow a
 * neighboring literal's boundary.
 */
function extractTemplateLiterals(src) {
  const literals = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] !== "`") {
      i++;
      continue;
    }
    const start = i + 1;
    let j = start;
    while (j < n) {
      if (src[j] === "\\") {
        j += 2;
        continue;
      }
      if (src[j] === "`") break;
      j++;
    }
    if (j >= n) break; // unterminated backtick to EOF — nothing more to pair
    literals.push({ content: src.slice(start, j), index: i });
    i = j + 1;
  }
  return literals;
}

/** `LEFT JOIN mdata.drivers d ON ...` / `JOIN accounting.bills AS b ON ...` */
const JOIN_RE =
  /\b(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*(?:OUTER\s+)?JOIN\s+([a-z_]+\.[a-z_]+)\s+(?:AS\s+)?([a-z][a-z0-9_]*)\b/gi;

/**
 * A bare single-table read: `FROM mdata.drivers WHERE id = $1` (no alias) or `FROM mdata.drivers d`.
 *
 * WHY THIS SHAPE IS IN SCOPE TOO: the WO Class auto-derive leak (workorder 611) was NOT a join — it was
 *   SELECT last_name FROM mdata.drivers WHERE id = $1
 * one line below a correctly scoped unit lookup. A guard that only understood JOINs would have reported
 * that file clean while a driver's surname crossed entities onto a work order. The class is "reads an
 * entity-scoped table without an entity predicate"; JOIN is just its most common spelling.
 */
const FROM_RE = /\bFROM\s+([a-z_]+\.[a-z_]+)(?:\s+(?:AS\s+)?([a-z][a-z0-9_]*))?\b/gi;

/** SQL keywords that can follow a table name and must never be mistaken for an alias. */
const NOT_AN_ALIAS = new Set([
  "where", "join", "left", "right", "inner", "full", "cross", "outer", "on", "group", "order",
  "limit", "offset", "union", "having", "returning", "set", "using", "as", "and", "or", "for",
  "window", "fetch", "except", "intersect",
]);

/** Scoped if one of its scope columns is COMPARED anywhere in the same block, alias-qualified or bare. */
function refIsScoped(block, alias, columns) {
  return columns.some((col) => {
    // With an alias: d.operating_company_id = ... ; bare: operating_company_id = ...
    const q = alias ? `\\b${alias}\\.${col}` : `\\b${col}`;
    // Tolerate an optional Postgres cast (`::text`, `::uuid`, …) between the column reference and
    // the comparison operator — a common, legitimate pattern (e.g.
    // `d.operating_company_id::text = e.operating_company_id::text`) that a bare
    // `col\s*(?:=|...)` never matched, false-flagging genuinely scoped JOINs.
    const cast = "(?:::[a-zA-Z_][a-zA-Z0-9_]*)?";
    const direct = new RegExp(`${q}${cast}\\s*(?:=|<>|!=|\\bIN\\b|\\bIS\\b)`, "i");
    // Equality/inequality is symmetric. `row.operating_company_id = d.operating_company_id` scopes
    // `d` just as strongly as the opposite spelling; requiring the governed alias on the left turns
    // correct relationship joins into false offenders and encourages duplicate predicates.
    const reverse = new RegExp(`(?:=|<>|!=)\\s*${q}${cast}\\b`, "i");
    const inCoalesce = new RegExp(`COALESCE\\s*\\([^)]*${q}\\b[^)]*\\)${cast}\\s*(?:=|\\bIN\\b)`, "i");
    return direct.test(block) || reverse.test(block) || inCoalesce.test(block);
  });
}

export function auditSql(src, file = "<mem>") {
  const problems = [];
  for (const blockMatch of extractTemplateLiterals(src)) {
    if (!HAS_FROM_OR_JOIN.test(blockMatch.content)) continue;
    // CLS-GUARD-READS-COMMENTS (5th instance, found 2026-08-07). The scope test accepts `IS` as a
    // comparison operator, so a SQL comment containing "…operating_company_id is read out later" made
    // this guard report a real unscoped JOIN as scoped — prose satisfying a security check. Mask `--`
    // and slash-star comments inside the SQL before matching. Offset-preserving, so the line numbers
    // this guard reports stay correct.
    const block = maskSqlComments(blockMatch.content);
    const refs = [];
    for (const j of block.matchAll(JOIN_RE)) refs.push({ table: j[1].toLowerCase(), alias: j[2], kind: "JOIN" });
    for (const f of block.matchAll(FROM_RE)) {
      const raw = f[2];
      const alias = raw && !NOT_AN_ALIAS.has(raw.toLowerCase()) ? raw : null;
      refs.push({ table: f[1].toLowerCase(), alias, kind: "FROM" });
    }
    for (const { table, alias, kind } of refs) {
      const columns = TARGETS.get(table);
      if (!columns) continue;
      if (refIsScoped(block, alias, columns)) continue;
      const line = src.slice(0, blockMatch.index).split("\n").length;
      const q = alias ? `${alias}.` : "";
      const want =
        columns === LEASE_PAIR
          ? `COALESCE(${q}currently_leased_to_company_id, ${q}owner_company_id) = <the caller's company>`
          : `${q}operating_company_id = <the caller's company>`;
      const why =
        kind === "JOIN"
          ? `Scoping the driving table does NOT scope what you join to`
          : `Reading by id alone does NOT scope the row — an id from another entity still matches`;
      problems.push(
        `${file}:${line}: ${kind} ${table}${alias ? ` ${alias}` : ""} has no entity predicate. ` +
          `${why} — this returns another entity's row without erroring. Add: ${want}`
      );
    }
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.includes(".test.")) out.push(rel);
}

/**
 * Stable key: file + kind + table + alias. Line numbers shift on unrelated edits and would churn the
 * baseline into meaninglessness, so they are deliberately not part of the key. Kind is included because
 * a file can reference the same table both ways (the WO service reads mdata.drivers bare AND joins it
 * elsewhere) and collapsing those would let one get fixed while the other silently inherited its entry.
 */
function keyOf(problem) {
  const file = problem.split(":")[0];
  const m = problem.match(/\b(JOIN|FROM) (\S+?)(?: (\S+))? has no entity predicate/);
  return m ? `${file}|${m[1]}|${m[2]}|${m[3] ?? "-"}` : `${file}|?`;
}

function collect() {
  const files = [];
  walk(SRC, files);
  const keys = [];
  for (const rel of files) {
    for (const p of auditSql(readFileSync(join(ROOT, rel), "utf8"), rel)) keys.push(keyOf(p));
  }
  return { keys: [...new Set(keys)].sort(), scanned: files.length };
}

function auditTree() {
  const { keys, scanned } = collect();
  if (scanned === 0) return [`${LABEL}: scanned ZERO backend sources — scope is wrong, refusing to pass vacuously.`];
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Generate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const problems = [];
  const added = keys.filter((k) => !baseline.has(k));
  if (added.length) {
    problems.push(
      `${added.length} NEW entity-unscoped JOIN(s) — the shape that puts another entity's driver/unit on ` +
        `a legal or money record:\n  ` +
        added.slice(0, 15).join("\n  ")
    );
  }
  if (keys.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${keys.length}. The baseline may only SHRINK.`);
  }
  return problems;
}

function selftest({ skipTree = false } = {}) {
  const failures = [];

  // The exact legal.matters shape that shipped.
  const bad = 'const q = `SELECT m.* FROM legal.matters m LEFT JOIN mdata.drivers d ON d.id = m.related_driver_id WHERE m.operating_company_id = $1`;';
  if (auditSql(bad).length === 0) failures.push("case1 FAIL — an unscoped JOIN to mdata.drivers was NOT caught");

  // The fix must clear it.
  const good = 'const q = `SELECT m.* FROM legal.matters m LEFT JOIN mdata.drivers d ON d.id = m.related_driver_id AND d.operating_company_id = m.operating_company_id`;';
  if (auditSql(good).length !== 0) failures.push("case2 FAIL — a correctly scoped JOIN was flagged");

  // units use the lease pair; operating_company_id does not exist on them.
  const unitBad = 'const q = `SELECT * FROM legal.matters m LEFT JOIN mdata.units u ON u.id = m.unit_id`;';
  if (auditSql(unitBad).length === 0) failures.push("case3 FAIL — an unscoped JOIN to mdata.units was NOT caught");

  const unitGood = 'const q = `SELECT * FROM legal.matters m LEFT JOIN mdata.units u ON u.id = m.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = m.operating_company_id`;';
  if (auditSql(unitGood).length !== 0) failures.push("case4 FAIL — the correct units lease-pair predicate was flagged");

  // A scope predicate in WHERE (not ON) still scopes the alias.
  const whereForm = 'const q = `SELECT * FROM a LEFT JOIN mdata.loads l ON l.id = a.load_id WHERE l.operating_company_id = $1`;';
  if (auditSql(whereForm).length !== 0) failures.push("case5 FAIL — a WHERE-form scope predicate was not honoured");

  // Non-target tables are out of scope. mdata.load_stops carries NO scope column (verified on prod) and
  // is scoped through its load, so it must never be flagged. The driving mdata.loads read IS scoped here,
  // so the only thing this case can trip on is load_stops itself.
  const nonTarget =
    'const q = `SELECT * FROM mdata.loads l JOIN mdata.load_stops s ON s.load_id = l.id WHERE l.operating_company_id = $1`;';
  if (auditSql(nonTarget).length !== 0)
    failures.push(`case6 FAIL — a non-target table was flagged: ${auditSql(nonTarget).join(" | ")}`);

  // THE WORKORDER-611 SHAPE — a bare read, no JOIN at all. A JOIN-only matcher called this clean while a
  // driver's surname crossed entities onto a work order. It MUST fail.
  const bareRead = 'const q = `SELECT last_name FROM mdata.drivers WHERE id = $1 LIMIT 1`;';
  if (auditSql(bareRead).length === 0) failures.push("case7 FAIL — the WO-611 bare unscoped read was NOT caught");

  // Same read, scoped (the shipped fix) → clean. Bare column form, no alias.
  const bareReadFixed =
    'const q = `SELECT last_name FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`;';
  if (auditSql(bareReadFixed).length !== 0) failures.push("case8 FAIL — the scoped bare read was flagged");

  // Aliased bare read, scoped via the alias → clean.
  const aliasedRead = 'const q = `SELECT d.last_name FROM mdata.drivers d WHERE d.id = $1 AND d.operating_company_id = $2`;';
  if (auditSql(aliasedRead).length !== 0) failures.push("case9 FAIL — a scoped aliased read was flagged");

  // `FROM mdata.units WHERE ...` — WHERE must not be mistaken for an alias, and the lease pair applies.
  const unitBareScoped =
    'const q = `SELECT unit_number FROM mdata.units WHERE id = $1 AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)`;';
  if (auditSql(unitBareScoped).length !== 0)
    failures.push("case10 FAIL — a scoped bare units read was flagged (WHERE parsed as an alias?)");

  // A cast between the column and the operator (`::text`, `::uuid`, …) is common, legitimate SQL
  // and must not defeat scope detection — the real drug-alcohol program.service.ts shape.
  const castScoped =
    'const q = `SELECT * FROM safety.da_program_enrollments e LEFT JOIN mdata.drivers d ON d.id = e.driver_uuid AND d.operating_company_id::text = e.operating_company_id::text`;';
  if (auditSql(castScoped).length !== 0)
    failures.push(`case11 FAIL — a cast-scoped JOIN (::text = ::text) was flagged: ${auditSql(castScoped).join(" | ")}`);

  const rhsScoped =
    'const q = `SELECT * FROM mdata.loads l JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id AND l.operating_company_id = d.operating_company_id WHERE l.operating_company_id = $1`;';
  if (auditSql(rhsScoped).length !== 0)
    failures.push(`case11b FAIL — a right-hand-side scope equality was flagged: ${auditSql(rhsScoped).join(" | ")}`);

  // A cast must not become a blanket escape hatch — an unscoped JOIN with an unrelated cast
  // elsewhere in the block must still be caught.
  const castUnscoped =
    'const q = `SELECT e.created_at::text FROM safety.da_program_enrollments e LEFT JOIN mdata.drivers d ON d.id = e.driver_uuid WHERE e.operating_company_id::text = $1::uuid::text`;';
  if (auditSql(castUnscoped).length === 0)
    failures.push("case12 FAIL — an unscoped JOIN with an unrelated cast nearby escaped detection");

  if (!skipTree) {
    const tree = auditTree();
    if (tree.length !== 0) failures.push(`case8 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — unscoped drivers/units JOINs caught; ON-form, WHERE-form, lease-pair and non-targets all correct`);
}

function main() {
  if (process.argv.includes("--parser-selftest")) return selftest({ skipTree: true });
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { keys, scanned } = collect();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify(
        {
          note:
            "CLS-JOIN-ENTITY-UNSCOPED ratchet — JOINs to entity-scoped tables with no scope predicate. " +
            "An INVENTORY of existing debt, NOT an approval of these joins. May only SHRINK.",
          scanned,
          offenders: keys,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL}: baseline written — ${keys.length} offender(s) across ${scanned} files.`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no NEW entity-unscoped JOINs`);
}

main();
