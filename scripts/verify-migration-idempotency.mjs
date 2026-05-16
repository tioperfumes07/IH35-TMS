#!/usr/bin/env node
/**
 * Informational: surface common non-idempotent DDL patterns outside DO $$ … END $$; blocks.
 * Uses blank-preserving comment/DO stripping so match indices map to real file line numbers.
 *
 * Omitted intentionally (noise or no PG support): ADD CONSTRAINT (no IF NOT EXISTS),
 * CREATE FUNCTION without OR REPLACE (very common and usually intentional).
 *
 * Exit 0 always.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

function blankLen(match) {
  return " ".repeat(match.length);
}

function blankBlockComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, blankLen);
}

function blankLineComments(sql) {
  return sql.replace(/--[^\n\r]*/g, blankLen);
}

/** Blank DO $$ … END $$; so outer DDL remains index-aligned with original file. */
function blankDoDollarBlocks(sql) {
  return sql.replace(/\bDO\s+\$\$[\s\S]*?\r?\n\s*END\s*\$\$\s*;/gi, blankLen);
}

function lineNumberAt(sql, index) {
  return sql.slice(0, index).split(/\r?\n/).length;
}

function pushFinding(findings, file, sqlRaw, idx, type, previewLen = 140) {
  const ln = lineNumberAt(sqlRaw, idx);
  const lineStart = sqlRaw.lastIndexOf("\n", idx) + 1;
  const lineEnd = sqlRaw.indexOf("\n", idx);
  const snippet = (
    lineEnd === -1 ? sqlRaw.slice(lineStart) : sqlRaw.slice(lineStart, lineEnd)
  )
    .trim()
    .slice(0, previewLen);
  findings.push({ file, line: ln, type, preview: snippet });
}

function scanFile(file, sqlRaw, findings) {
  let scan = blankDoDollarBlocks(blankLineComments(blankBlockComments(sqlRaw)));

  const scans = [
    {
      type: "ADD COLUMN",
      re: /\bADD\s+COLUMN(?!\s+IF\s+NOT\s+EXISTS)/gi,
    },
    {
      type: "CREATE INDEX",
      re: /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?!\s+IF\s+NOT\s+EXISTS)/gi,
    },
    {
      type: "CREATE TABLE",
      re: /\bCREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)/gi,
    },
    {
      type: "CREATE SCHEMA",
      re: /\bCREATE\s+SCHEMA(?!\s+IF\s+NOT\s+EXISTS)/gi,
    },
    {
      type: "CREATE TYPE",
      re: /\bCREATE\s+TYPE(?!\s+IF\s+NOT\s+EXISTS)/gi,
    },
  ];

  for (const { type, re } of scans) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(scan))) {
      pushFinding(findings, file, sqlRaw, m.index, type);
    }
  }

  const policyRe = /\bCREATE\s+POLICY\b/gi;
  let pm;
  while ((pm = policyRe.exec(scan))) {
    const prev = scan.slice(Math.max(0, pm.index - 500), pm.index);
    if (/DROP\s+POLICY\s+IF\s+EXISTS/i.test(prev)) continue;
    pushFinding(findings, file, sqlRaw, pm.index, "CREATE POLICY");
  }
}

function main() {
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const findings = [];
  for (const file of files) {
    const p = path.join(MIG_DIR, file);
    const sqlRaw = fs.readFileSync(p, "utf8");
    scanFile(file, sqlRaw, findings);
  }

  findings.sort((a, b) =>
    a.file !== b.file ? a.file.localeCompare(b.file) : a.line - b.line,
  );

  if (findings.length === 0) {
    console.log(
      "db:verify:idempotency — OK (no heuristic matches outside stripped DO $$ blocks)",
    );
    process.exit(0);
    return;
  }

  console.warn("\ndb:verify:idempotency — INFORMATIONAL (manual review):\n");
  for (const f of findings) {
    console.warn(`  ${f.file}:${f.line}  [${f.type}]`);
    console.warn(`    ${f.preview}`);
  }
  console.warn(`\nTotal findings: ${findings.length} (exit 0 — not blocking CI)\n`);
  process.exit(0);
}

main();
