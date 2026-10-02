#!/usr/bin/env node
/**
 * OWNER DESIGN LAW 2026-10-02 rules 7 + 13: "MISSING RENDERS AS — , never 0, and never -$0.00." FAILS IF a dispatch
 * surface renders a missing value as a hyphen or "N/A" (`?? "-"`, `|| "-"`, `: "-"`, `"N/A"`).
 * Run: node scripts/verify-dispatch-missing-is-em-dash.mjs [--selftest]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BAD = /\?\?\s*["']-["']|\|\|\s*["']-["']|:\s*["']-["']\s*[})]|["']N\/A["']/;
const files = execFileSync("git", ["ls-files", "--", "apps/frontend/src/pages/dispatch", "apps/frontend/src/components/dispatch"], { encoding: "utf8" })
  .trim().split("\n").filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
if (files.length < 20) { console.error(`verify-dispatch-missing-is-em-dash: scanned only ${files.length} files — scope is wrong`); process.exit(1); }

export function audit(sources) {
  const f = [];
  for (const [file, src] of Object.entries(sources)) {
    src.split("\n").forEach((line, i) => { if (!/^\s*(\/\/|\*)/.test(line) && BAD.test(line)) f.push(`${file}:${i + 1} ${line.trim().slice(0, 100)}`); });
  }
  return f;
}

const sources = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));
const fails = audit(sources);
if (fails.length) { console.error(`verify-dispatch-missing-is-em-dash: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const m = [["?? hyphen", { "x.tsx": 'render: (l) => l.city ?? "-",' }], ["N/A", { "x.tsx": 'return "N/A";' }], ["ternary hyphen", { "x.tsx": 'x ? `${h}h` : "-"}' }]];
  for (const [n, s] of m) if (audit(s).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  if (audit({ "x.tsx": 'render: (l) => l.city ?? "—",' }).length) { console.error("selftest FAIL: em dash flagged"); process.exit(1); }
  console.log("verify-dispatch-missing-is-em-dash selftest 4/4");
}
console.log(`verify-dispatch-missing-is-em-dash: OK — ${files.length} dispatch files, missing renders as —`);
