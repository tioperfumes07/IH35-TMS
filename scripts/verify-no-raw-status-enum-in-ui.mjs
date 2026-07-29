#!/usr/bin/env node
/**
 * A raw status ENUM must never be used as a display-string fallback.
 *
 * Seen live on prod: the dispatch Fleet OOS strip rendered "Out of service" (the mapped label) with
 * the raw enum "OutOfService" directly beneath it, on 13 units at once. The cause was a fallback
 * chain that reached for the enum when the human field was null:
 *
 *     reason: String(unit.oos_reason ?? unit.status ?? "Unavailable for dispatch")
 *
 * The enum is a machine value. It is not capitalised for humans, it is not translated, and here it
 * was also redundant with the label right above it. A null human field means "nothing was recorded" —
 * render nothing, or a written fallback, never the enum.
 *
 * Deliberately narrow: only the `?? <expr>.status` / `|| <expr>.status` SHAPE inside a String()/
 * template display coercion is flagged. Reading `.status` to branch on it is normal and untouched.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "apps", "frontend", "src");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

/** `?? x.status` or `|| x.status` used inside a String(...) coercion. */
export function rawEnumFallbacks(src) {
  const clean = stripComments(src);
  const hits = [];
  const re = /String\(\s*[^)]*?(?:\?\?|\|\|)\s*([A-Za-z_$][\w$]*)\.status\b[^)]*\)/g;
  for (const m of clean.matchAll(re)) {
    hits.push(m[0].replace(/\s+/g, " ").slice(0, 140));
  }
  return hits;
}

function selftest() {
  const cases = [
    { name: "enum used as display fallback is caught",
      src: `reason: String(unit.oos_reason ?? unit.status ?? "x"),`, expect: 1 },
    { name: "human fallback passes",
      src: `reason: String(unit.oos_reason ?? "").trim(),`, expect: 0 },
    { name: "branching on .status is untouched",
      src: `if (unit.status === "OutOfService") return "Out of service";`, expect: 0 },
    { name: "comment describing the defect does not trip it",
      src: `// was String(unit.oos_reason ?? unit.status ?? "x")\nconst r = "";`, expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = rawEnumFallbacks(c.src).length;
    if (got !== c.expect) { console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/${cases.length}`); process.exit(1); }
  console.log(`verify-no-raw-status-enum-in-ui SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = walk(SRC);
  if (files.length === 0) {
    console.error("verify-no-raw-status-enum-in-ui FAIL — scanned 0 files; refusing to report green");
    process.exit(1);
  }
  const violations = [];
  for (const p of files) {
    for (const h of rawEnumFallbacks(readFileSync(p, "utf8"))) {
      violations.push({ p: p.replace(process.cwd() + "/", ""), h });
    }
  }
  if (violations.length) {
    console.error("verify-no-raw-status-enum-in-ui FAIL — raw status enum used as a display fallback:");
    for (const v of violations) console.error(`\n  ${v.p}\n    ${v.h}`);
    console.error("\nA null human field means nothing was recorded — render nothing or a written");
    console.error("fallback. The enum is a machine value and is not for the operator's eyes.");
    process.exit(1);
  }
  console.log(`verify-no-raw-status-enum-in-ui OK — ${files.length} files scanned, no raw status enum used for display`);
}

main();
