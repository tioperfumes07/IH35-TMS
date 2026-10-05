#!/usr/bin/env node
/**
 * UI-F414 — THE ROW-ACTIONS COLUMN MUST BE WIDE ENOUGH TO CLICK.
 *
 * ParityTable renders `table-fixed` by default, and under table-fixed the browser NEVER re-measures
 * a column against its content: the declared width wins, always. All three row-actions cells were
 * `w-10 px-2` — 40px with a 24px content box — so every Edit / Archive pair in every list screen was
 * laid out in 24px and `flex-wrap` folded the buttons one CHARACTER per line. The column became a
 * vertical strip of letters and the owner could not edit a single catalog row.
 *
 * Nothing threw. No test failed. It was a width.
 *
 *   RULE 1 — no row-actions cell may be declared with a Tailwind width utility (w-8 … w-16). The
 *            width comes from the named constant so every cell agrees and one edit moves all of them.
 *   RULE 2 — the constant must be at least MIN_CLICKABLE_PX, the measured size of two small labelled
 *            buttons plus their gap and the cell's padding.
 *   RULE 3 — the body actions cell must be whitespace-nowrap, so a future squeeze overflows VISIBLY
 *            instead of shredding the labels into unreadable columns of letters.
 *   RULE 4 — no row-actions renderer may use `flex-wrap`. Wrapping is what turns "too narrow" into
 *            "unreadable" rather than into an obvious overflow.
 *
 * --selftest proves each rule can fail.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const NAME = "verify-row-actions-column-is-clickable";
const PARITY = "apps/frontend/src/components/parity/ParityTable.tsx";

/**
 * A size="sm" Button is `h-7 text-xs font-medium px-2` plus a 1px border each side
 * (components/Button.tsx + design/tokens.ts). At text-xs (12px): "Edit" ~27 + 16 + 2 = 45px,
 * "Archive" ~47 + 16 + 2 = 65px, `gap-2` = 8px, the cell's own `px-2` = 16px. 134px for the pair.
 */
const MIN_CLICKABLE_PX = 134;
const WIDTH_UTILITY = /\bw-(?:8|9|10|11|12|14|16)\b/;

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function run(sources) {
  const failures = [];
  const parity = sources.parity;
  if (parity === null) return [`RULE 1: ${PARITY} is missing.`];

  for (const line of parity.split("\n")) {
    if (line.includes("rowActions ?") && line.includes("className") && WIDTH_UTILITY.test(line)) {
      failures.push(`RULE 1: a row-actions cell declares a fixed Tailwind width: ${line.trim().slice(0, 120)}`);
    }
  }

  const declared = /ROW_ACTIONS_DEFAULT_WIDTH_PX\s*=\s*(\d+)/.exec(parity);
  if (!declared) {
    failures.push("RULE 2: ROW_ACTIONS_DEFAULT_WIDTH_PX is not declared — the width is back to being spelled per cell.");
  } else if (Number(declared[1]) < MIN_CLICKABLE_PX) {
    failures.push(`RULE 2: ROW_ACTIONS_DEFAULT_WIDTH_PX is ${declared[1]}px; two small labelled buttons need at least ${MIN_CLICKABLE_PX}px.`);
  }

  const bodyCellAt = parity.indexOf("{rowActions ? (");
  const bodyCell = bodyCellAt >= 0 ? parity.slice(bodyCellAt, bodyCellAt + 600) : "";
  if (!bodyCell.includes("whitespace-nowrap")) {
    failures.push("RULE 3: the body actions cell is not whitespace-nowrap, so a squeeze shreds the labels instead of overflowing.");
  }

  for (const [path, body] of sources.renderers) {
    const blocks = body.split("rowActions");
    for (const block of blocks.slice(1)) {
      if (/flex-wrap[^"]*justify-end|justify-end[^"]*flex-wrap/.test(block.slice(0, 500))) {
        failures.push(`RULE 4: ${path} wraps its row actions (flex-wrap). Use flex-nowrap so a squeeze stays visible.`);
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const clean = {
    parity:
      "export const ROW_ACTIONS_DEFAULT_WIDTH_PX = 160;\n" +
      "{rowActions ? (\n  <td className=\"whitespace-nowrap px-2 text-right\" style={{ width: rowActionsWidth }}>\n",
    renderers: [["ok.tsx", "rowActions={(row) => (<div className=\"flex flex-nowrap justify-end gap-2\">"]],
  };
  const cases = [
    ["a clean tree passes", clean, 0],
    [
      "rule 1 catches w-10 on an actions cell",
      { ...clean, parity: clean.parity + "\n{rowActions ? <th className=\"w-10 px-2\" /> : null}" },
      1,
    ],
    ["rule 2 catches a missing constant", { ...clean, parity: clean.parity.replace("export const ROW_ACTIONS_DEFAULT_WIDTH_PX = 160;", "") }, 1],
    ["rule 2 catches a too-small constant", { ...clean, parity: clean.parity.replace("160", "40") }, 1],
    ["rule 3 catches a wrapping body cell", { ...clean, parity: clean.parity.replace("whitespace-nowrap ", "") }, 1],
    [
      "rule 4 catches flex-wrap in a renderer",
      { ...clean, renderers: [["bad.tsx", "rowActions={(row) => (<div className=\"flex flex-wrap justify-end gap-2\">"]] },
      1,
    ],
  ];
  let ok = 0;
  for (const [label, sources, expected] of cases) {
    const got = run(sources).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const renderers = execSync("git grep -l 'rowActions' -- 'apps/frontend/src/**/*.tsx'", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  .split("\n")
  .filter((p) => p && !p.includes("__tests__") && !p.endsWith(".test.tsx"))
  .map((p) => [p, read(p) ?? ""]);

const failures = run({ parity: read(PARITY), renderers });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} finding(s).`);
  process.exit(1);
}
console.log(`${NAME}: PASS — 4/4 rules hold across ${renderers.length} table(s) that render row actions.`);
