#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const M_DATA_DIR = path.join(ROOT, "apps", "backend", "src", "mdata");
const TARGET_TABLES = new Set([
  "mdata.units",
  "mdata.equipment",
  "mdata.drivers",
  "mdata.customers",
  "mdata.vendors",
]);

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

function splitTopLevelList(input) {
  const out = [];
  let buf = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const prev = i > 0 ? input[i - 1] : "";
    if (ch === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
        continue;
      }
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
  if (!filePath.endsWith(".routes.ts")) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const findings = [];
  const re = /INSERT\s+INTO\s+(mdata\.[a-z_]+)\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/gi;
  let match;
  while ((match = re.exec(text))) {
    const [, tableName, rawColumns, rawValues] = match;
    if (!TARGET_TABLES.has(tableName.toLowerCase())) continue;
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
  const files = walk(M_DATA_DIR);
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
