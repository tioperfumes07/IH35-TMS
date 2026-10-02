#!/usr/bin/env node
/**
 * OWNER DESIGN LAW 2026-10-02: dispatch tables are the boards' table (head var(--ih-thead), zebra var(--ih-zebra),
 * row rules var(--ih-rule), 12.5px body, 10px/600 uppercase labels, left-aligned). FAILS IF a dispatch ParityTable
 * omits appearance="board", or ParityTable's board appearance stops painting the board tokens.
 * Run: node scripts/verify-dispatch-tables-board-appearance.mjs [--selftest]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PT = "apps/frontend/src/components/parity/ParityTable.tsx";
const files = execFileSync("git", ["ls-files", "--", "apps/frontend/src/pages/dispatch", "apps/frontend/src/components/dispatch"], { encoding: "utf8" })
  .trim().split("\n").filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

export function audit(sources, pt) {
  const f = [];
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/<ParityTable\b[\s\S]*?(?=\/>|>\s*\n)/g)) {
      if (!/appearance="board"/.test(m[0])) f.push(`${file}:${src.slice(0, m.index).split("\n").length} ParityTable without appearance="board"`);
    }
  }
  for (const needle of ['appearance?: "default" | "board";', 'const board = appearance === "board";', '"var(--ih-zebra)"', '"var(--ih-thead)"', 'const BOARD_RULE = "var(--ih-rule)";', 'textTransform: "uppercase" as const'])
    if (!pt.includes(needle)) f.push(`${PT}: board appearance lost ${needle}`);
  return f;
}

const sources = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));
const pt = readFileSync(PT, "utf8");
const fails = audit(sources, pt);
if (fails.length) { console.error(`verify-dispatch-tables-board-appearance: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const [one] = Object.keys(sources).filter((f) => /appearance="board"/.test(sources[f]));
  const m = [
    ["table opts out", { ...sources, [one]: sources[one].replace(/ appearance="board"/, "") }, pt],
    ["zebra token gone", sources, pt.replace('"var(--ih-zebra)"', '"#FAFAFA"')],
  ];
  for (const [n, s, p] of m) if (audit(s, p).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  console.log(`verify-dispatch-tables-board-appearance selftest ${m.length}/${m.length}`);
}
const tables = Object.values(sources).reduce((n, s) => n + (s.match(/<ParityTable\b/g) ?? []).length, 0);
console.log(`verify-dispatch-tables-board-appearance: OK — ${tables} dispatch tables on the board appearance`);
