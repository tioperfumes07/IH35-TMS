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

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ");
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
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || /^CONSTRAINT\b/i.test(t) || /^PRIMARY\b/i.test(t) || /^UNIQUE\b/i.test(t))
        continue;
      if (/^CHECK\b/i.test(t) || /^FOREIGN\b/i.test(t) || /^EXCLUDE\b/i.test(t)) continue;
      const cm = /^([a-z_][a-z0-9_]*)\s+/i.exec(t);
      if (!cm) continue;
      const col = cm[1].toLowerCase();
      out.push({ fq, col, migNum, pos, source: `${filename}:CREATE`, kind: "create" });
    }
    createRe.lastIndex = closeIdx + 1;
  }

  collectAlterTableAddColumns(s, migNum, filename, out);

  return out;
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
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      const pm = /^([a-z_][a-z0-9_]*)\b/i.exec(part);
      if (!pm) continue;
      const col = pm[1].toLowerCase();
      out.push({ fq, col, migNum, file: filename });
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

  for (const file of files) {
    const migNum = migSortKey(file)[0];
    const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
    intros.push(...collectIntros(sql, migNum, file));
    refs.push(...collectRefs(sql, migNum, file));
    idxUses.push(...collectIndexColumnUses(sql, migNum, file));
    collectRefsInsideDoInformational(sql, migNum, file, infoDoRefs);
    collectIndexColumnUsesInsideDo(sql, migNum, file, infoDoIndexes);
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
      if (INDEX_EXPR_PREFIXES.has(u.col)) {
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

  const blocking = [...forwardRefs, ...forwardIdx, ...phantomIdx];

  if (blocking.length > 0) {
    console.error(
      "\ndb:verify:reference-order — BLOCKING (REFERENCES order / INDEX forward-deps / INDEX phantom columns):\n",
    );
    for (const row of blocking) {
      if (row.kind === "INDEX_COLUMN_PHANTOM") {
        console.error(
          `  [${row.kind}] migration ${String(row.refMig).padStart(4, "0")} (${row.refFile}) INDEX uses ${row.fq}.${row.col} — column never appears in any migration CREATE TABLE / ALTER ADD COLUMN registry (wrong name or missing DDL)`,
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
      "db:verify:reference-order — OK blocking scan (REFERENCES + INDEX cols / phantom detection)",
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
