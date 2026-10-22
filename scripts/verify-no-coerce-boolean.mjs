#!/usr/bin/env node
/**
 * LEAD 443.217 (CC-2) — no z.coerce.boolean( in application code. Owner 10-21: "find the root cause of the cancelled loads
 * engine and fix permanently so this does not occur again."
 * z.coerce.boolean() is JavaScript Boolean(value): the query string "false" is TRUE. Live: the Load Costs board's
 * show_voided=false returned cancelled loads 13635 / 13634 / 13593 / 13556; 102 routes inverted every "...=false" the app
 * sent. The one parser is apps/backend/src/lib/query-boolean.ts (queryBoolean): "true"/"1" → true, "false"/"0"/"" → false,
 * absent stays absent, anything else 400.
 * Scans apps/backend/src + apps/frontend/src (*.ts / *.tsx, comments and tests excluded). --selftest plants one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-coerce-boolean";
const DIRS = ["apps/backend/src", "apps/frontend/src"];
const PARSER = "apps/backend/src/lib/query-boolean.ts";

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!["node_modules", "__tests__", "generated", "dist"].includes(e.name)) walk(rel, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

export function check(sources) {
  const p = [];
  for (const [file, src] of Object.entries(sources)) {
    src.split("\n").forEach((ln, i) => {
      const t = ln.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (/\bz\s*\.\s*coerce\s*\.\s*boolean\s*\(/.test(ln.replace(/\/\/.*$/, ""))) {
        p.push(`${file}:${i + 1}: z.coerce.boolean( — "false" parses as TRUE; use queryBoolean() from ${PARSER}`);
      }
    });
  }
  const parser = sources[PARSER] ?? "";
  if (!/export function queryBoolean\(\)/.test(parser) || !/if \(v === "false" \|\| v === ""\) return false;/.test(parser)) {
    p.push(`${PARSER}: the one query-boolean parser is missing or no longer maps "false" to false`);
  }
  return p;
}

const readAll = () => Object.fromEntries(DIRS.flatMap((d) => walk(d)).map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest: real tree not clean:\n  ${base.slice(0, 10).join("\n  ")}`); process.exit(1); }
  const plants = [
    ["a route uses z.coerce.boolean()", { ...real, "apps/backend/src/x.routes.ts": "const q = z.object({ show_voided: z.coerce.boolean().default(false) });" }],
    ["spaced z . coerce . boolean (", { ...real, "apps/frontend/src/y.ts": "const b = z .coerce. boolean ();" }],
    ["parser maps false to true", { ...real, [PARSER]: real[PARSER].replace('if (v === "false" || v === "") return false;', 'if (v === "false") return true;') }],
    ["a comment is not code", { ...real, "apps/backend/src/z.ts": "// z.coerce.boolean() is wrong\nconst a = 1;" }, true],
  ];
  let ok = 0;
  for (const [name, files, mustPass] of plants) {
    const caught = check(files).length > 0;
    const pass = mustPass ? !caught : caught;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (pass) ok++;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}
const problems = check(readAll());
if (problems.length) { console.error(`${LABEL} FAIL — ${problems.length}:`); for (const x of problems.slice(0, 120)) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL} PASS — no z.coerce.boolean( in app code; every query boolean goes through queryBoolean()`);
