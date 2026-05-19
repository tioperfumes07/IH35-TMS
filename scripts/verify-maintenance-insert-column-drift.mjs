#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const TARGET_FILE_RE = /(routes|service)\.ts$/;

const LEGACY_COLUMNS = {
  "maintenance.work_orders": new Set(["assigned_vendor", "vendor_invoice_number", "total_estimated_cost", "severity"]),
  "maintenance.work_order_lines": new Set(["work_order_id", "amount"]),
};

const REQUIRED_COLUMNS = {
  "maintenance.work_orders": new Set(["source_type", "unit_sequence"]),
  "maintenance.work_order_lines": new Set(["work_order_uuid"]),
};

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

function skipWhitespace(input, start) {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  return i;
}

function parseDollarTag(input, i) {
  if (input[i] !== "$") return null;
  const rest = input.slice(i);
  const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/) ?? rest.match(/^\$\$/);
  return match ? match[0] : null;
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
      if (depth === 0) return { content: input.slice(start + 1, i), end: i + 1 };
    }
    i += 1;
  }
  return null;
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
    else if (ch === ")") depth -= 1;
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

function parseColumns(rawColumns) {
  return splitTopLevelList(rawColumns)
    .map((item) => item.replace(/^"/, "").replace(/"$/, "").trim().toLowerCase())
    .filter(Boolean);
}

function extractMaintenanceInserts(text) {
  const inserts = [];
  const re = /INSERT\s+INTO\s+(maintenance\.(?:work_orders|work_order_lines))/gi;
  let match;
  while ((match = re.exec(text))) {
    const tableName = match[1].toLowerCase();
    let cursor = skipWhitespace(text, re.lastIndex);
    const colsGroup = readParenGroup(text, cursor);
    if (!colsGroup) continue;
    cursor = skipWhitespace(text, colsGroup.end);
    if (!/^VALUES\b/i.test(text.slice(cursor, cursor + 16))) continue;
    inserts.push({ tableName, rawColumns: colsGroup.content });
  }
  return inserts;
}

function analyzeFile(filePath) {
  if (!TARGET_FILE_RE.test(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const findings = [];
  const inserts = extractMaintenanceInserts(text);
  for (const insert of inserts) {
    if (insert.rawColumns.includes("${")) continue;
    const columns = parseColumns(insert.rawColumns);
    const legacySet = LEGACY_COLUMNS[insert.tableName];
    const requiredSet = REQUIRED_COLUMNS[insert.tableName];
    if (!legacySet || !requiredSet) continue;

    const legacyColumns = columns.filter((column) => legacySet.has(column));
    const missingRequired = [...requiredSet].filter((column) => !columns.includes(column));
    if (legacyColumns.length > 0 || missingRequired.length > 0) {
      findings.push({ filePath, tableName: insert.tableName, legacyColumns, missingRequired });
    }
  }
  return findings;
}

function main() {
  const files = walk(BACKEND_SRC);
  const findings = files.flatMap(analyzeFile);
  if (findings.length === 0) {
    console.log("verify:maintenance-insert-column-drift — OK");
    return;
  }
  console.error("verify:maintenance-insert-column-drift — FAILED");
  for (const finding of findings) {
    const rel = path.relative(ROOT, finding.filePath).split(path.sep).join("/");
    console.error(`- ${rel} :: ${finding.tableName}`);
    if (finding.legacyColumns.length > 0) {
      console.error(`  legacy columns present: ${finding.legacyColumns.join(", ")}`);
    }
    if (finding.missingRequired.length > 0) {
      console.error(`  required columns missing: ${finding.missingRequired.join(", ")}`);
    }
  }
  process.exit(1);
}

main();
