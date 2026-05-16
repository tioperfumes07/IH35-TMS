#!/usr/bin/env node
/**
 * WARNING-only: scan Vitest integration/e2e files for INSERT INTO ... (...) lists that omit
 * tenant-scoped NOT NULL columns we have repeatedly missed (see migration 0015_company_scoping.sql).
 *
 * Heuristic — does not understand dynamic SQL or string concatenation.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function stripSqlishComments(fragment) {
  return fragment.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function parseInsertColumns(parenBody) {
  const cleaned = stripSqlishComments(parenBody);
  return cleaned
    .split(",")
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return null;
      const token = t.split(/\s+/)[0];
      return token.replace(/^"/, "").replace(/"$/, "").toLowerCase();
    })
    .filter(Boolean);
}

function walkTestTs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTestTs(p, acc);
    else if (ent.name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

const RULES = [
  {
    table: "mdata.customers",
    required: ["operating_company_id"],
    hint: "mdata.customers.operating_company_id is NOT NULL (0015_company_scoping). Include it in test INSERTs.",
  },
  {
    table: "mdata.units",
    required: ["owner_company_id"],
    hint: "mdata.units.owner_company_id is NOT NULL (0015_company_scoping). Include it or use org.companies TRK id subquery in test INSERTs.",
  },
];

const INSERT_RE = /INSERT\s+INTO\s+(mdata\.(?:customers|units))\s*\(([\s\S]*?)\)\s*VALUES/gi;

function main() {
  const bases = [
    path.join(ROOT, "apps", "backend"),
    path.join(ROOT, "tests", "integration"),
  ];

  /** @type {Array<{ file: string; table: string; hint: string }>} */
  const findings = [];

  for (const base of bases) {
    for (const fp of walkTestTs(base)) {
      const text = fs.readFileSync(fp, "utf8");
      let m;
      INSERT_RE.lastIndex = 0;
      while ((m = INSERT_RE.exec(text))) {
        const fqTable = m[1].toLowerCase();
        const cols = parseInsertColumns(m[2]);
        const rule = RULES.find((r) => r.table === fqTable);
        if (!rule) continue;
        const missing = rule.required.filter((c) => !cols.includes(c));
        if (missing.length === 0) continue;
        findings.push({
          file: path.relative(ROOT, fp).split(path.sep).join("/"),
          table: fqTable,
          hint: `${rule.hint} Missing: ${missing.join(", ")}.`,
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log("verify:test-insert-columns — OK (no flagged INSERT column omissions in *.test.ts)");
    process.exit(0);
    return;
  }

  console.warn("\nverify:test-insert-columns — WARNING (possible incomplete test INSERT rows):\n");
  for (const f of findings.sort((a, b) => (a.file === b.file ? a.table.localeCompare(b.table) : a.file.localeCompare(b.file)))) {
    console.warn(`  ${f.table}`);
    console.warn(`    ← ${f.file}`);
    console.warn(`    ${f.hint}`);
  }
  console.warn(`\nTotal findings: ${findings.length} (informational only; exit 0)\n`);
  process.exit(0);
}

main();
