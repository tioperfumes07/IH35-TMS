#!/usr/bin/env node
/**
 * CLS-JOIN-ENTITY-UNSCOPED — apply the canonical entity predicate to EVERY unscoped read of an
 * entity-scoped table, tree-wide, in one pass.
 *
 * WHY A CODEMOD AND NOT A RUNTIME HELPER: the property is verified by STATIC SQL TEXT
 * (verify-join-entity-scoped scans the template literal). A shared function that returned the predicate
 * would therefore DEFEAT the guard — the literal would read `${scopeFor("u")}` and scan as unscoped. So
 * the "fix once, lands everywhere" artifact for this class is one RULE plus one codemod that writes the
 * predicate at every site, not a helper and not 300 hand edits. (Hand-editing also produced a real
 * defect: a blanket search/replace double- and triple-applied a predicate to already-fixed JOINs.)
 *
 * THE RULE, and it refuses to guess:
 *   1. Reuse the guard's own TARGETS map and its notion of "scoped", so codemod and guard cannot drift.
 *   2. The predicate is `AND <scope-expr-for-table> = <entity>` where the scope expression is
 *        operating_company_id                                     for most tables, and
 *        COALESCE(currently_leased_to_company_id, owner_company_id) for mdata.units / mdata.equipment,
 *      which carry NO operating_company_id at all (§4 landmine, a recurring 42703 → 500).
 *   3. `<entity>` is INFERRED FROM THE SAME SQL BLOCK, never invented:
 *        a. an existing entity comparison against a bind — `x.operating_company_id = $3::uuid` — wins,
 *           and the bind is reused verbatim; else
 *        b. the driving table's alias-qualified column, when that alias is itself entity-compared
 *           somewhere in the block.
 *      If neither is derivable the site is SKIPPED and reported. A wrong entity expression is worse
 *      than an unfixed site, so this never falls back to a default.
 *
 * Usage: node scripts/codemod-join-entity-scope.mjs [--apply] [--limit N] [--filter substr]
 * Default is a DRY RUN that prints what it would change.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { maskSqlComments } from "./lib/mask-comments.mjs";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i === -1 ? Infinity : Number(process.argv[i + 1]);
})();
const FILTER = (() => {
  const i = process.argv.indexOf("--filter");
  return i === -1 ? null : process.argv[i + 1];
})();
/**
 * Lane boundary. The MEASUREMENT is global — the whole tree is scanned and reported — but the APPLY is
 * lane-scoped, because editing another lane's files creates conflicts with their in-flight PRs. The
 * money lane gets the same instrument, not a hand-off of hand edits:
 *   node scripts/codemod-join-entity-scope.mjs --apply --filter accounting/
 */
const EXCLUDE = (() => {
  const i = process.argv.indexOf("--exclude");
  return i === -1 ? [] : process.argv[i + 1].split(",").filter(Boolean);
})();

const OPCO = ["operating_company_id"];
const LEASE_PAIR = ["currently_leased_to_company_id", "owner_company_id"];
const TARGETS = new Map([
  ["mdata.drivers", OPCO], ["mdata.loads", OPCO], ["mdata.customers", OPCO],
  ["mdata.vendors", OPCO], ["mdata.locations", OPCO],
  ["mdata.units", LEASE_PAIR], ["mdata.equipment", LEASE_PAIR],
  ["accounting.bills", OPCO], ["accounting.invoices", OPCO], ["accounting.payments", OPCO],
  ["accounting.bill_payments", OPCO], ["accounting.journal_entries", OPCO],
  ["catalogs.accounts", OPCO], ["catalogs.classes", OPCO],
]);

const SQL_BLOCK = /`([^`]*\b(?:FROM|JOIN)\b[^`]*)`/g;
const JOIN_LINE =
  /^(\s*)((?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*(?:OUTER\s+)?JOIN\s+([a-z_]+\.[a-z_]+)\s+(?:AS\s+)?([a-z][a-z0-9_]*)\s+ON\s+.*)$/i;

/**
 * A bare read — `FROM mdata.drivers d` / `FROM mdata.drivers`. These carry no ON clause, so the
 * predicate has to join the WHERE, which is why they are handled separately and far more cautiously.
 */
const FROM_LINE = /^(\s*)FROM\s+([a-z_]+\.[a-z_]+)(?:\s+(?:AS\s+)?([a-z][a-z0-9_]*))?\s*$/i;
const NOT_AN_ALIAS = new Set([
  "where", "join", "left", "right", "inner", "full", "cross", "outer", "on", "group", "order",
  "limit", "offset", "union", "having", "returning", "set", "using", "as", "and", "or", "for",
  "window", "fetch", "except", "intersect",
]);
/** Top-level clause keywords that terminate a WHERE. */
const WHERE_END = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|HAVING|WINDOW|UNION|EXCEPT|INTERSECT|RETURNING|FETCH|FOR\s+UPDATE)\b/i;

/**
 * Span of the WHERE clause body in `block`, or null.
 *
 * REFUSES on anything it cannot reason about safely — no WHERE at all, more than one WHERE (subqueries
 * or CTEs: the codemod cannot tell which one owns the table), or a top-level `OR`.
 *
 * The `OR` rule is a correctness requirement, not caution: prepending `pred AND ` to `WHERE b OR c`
 * yields `(pred AND b) OR c`, which silently WIDENS the result set — the exact opposite of scoping.
 * Wrapping in parentheses would fix that, but rewriting someone's WHERE is a bigger edit than this
 * instrument should make unattended, so those sites are reported for a human instead.
 */
function whereSpan(block) {
  const wheres = [...block.matchAll(/\bWHERE\b/gi)];
  if (wheres.length !== 1) return null;
  const start = wheres[0].index + wheres[0][0].length;
  const rest = block.slice(start);
  const end = rest.search(WHERE_END);
  const body = end === -1 ? rest : rest.slice(0, end);
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && /\bOR\b/i.test(body.slice(i, i + 3)) && !/[a-z0-9_]/i.test(body[i - 1] || " ") && !/[a-z0-9_]/i.test(body[i + 2] || " ")) {
      return null;
    }
  }
  return { start, body };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** Same scoped-ness test the guard uses, so the two cannot disagree about what needs fixing. */
function isScoped(block, alias, columns) {
  return columns.some((col) => {
    const q = alias ? `\\b${alias}\\.${col}` : `\\b${col}`;
    return new RegExp(`${q}\\s*(?:=|<>|!=|\\bIN\\b|\\bIS\\b)`, "i").test(block) ||
      new RegExp(`COALESCE\\s*\\([^)]*${q}\\b[^)]*\\)\\s*(?:=|\\bIN\\b)`, "i").test(block);
  });
}

/** The caller's-entity expression, taken from the block or not at all. */
function inferEntityExpr(block) {
  // (a) an existing comparison to a bind parameter — reuse the exact bind.
  const bind = block.match(/\b(?:[a-z][a-z0-9_]*\.)?operating_company_id\s*=\s*(\$\d+(?:::uuid)?)/i)
    || block.match(/COALESCE\s*\([^)]*(?:currently_leased_to_company_id)[^)]*\)\s*=\s*(\$\d+(?:::uuid)?)/i)
    || block.match(/\b(?:[a-z][a-z0-9_]*\.)?owner_company_id\s*=\s*(\$\d+(?:::uuid)?)/i);
  if (bind) return bind[1].includes("::") ? bind[1] : `${bind[1]}::uuid`;
  // (b) an alias that is itself entity-compared: `x.operating_company_id = <anything>`.
  const alias = block.match(/\b([a-z][a-z0-9_]*)\.operating_company_id\s*(?:=|\bIN\b)/i);
  if (alias) return `${alias[1]}.operating_company_id`;
  return null;
}

function predicateFor(table, alias, entity) {
  const cols = TARGETS.get(table);
  return cols === LEASE_PAIR
    ? `AND COALESCE(${alias}.currently_leased_to_company_id, ${alias}.owner_company_id) = ${entity}`
    : `AND ${alias}.operating_company_id = ${entity}`;
}

const changed = [];
const skipped = [];
let files = 0;

for (const file of walk(SRC)) {
  const label = relative(ROOT, file);
  if (FILTER && !label.includes(FILTER)) continue;
  if (EXCLUDE.some((x) => label.includes(x))) continue;
  let src = readFileSync(file, "utf8");
  if (!/\b(?:FROM|JOIN)\b/.test(src)) continue;

  let fileChanged = false;
  // Rebuild the source block by block so offsets stay consistent as we insert lines.
  let out = "";
  let last = 0;
  SQL_BLOCK.lastIndex = 0;
  let m;
  while ((m = SQL_BLOCK.exec(src)) !== null) {
    const raw = m[1];
    const masked = maskSqlComments(raw);
    const entity = inferEntityExpr(masked);
    const lines = raw.split("\n");
    const maskedLines = masked.split("\n");
    let blockChanged = false;

    for (let i = lines.length - 1; i >= 0; i--) {
      const jm = maskedLines[i].match(JOIN_LINE);
      if (!jm) continue;
      const [, indent, , tableRaw, alias] = jm;
      const table = tableRaw.toLowerCase();
      if (!TARGETS.has(table)) continue;
      if (isScoped(masked, alias, TARGETS.get(table))) continue;
      if (changed.length >= LIMIT) break;
      if (!entity) {
        skipped.push(`${label}: ${table} ${alias} — no entity expression derivable from the block`);
        continue;
      }
      const pad = indent + " ".repeat(Math.max(2, jm[2].indexOf(" ON ") + 1));
      lines.splice(i + 1, 0, `${pad}${predicateFor(table, alias, entity)}`);
      changed.push(`${label}: ${table} ${alias} -> ${entity}`);
      blockChanged = true;
    }

    // ---- bare FROM reads. Run after the JOIN pass, on the (possibly extended) line array, and only
    // when the WHERE is unambiguous — see whereSpan(). At most ONE per block: the predicate is spliced
    // into the single WHERE by character offset, so a second edit would invalidate the first's offsets.
    {
      const joined = lines.join("\n");
      const maskedJoined = maskSqlComments(joined);
      for (let i = 0; i < lines.length; i++) {
        const fm = maskSqlComments(lines[i]).match(FROM_LINE);
        if (!fm) continue;
        const table = fm[2].toLowerCase();
        const rawAlias = fm[3];
        const alias = rawAlias && !NOT_AN_ALIAS.has(rawAlias.toLowerCase()) ? rawAlias : null;
        if (!TARGETS.has(table)) continue;
        if (isScoped(maskedJoined, alias, TARGETS.get(table))) continue;
        if (changed.length >= LIMIT) break;
        if (!entity) {
          skipped.push(`${label}: ${table} ${alias ?? "(no alias)"} FROM — no entity expression derivable`);
          continue;
        }
        // A bare FROM may ONLY be scoped from an independent BIND. Rule (b) — reusing an alias that is
        // itself entity-compared — is sound for a JOIN's ON clause but UNSOUND here, proven on a real
        // site: in load-profitability.service.ts the codemod produced
        //     WHERE l.operating_company_id = c.operating_company_id
        // where `c` is a LEFT JOIN alias that the SAME pass had just scoped TO `l`. Two failures at
        // once — it is circular (it compares l to something defined as l), and on a LEFT JOIN a WHERE
        // over the nullable side turns it into an inner join and SILENTLY DROPS rows with no customer.
        // The underlying query had no caller entity bind at all, which is the defect a human must fix.
        if (!/^\$\d+/.test(entity)) {
          skipped.push(`${label}: ${table} ${alias ?? "(no alias)"} FROM — no independent bind; needs a caller entity parameter (human)`);
          continue;
        }
        const span = whereSpan(maskedJoined);
        if (!span) {
          skipped.push(`${label}: ${table} ${alias ?? "(no alias)"} FROM — WHERE absent / multiple / top-level OR`);
          continue;
        }
        const q = alias ? `${alias}.` : "";
        const pred = TARGETS.get(table) === LEASE_PAIR
          ? `COALESCE(${q}currently_leased_to_company_id, ${q}owner_company_id) = ${entity}`
          : `${q}operating_company_id = ${entity}`;
        const patched = joined.slice(0, span.start) + ` ${pred} AND` + joined.slice(span.start);
        lines.length = 0;
        lines.push(...patched.split("\n"));
        changed.push(`${label}: ${table} ${alias ?? "(no alias)"} FROM -> ${entity}`);
        blockChanged = true;
        break;
      }
    }

    out += src.slice(last, m.index) + "`" + lines.join("\n") + "`";
    last = m.index + m[0].length;
    if (blockChanged) fileChanged = true;
  }
  out += src.slice(last);

  if (fileChanged) {
    files++;
    if (APPLY) writeFileSync(file, out);
  }
}

console.log(`${APPLY ? "APPLIED" : "DRY RUN"} — ${changed.length} site(s) across ${files} file(s) scoped`);
for (const c of changed.slice(0, 40)) console.log(`  + ${c}`);
if (changed.length > 40) console.log(`  … ${changed.length - 40} more`);
if (skipped.length) {
  console.log(`\nSKIPPED (entity not derivable — needs a human, never guessed): ${skipped.length}`);
  for (const s of skipped.slice(0, 30)) console.log(`  ? ${s}`);
  if (skipped.length > 30) console.log(`  … ${skipped.length - 30} more`);
}
