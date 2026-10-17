#!/usr/bin/env node
/**
 * Migration reference / column-use ordering checks (conservative).
 *
 * Blocking:
 * - REFERENCES schema.table(col) outside CREATE TABLE bodies and outside dollar-quoted blocks.
 * - CREATE INDEX … ON schema.table(cols): column first introduced in a LATER migration (forward-dep).
 * - CREATE INDEX … ON schema.table(cols): leading identifier never appears in any migration registry
 *   (CREATE TABLE / ALTER ADD COLUMN) — wrong column name / phantom column (INDEX_COLUMN_PHANTOM).
 *   Leading tokens matching common SQL functions (lower, coalesce, …) stay informational only.
 * - Bare `ALTER TABLE schema.table` outside DO $$ … END $$ runs before the first CREATE TABLE for that
 *   fq table (ALTER_BEFORE_CREATE). ALTER inside DO blocks is ignored — typical guarded no-op pattern.
 *
 * Informational (stderr; exit 0 unless blocking fired):
 * - REFERENCES inside DO $$ … END $$ bodies (often guarded at runtime).
 * - INDEX registry misses where the leading token looks like an expression function.
 * - CREATE INDEX column lists inside DO $$ bodies.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

/** Leading identifier in an index column slice — likely an expression, not a bare column (informational only). */
const INDEX_EXPR_PREFIXES = new Set([
  "lower",
  "upper",
  "coalesce",
  "greatest",
  "least",
  "abs",
  "trim",
  "regexp_replace",
  "concat",
  "concat_ws",
  "date_trunc",
  "extract",
  "date_part",
  "round",
  "floor",
  "ceil",
  "substring",
  "substr",
  "replace",
  "split_part",
  "left",
  "right",
  "length",
  "encode",
  "decode",
  "md5",
  "digest",
  "bool_and",
  "bool_or",
  "nullif",
  "cast",
  "timezone",
  "to_char",
  "to_timestamp",
]);

function migSortKey(filename) {
  const m = /^(\d+)/.exec(filename);
  const n = m ? parseInt(m[1], 10) : 999999;
  return [n, filename];
}

// ROUND 443.187 parser-accuracy repairs (same rules, fewer false findings). This guard was never run
// in CI; run once on 2026-10-16 it reported 28 INDEX_COLUMN_PHANTOM rows, and every column it named
// EXISTS on prod (information_schema, read-only, 2026-10-16) except the ones on
// telematics.odometer_readings, a table no migration creates (scripts/db-migrate.mjs documents the
// same drift: "telematics.odometer_readings exists in production but NO migration creates it").
// The other rows were the scanner misreading DDL the corpus really uses:
//   (1) a `--` INSIDE a string literal (COALESCE(faro_entry_id, '--'), 202615250600) was taken as a
//       comment and ate the rest of the line -> stripComments is now string-literal aware;
//   (2) several columns on ONE line (202615220900 preserve.*) registered only the first ->
//       CREATE TABLE bodies split on top-level commas, not newlines;
//   (3) tables created / extended in a DO-block format() loop over ARRAY['a','b'] (0062, 0152,
//       202607490000) were invisible -> registered from the loop's ARRAY list;
//   (4) materialized-view output columns (0311, 202613310000 reports.lane_metrics_monthly) were never
//       registered -> registered from the view's top-level SELECT list;
//   (5) a schema-qualified function call in an index expression
//       (telematics.odometer_reading_day(read_at), 202614950000) was read as a column named
//       "telematics" -> any `ident(` / `schema.ident(` is an expression (informational, like lower()).
// No check is removed; a phantom / forward / ALTER-before-CREATE finding still blocks.
function stripComments(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      out += " ";
    } else if (c === "/" && sql[i + 1] === "*") {
      const e = sql.indexOf("*/", i + 2);
      i = e === -1 ? n : e + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Split on top-level commas (outside parens and single-quoted strings). */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (c === "'" && body[i + 1] === "'") { i++; continue; }
      if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/** Column name defined by one CREATE TABLE body element, or null for a table constraint. */
function columnOfElement(el) {
  const t = el.trim();
  if (!t || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)\b/i.test(t)) return null;
  const cm = /^([a-z_][a-z0-9_]*)\s+/i.exec(t);
  return cm ? cm[1].toLowerCase() : null;
}

function extractParenBody(s, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return { body: s.slice(openIdx + 1, i - 1), closeIdx: i - 1 };
}

/** Remove CREATE TABLE (…) bodies so inner REFERENCES don't pollute outer DDL scans. */
function maskCreateTableBodies(sql) {
  let masked = stripComments(sql);
  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\s*\(/gi;
  let cm;
  const pieces = [];
  let last = 0;
  while ((cm = createRe.exec(masked))) {
    pieces.push(masked.slice(last, cm.index));
    const openParenIdx = createRe.lastIndex - 1;
    const { closeIdx } = extractParenBody(masked, openParenIdx);
    last = closeIdx + 1;
    createRe.lastIndex = last;
  }
  pieces.push(masked.slice(last));
  return pieces.join(" ");
}

function stripAllDollarQuoted(sql) {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, " ");
}

function stripDoBlocks(sql) {
  const lower = sql.toLowerCase();
  let out = "";
  let pos = 0;
  while (true) {
    const i = lower.indexOf("do $$", pos);
    if (i === -1) {
      out += sql.slice(pos);
      break;
    }
    out += sql.slice(pos, i);
    const bodyStart = i + "do $$".length;
    const slice = sql.slice(bodyStart);
    const em = /\r?\n\s*end\s*\$\$/i.exec(slice);
    if (!em) {
      out += sql.slice(i);
      break;
    }
    pos = bodyStart + em.index + em[0].length;
  }
  return out;
}

/** ALTER TABLE fq … outside DO $$ … END $$ bodies (guarded ALTERs usually live inside DO). */
function collectBareAlterTableTargets(sql, migNum, filename, sink) {
  const s = stripComments(stripDoBlocks(sql));
  const re = /\bALTER\s+TABLE\s+(?:ONLY\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(s))) {
    sink.push({ fq: m[1].toLowerCase(), migNum, file: filename });
  }
}

/** LEAD 443.187 — the fresh-DB bootstrap CREATE TABLE in scripts/db-migrate.mjs (see its use in main()). */
function collectFreshDbBootstrapIntros() {
  const file = path.join(path.dirname(MIG_DIR), "..", "scripts", "db-migrate.mjs");
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  const needed = /const FRESH_DB_ODOMETER_LEDGER_NEEDED_BY = "([^"]+)"/.exec(src)?.[1];
  if (!needed || !/async function ensureFreshDbOdometerLedger\(/.test(src)) return [];
  const migNum = migSortKey(needed)[0];
  return collectIntros(src.match(/CREATE TABLE telematics\.odometer_readings \([\s\S]*?\n\s*\);/)?.[0] ?? "", migNum, "scripts/db-migrate.mjs#ensureFreshDbOdometerLedger").map((i) => ({ ...i, pos: -1 }));
}

/** Column intros: CREATE TABLE + ALTER ADD COLUMN */
function collectIntros(sql, migNum, filename) {
  const out = [];
  const s = stripComments(sql);
  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = createRe.exec(s))) {
    const fq = m[1].toLowerCase();
    const openParenIdx = createRe.lastIndex - 1;
    const { body, closeIdx } = extractParenBody(s, openParenIdx);
    const pos = m.index;
    for (const el of splitTopLevel(body)) {
      const col = columnOfElement(el);
      if (!col) continue;
      out.push({ fq, col, migNum, pos, source: `${filename}:CREATE`, kind: "create" });
    }
    createRe.lastIndex = closeIdx + 1;
  }

  collectAlterTableAddColumns(s, migNum, filename, out);
  collectDynamicLoopIntros(sql, migNum, filename, out);
  collectViewColumns(s, migNum, filename, out);

  return out;
}

/**
 * (3) DO-block loops: FOREACH t IN ARRAY ARRAY['a', 'schema.b'] … EXECUTE format('CREATE TABLE IF NOT
 * EXISTS schema.%I ( … )' / 'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS col …'). Registers the columns
 * for every table named in that DO body's ARRAY[...] literal lists.
 */
function collectDynamicLoopIntros(sql, migNum, filename, sink) {
  // Any dollar tag (DO $$ … $$, DO $seed$ … $seed$ — 202607490000 uses the latter).
  const bodies = [...sql.matchAll(/\bDO\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1/gi)].map((d) => d[2]);
  for (const raw of bodies) {
    const b = stripComments(raw);
    if (!/%I/.test(b)) continue;
    const names = [];
    const arrRe = /\bARRAY\s*\[([^\]]*)\]/gi;
    let am;
    while ((am = arrRe.exec(b))) {
      for (const lit of am[1].matchAll(/'([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)'/gi)) names.push(lit[1].toLowerCase());
    }
    if (!names.length) continue;
    const fqFor = (schema, name) => (name.includes(".") ? name : schema ? `${schema}.${name}` : null);
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:([a-z_][a-z0-9_]*)|%I)\.%I\s*\(/gi;
    let m;
    while ((m = createRe.exec(b))) {
      const schema = m[1] ? m[1].toLowerCase() : null;
      const { body, closeIdx } = extractParenBody(b, createRe.lastIndex - 1);
      for (const name of names) {
        const fq = fqFor(schema, name);
        if (!fq) continue;
        for (const el of splitTopLevel(body)) {
          const col = columnOfElement(el);
          if (col) sink.push({ fq, col, migNum, pos: m.index, source: `${filename}:CREATE(loop)`, kind: "create" });
        }
      }
      createRe.lastIndex = closeIdx + 1;
    }
    const alterRe = /ALTER\s+TABLE\s+(?:([a-z_][a-z0-9_]*)|%I)\.%I\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*)/gi;
    while ((m = alterRe.exec(b))) {
      const schema = m[1] ? m[1].toLowerCase() : null;
      for (const name of names) {
        const fq = fqFor(schema, name);
        if (fq) sink.push({ fq, col: m[2].toLowerCase(), migNum, pos: m.index, source: `${filename}:ALTER(loop)`, kind: "alter" });
      }
    }
  }
}

/** (4) CREATE [MATERIALIZED] VIEW fq [(cols)] AS … — output columns of the top-level SELECT list. */
function collectViewColumns(s, migNum, filename, sink) {
  const viewRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*(\([^)]*\))?\s*AS\b/gi;
  let m;
  while ((m = viewRe.exec(s))) {
    const fq = m[1].toLowerCase();
    const push = (col) => sink.push({ fq, col, migNum, pos: m.index, source: `${filename}:VIEW`, kind: "view" });
    if (m[2]) {
      for (const c of m[2].slice(1, -1).split(",")) {
        const id = /^\s*([a-z_][a-z0-9_]*)\s*$/i.exec(c);
        if (id) push(id[1].toLowerCase());
      }
      continue;
    }
    // Scan to the statement end at depth 0; take the select list of the first depth-0 SELECT.
    let depth = 0;
    let inStr = false;
    let selStart = -1;
    let selEnd = -1;
    for (let i = viewRe.lastIndex; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === "'" && s[i + 1] === "'") { i++; continue; }
        if (c === "'") inStr = false;
        continue;
      }
      if (c === "'") { inStr = true; continue; }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) break;
      else if (depth === 0 && /[a-z]/i.test(c) && !/[a-z0-9_]/i.test(s[i - 1] ?? " ")) {
        const word = /^[a-z_]+/i.exec(s.slice(i, i + 12))[0].toLowerCase();
        if (word === "select" && selStart === -1) selStart = i + word.length;
        else if (word === "from" && selStart !== -1) { selEnd = i; break; }
        i += word.length - 1;
      }
    }
    if (selStart === -1 || selEnd === -1) continue;
    let list = s.slice(selStart, selEnd).replace(/^\s*DISTINCT(?:\s+ON\s*)?/i, "");
    if (/^\s*\(/.test(list)) list = list.slice(extractParenBody(list, list.indexOf("(")).closeIdx + 1);
    for (const item of splitTopLevel(list)) {
      const t = item.trim();
      const alias = /\bAS\s+"?([a-z_][a-z0-9_]*)"?\s*$/i.exec(t) ?? /(?:^|\.)([a-z_][a-z0-9_]*)\s*$/i.exec(t);
      if (alias) push(alias[1].toLowerCase());
    }
  }
}

/** Every `ADD COLUMN [IF NOT EXISTS] name` within each `ALTER TABLE schema.table … ;` statement. */
function collectAlterTableAddColumns(s, migNum, filename, sink) {
  const alterHead =
    /\bALTER\s+TABLE\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+/gi;
  let m;
  while ((m = alterHead.exec(s))) {
    const fq = m[1].toLowerCase();
    const stmtStart = alterHead.lastIndex;
    let depth = 0;
    let i = stmtStart;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) break;
    }
    const stmt = s.slice(stmtStart, i);
    const addRe =
      /\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*)/gi;
    let am;
    while ((am = addRe.exec(stmt))) {
      const col = am[1].toLowerCase();
      sink.push({
        fq,
        col,
        migNum,
        pos: m.index,
        source: `${filename}:ALTER`,
        kind: "alter",
      });
    }
    alterHead.lastIndex = i + 1;
  }
}

function collectRefs(sql, migNum, filename) {
  const out = [];
  let masked = maskCreateTableBodies(sql);
  masked = stripAllDollarQuoted(masked);

  const refRe =
    /REFERENCES\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(\s*([a-z_][a-z0-9_]*)\s*\)/gi;
  let m;
  while ((m = refRe.exec(masked))) {
    const fq = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    out.push({ fq, col, migNum, pos: m.index, file: filename });
  }
  return out;
}

/** CREATE INDEX … ON fq(col1, col2, …) — leading identifier per comma slice only. */
function collectIndexColumnUses(sql, migNum, filename) {
  const out = [];
  let masked = maskCreateTableBodies(sql);
  masked = stripAllDollarQuoted(masked);
  const re =
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+[^\s(]+\s+ON\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = re.exec(masked))) {
    const fq = m[1].toLowerCase();
    const openParenIdx = re.lastIndex - 1;
    const { body } = extractParenBody(masked, openParenIdx);
    for (const rawPart of splitTopLevel(body)) {
      const part = rawPart.trim();
      const pm = /^([a-z_][a-z0-9_]*)\b/i.exec(part);
      if (!pm) continue;
      const col = pm[1].toLowerCase();
      // (5) `fn(` or `schema.fn(` is an expression, never a column (informational like lower()).
      const expr = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?\s*\(/i.test(part);
      out.push({ fq, col, migNum, file: filename, expr });
    }
  }
  return out;
}

function extractDoBodies(sql) {
  const bodies = [];
  const lower = sql.toLowerCase();
  let pos = 0;
  while (true) {
    const i = lower.indexOf("do $$", pos);
    if (i === -1) break;
    const bodyStart = i + "do $$".length;
    const slice = sql.slice(bodyStart);
    const em = /\r?\n\s*end\s*\$\$/i.exec(slice);
    if (!em) break;
    bodies.push(slice.slice(0, em.index));
    pos = bodyStart + em.index + em[0].length;
  }
  return bodies;
}

function collectRefsInsideDoInformational(sql, migNum, filename, sink) {
  for (const body of extractDoBodies(sql)) {
    const b = stripComments(body);
    const refRe =
      /REFERENCES\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(\s*([a-z_][a-z0-9_]*)\s*\)/gi;
    let m;
    while ((m = refRe.exec(b))) {
      sink.push({
        fq: m[1].toLowerCase(),
        col: m[2].toLowerCase(),
        migNum,
        file: filename,
      });
    }
  }
}

/** CREATE INDEX inside DO $$ … END $$ (informational). */
function collectIndexColumnUsesInsideDo(sql, migNum, filename, sink) {
  for (const body of extractDoBodies(sql)) {
    const b = stripComments(body);
    for (const u of collectIndexColumnUses(b, migNum, filename)) {
      sink.push({ ...u, file: filename });
    }
  }
}

function main() {
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      const ka = migSortKey(a);
      const kb = migSortKey(b);
      return ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : 1);
    });

  const intros = [];
  const refs = [];
  const idxUses = [];
  const infoDoRefs = [];
  const infoDoIndexes = [];
  const bareAlters = [];

  for (const file of files) {
    const migNum = migSortKey(file)[0];
    const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
    intros.push(...collectIntros(sql, migNum, file));
    refs.push(...collectRefs(sql, migNum, file));
    idxUses.push(...collectIndexColumnUses(sql, migNum, file));
    collectRefsInsideDoInformational(sql, migNum, file, infoDoRefs);
    collectIndexColumnUsesInsideDo(sql, migNum, file, infoDoIndexes);
    collectBareAlterTableTargets(sql, migNum, file, bareAlters);
  }

  // LEAD 443.187 — telematics.odometer_readings was made live in production; NO migration creates it, and
  // 202614950000 (which ALTERs / indexes it) is applied in production so it cannot be edited and a migration cannot be
  // inserted before it. scripts/db-migrate.mjs ensureFreshDbOdometerLedger (CC-1, 2026-10-01) creates the table on every
  // database built from source, immediately BEFORE 202614950000. That bootstrap IS the table's introduction for this
  // check: its own CREATE TABLE body is read here (pos -1 at that migration), so a column it does not create still fails.
  for (const intro of collectFreshDbBootstrapIntros()) intros.push(intro);

  const tableCreateMig = new Map();
  for (const i of intros) {
    if (i.kind !== "create") continue;
    const prev = tableCreateMig.get(i.fq);
    if (prev === undefined || i.migNum < prev) tableCreateMig.set(i.fq, i.migNum);
  }

  const firstBareAlter = new Map();
  for (const a of bareAlters) {
    const prev = firstBareAlter.get(a.fq);
    if (prev === undefined || a.migNum < prev.migNum || (a.migNum === prev.migNum && a.file < prev.file)) {
      firstBareAlter.set(a.fq, { migNum: a.migNum, file: a.file });
    }
  }

  const alterBeforeCreate = [];
  for (const [fq, al] of firstBareAlter) {
    const cm = tableCreateMig.get(fq);
    if (cm === undefined) continue;
    if (al.migNum < cm) {
      alterBeforeCreate.push({
        kind: "ALTER_BEFORE_CREATE",
        fq,
        alterFile: al.file,
        alterMig: al.migNum,
        createMig: cm,
      });
    }
  }

  const firstIntro = new Map();
  for (const i of intros) {
    const k = `${i.fq}.${i.col}`;
    const prev = firstIntro.get(k);
    if (
      prev === undefined ||
      i.migNum < prev.migNum ||
      (i.migNum === prev.migNum && i.pos < prev.pos)
    ) {
      firstIntro.set(k, { migNum: i.migNum, source: i.source });
    }
  }

  const forwardRefs = [];
  const seenRef = new Set();
  for (const r of refs) {
    const k = `${r.fq}.${r.col}`;
    const intro = firstIntro.get(k);
    if (!intro) continue;
    if (intro.migNum > r.migNum) {
      const dedupe = `${k}|${r.file}|${r.migNum}`;
      if (seenRef.has(dedupe)) continue;
      seenRef.add(dedupe);
      forwardRefs.push({
        refFile: r.file,
        refMig: r.migNum,
        fq: r.fq,
        col: r.col,
        introducedInMig: intro.migNum,
        introducedSource: intro.source,
        kind: "REFERENCES",
      });
    }
  }

  const forwardIdx = [];
  const phantomIdx = [];
  const exprUnknownIdx = [];
  const seenIdx = new Set();
  for (const u of idxUses) {
    const k = `${u.fq}.${u.col}`;
    const intro = firstIntro.get(k);
    const dedupe = `${k}|${u.file}|${u.migNum}|index`;
    if (seenIdx.has(dedupe)) continue;
    seenIdx.add(dedupe);

    if (!intro) {
      if (INDEX_EXPR_PREFIXES.has(u.col) || u.expr) {
        exprUnknownIdx.push(u);
      } else {
        phantomIdx.push({
          refFile: u.file,
          refMig: u.migNum,
          fq: u.fq,
          col: u.col,
          kind: "INDEX_COLUMN_PHANTOM",
        });
      }
      continue;
    }
    if (intro.migNum > u.migNum) {
      forwardIdx.push({
        refFile: u.file,
        refMig: u.migNum,
        fq: u.fq,
        col: u.col,
        introducedInMig: intro.migNum,
        introducedSource: intro.source,
        kind: "INDEX_COLUMN_FORWARD",
      });
    }
  }

  const blocking = [...forwardRefs, ...forwardIdx, ...phantomIdx, ...alterBeforeCreate];

  if (blocking.length > 0) {
    console.error(
      "\ndb:verify:reference-order — BLOCKING (REFERENCES order / INDEX forward-deps / INDEX phantom columns / ALTER before CREATE):\n",
    );
    for (const row of blocking) {
      if (row.kind === "INDEX_COLUMN_PHANTOM") {
        console.error(
          `  [${row.kind}] migration ${String(row.refMig).padStart(4, "0")} (${row.refFile}) INDEX uses ${row.fq}.${row.col} — column never appears in any migration CREATE TABLE / ALTER ADD COLUMN registry (wrong name or missing DDL)`,
        );
      } else if (row.kind === "ALTER_BEFORE_CREATE") {
        console.error(
          `  [${row.kind}] migration ${String(row.alterMig).padStart(4, "0")} (${row.alterFile}) ALTER TABLE ${row.fq} — table CREATE first appears in migration ${row.createMig} (move CREATE earlier or remove stray ALTER)`,
        );
      } else {
        console.error(
          `  [${row.kind}] migration ${String(row.refMig).padStart(4, "0")} (${row.refFile}) uses ${row.fq}.${row.col} — column first introduced in migration ${row.introducedInMig} (${row.introducedSource})`,
        );
      }
    }
    console.error(`\nTotal blocking: ${blocking.length}\n`);
  } else {
    console.log(
      "db:verify:reference-order — OK blocking scan (REFERENCES + INDEX cols / phantom detection / ALTER-before-CREATE)",
    );
  }

  if (exprUnknownIdx.length > 0) {
    console.warn(
      "\n[informational] INDEX leading identifiers with no registry hit but likely SQL expressions (lower/coalesce/…):\n",
    );
    for (const u of exprUnknownIdx.slice(0, 40)) {
      console.warn(
        `  migration ${String(u.migNum).padStart(4, "0")} (${u.file}) INDEX … ON ${u.fq}(… ${u.col} …)`,
      );
    }
    if (exprUnknownIdx.length > 40) {
      console.warn(`  … plus ${exprUnknownIdx.length - 40} more`);
    }
    console.warn(`\nTotal informational expr-like INDEX cols: ${exprUnknownIdx.length}\n`);
  }

  if (infoDoIndexes.length > 0) {
    console.warn(
      "[informational] CREATE INDEX column lists inside DO $$ bodies (often runtime-guarded):\n",
    );
    const seenIx = new Set();
    let ixPrinted = 0;
    for (const u of infoDoIndexes) {
      const sig = `${u.file}|${u.migNum}|${u.fq}|${u.col}`;
      if (seenIx.has(sig)) continue;
      seenIx.add(sig);
      console.warn(
        `  migration ${String(u.migNum).padStart(4, "0")} (${u.file}) INDEX … ON ${u.fq}(… ${u.col} …)`,
      );
      ixPrinted++;
      if (ixPrinted >= 40) break;
    }
    if (seenIx.size > 40) {
      console.warn(`  … plus ${seenIx.size - 40} more distinct DO INDEX cols`);
    }
    console.warn(`\nTotal distinct informational DO INDEX cols: ${seenIx.size}\n`);
  }

  if (infoDoRefs.length > 0) {
    console.warn(
      "[informational] REFERENCES inside DO $$ bodies (often runtime-guarded):\n",
    );
    const seen = new Set();
    let printed = 0;
    for (const r of infoDoRefs) {
      const sig = `${r.file}|${r.migNum}|${r.fq}|${r.col}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      console.warn(
        `  migration ${String(r.migNum).padStart(4, "0")} (${r.file}) REFERENCES ${r.fq}(${r.col})`,
      );
      printed++;
      if (printed >= 60) break;
    }
    if (seen.size > 60) {
      console.warn(`  … plus ${seen.size - 60} more distinct DO REFERENCES`);
    }
    console.warn(`\nTotal distinct informational DO REFERENCES: ${seen.size}\n`);
  }

  if (blocking.length > 10) {
    console.error(
      "db:verify:reference-order — More than 10 blocking findings; triage required.",
    );
    process.exit(1);
  }

  if (blocking.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();
