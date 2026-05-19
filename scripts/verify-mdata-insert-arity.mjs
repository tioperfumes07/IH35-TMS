#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const SCAN_DIRS = ["mdata", "dispatch", "legal", "maintenance"].map((segment) => path.join(BACKEND_SRC, segment));
const TARGET_FILE_RE = /(routes|service)\.ts$/;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function skipWhitespace(input, start) {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  return i;
}

function parseDollarTag(input, i) {
  if (input[i] !== "$") return null;
  const rest = input.slice(i);
  const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/) ?? rest.match(/^\$\$/);
  if (!match) return null;
  return match[0];
}

function readParenGroup(input, start) {
  if (input[start] !== "(") return null;
  let i = start + 1;
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inDollarTag = null;

  while (i < input.length) {
    const ch = input[i];
    if (inDollarTag) {
      if (input.startsWith(inDollarTag, i)) {
        i += inDollarTag.length;
        inDollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && input[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && input[i + 1] === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    const dollarTag = parseDollarTag(input, i);
    if (dollarTag) {
      inDollarTag = dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return { content: input.slice(start + 1, i), end: i + 1 };
      }
    }
    i += 1;
  }

  return null;
}

function extractInsertValuesPairs(text) {
  const out = [];
  const re = /INSERT\s+INTO\s+([a-z_]+\.[a-z_]+)/gi;
  let match;
  while ((match = re.exec(text))) {
    const tableName = match[1];
    let cursor = skipWhitespace(text, re.lastIndex);
    const colsGroup = readParenGroup(text, cursor);
    if (!colsGroup) continue;
    cursor = skipWhitespace(text, colsGroup.end);
    if (!/^VALUES\b/i.test(text.slice(cursor, cursor + 16))) continue;
    cursor = skipWhitespace(text, cursor + 6);
    const valuesGroup = readParenGroup(text, cursor);
    if (!valuesGroup) continue;
    out.push({ tableName, rawColumns: colsGroup.content, rawValues: valuesGroup.content });
  }
  return out;
}

function splitTopLevelList(input) {
  const out = [];
  let buf = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollarTag = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inDollarTag) {
      if (input.startsWith(inDollarTag, i)) {
        buf += inDollarTag;
        i += inDollarTag.length - 1;
        inDollarTag = null;
      } else {
        buf += ch;
      }
      continue;
    }
    if (inSingle) {
      if (ch === "'" && input[i + 1] === "'") {
        buf += "''";
        i += 1;
        continue;
      }
      buf += ch;
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && input[i + 1] === '"') {
        buf += '""';
        i += 1;
        continue;
      }
      buf += ch;
      if (ch === '"') inDouble = false;
      continue;
    }

    const dollarTag = parseDollarTag(input, i);
    if (dollarTag) {
      inDollarTag = dollarTag;
      buf += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      buf += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseColumns(list) {
  return splitTopLevelList(stripComments(list))
    .map((item) => item.replace(/^"/, "").replace(/"$/, "").trim())
    .filter(Boolean);
}

function parseValues(list) {
  return splitTopLevelList(stripComments(list)).filter(Boolean);
}

function analyzeFile(filePath) {
  if (!TARGET_FILE_RE.test(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const findings = [];
  const inserts = extractInsertValuesPairs(text);
  for (const { tableName, rawColumns, rawValues } of inserts) {
    if (rawColumns.includes("${") || rawValues.includes("${")) continue;
    const columns = parseColumns(rawColumns);
    const values = parseValues(rawValues);
    if (columns.length !== values.length) {
      findings.push({
        filePath,
        tableName,
        columns: columns.length,
        values: values.length,
        columnsList: columns,
        valuesList: values,
      });
    }
  }
  return findings;
}

function main() {
  const files = SCAN_DIRS.flatMap((dir) => walk(dir));
  const findings = files.flatMap(analyzeFile);
  if (findings.length === 0) {
    console.log("verify:mdata-insert-arity — OK");
    return;
  }

  console.error("verify:mdata-insert-arity — FAILED");
  for (const finding of findings) {
    const rel = path.relative(ROOT, finding.filePath).split(path.sep).join("/");
    console.error(`- ${rel} :: ${finding.tableName}`);
    console.error(`  columns=${finding.columns}, values=${finding.values}`);
  }
  process.exit(1);
}

main();
