#!/usr/bin/env node
/**
 * Conservative FK reference-before-introduction check:
 * For REFERENCES schema.table(column), ensure some introducing DDL for that column
 * appears earlier in the migration chain (same file: earlier byte offset).
 *
 * Intentionally misses: dynamic EXECUTE, procedural SQL, views — fewer false positives.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

function migSortKey(filename) {
  const m = /^(\d+)/.exec(filename);
  const n = m ? parseInt(m[1], 10) : 999999;
  return [n, filename];
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
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

  const alterRe =
    /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*)/gi;
  while ((m = alterRe.exec(s))) {
    const fq = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    out.push({ fq, col, migNum, pos: m.index, source: `${filename}:ALTER`, kind: "alter" });
  }

  return out;
}

function stripDollarQuotedBlocks(sql) {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, " ");
}

function collectRefs(sql, migNum, filename) {
  const out = [];
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
  masked = pieces.join(" ");
  masked = stripDollarQuotedBlocks(masked);

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

  for (const file of files) {
    const migNum = migSortKey(file)[0];
    const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
    intros.push(...collectIntros(sql, migNum, file));
    refs.push(...collectRefs(sql, migNum, file));
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

  const forward = [];
  const seenPair = new Set();
  for (const r of refs) {
    const k = `${r.fq}.${r.col}`;
    const intro = firstIntro.get(k);
    if (!intro) continue;
    if (intro.migNum > r.migNum) {
      const dedupe = `${k}|${r.file}|${r.migNum}`;
      if (seenPair.has(dedupe)) continue;
      seenPair.add(dedupe);
      forward.push({
        refFile: r.file,
        refMig: r.migNum,
        fq: r.fq,
        col: r.col,
        introducedInMig: intro.migNum,
        introducedSource: intro.source,
      });
    }
  }

  if (forward.length > 0) {
    console.error(
      "\ndb:verify:reference-order — forward FK references (column introduced after use):\n",
    );
    for (const row of forward) {
      console.error(
        `  migration ${String(row.refMig).padStart(4, "0")} (${row.refFile}) REFERENCES ${row.fq}(${row.col}) — column first introduced in migration ${row.introducedInMig} (${row.introducedSource})`,
      );
    }
    console.error(`\nTotal: ${forward.length}\n`);
    process.exit(1);
  }

  console.log("db:verify:reference-order — OK (no conservative forward REFERENCES findings)");
}

main();
