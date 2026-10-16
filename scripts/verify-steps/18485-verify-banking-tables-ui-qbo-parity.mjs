#!/usr/bin/env node
/**
 * LEAD 443.156 items 1-4 — BANKING + TABLES UI, QBO PARITY (owner 11:15 CT / 11:40 CT / screenshot 10:48 CT).
 *
 *   1. A filter that picks from a SET uses MultiSelectDropdown, never a single native <select>/<SelectCombobox> with an
 *      "All …" option. Banking carries none; every other file is pinned in the SHRINK-ONLY allowlist
 *      18485-single-select-set-filters.allowlist.json (a new file or a higher count fails; the allowlist itself may
 *      only shrink against origin/main).
 *   2. The shared table (ParityTable) row + select-all checkboxes are a 20px box (TABLE_SELECT_CHECKBOX_CLASS h-5 w-5)
 *      inside a 32px hit area (TABLE_SELECT_HIT_CLASS min-h-8 min-w-8).
 *   3. The selector column is TABLE_SELECT_COLUMN_PX wide (its content, no wider); money / number columns keep their
 *      measured pixel width and never take a shrinking share (no truncated money).
 *   4. Banking has ONE action per row: effectiveActionMode drives both the button's label and its click (Match opens
 *      the matcher), the "N matches found" line is text, not a second filled action box, and no "Action type" column.
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOW_REL = "scripts/verify-steps/18485-single-select-set-filters.allowlist.json";
const F = {
  tokens: "apps/frontend/src/design/tokens.ts",
  table: "apps/frontend/src/components/parity/ParityTable.tsx",
  view: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function countSingleSelectSetFilters(src) {
  let c = 0;
  for (const m of src.matchAll(/<(select|SelectCombobox)\b[\s\S]*?<\/(select|SelectCombobox)>/g)) if (/<option[^>]*>\s*All\b/.test(m[0])) c += 1;
  return c;
}

function frontendFiles(dir = resolve(ROOT, "apps/frontend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!["__tests__", "node_modules", "generated"].includes(name)) frontendFiles(abs, out);
    } else if (abs.endsWith(".tsx") && !/\.test\.tsx$/.test(abs)) out.push(abs);
  }
  return out;
}

export function check({ tokens, table, view, files, allow, mainAllow }) {
  const findings = [];
  // 1
  for (const [rel, src] of files) {
    const n = countSingleSelectSetFilters(src);
    if (!n) continue;
    if (/\/banking\//.test(rel)) findings.push(`${rel}: ${n} single-select filter(s) over a set on Banking — use MultiSelectDropdown (1)`);
    else if (allow[rel] == null) findings.push(`${rel}: new single-select filter over a set (${n}) — use MultiSelectDropdown (1)`);
    else if (n > allow[rel]) findings.push(`${rel}: ${n} single-select set filters, allowlist caps it at ${allow[rel]} (1)`);
  }
  if (mainAllow) {
    for (const [rel, cap] of Object.entries(allow)) {
      if (mainAllow[rel] == null) findings.push(`${ALLOW_REL}: ${rel} added — the allowlist only shrinks (1)`);
      else if (cap > mainAllow[rel]) findings.push(`${ALLOW_REL}: ${rel} raised ${mainAllow[rel]} → ${cap} — the allowlist only shrinks (1)`);
    }
  }
  // 2
  if (!/export const TABLE_SELECT_CHECKBOX_CLASS = "[^"]*\bh-5\b[^"]*\bw-5\b[^"]*"/.test(tokens)) findings.push(`${F.tokens}: the table select checkbox is not a 20px box (2)`);
  if (!/export const TABLE_SELECT_HIT_CLASS = "[^"]*\bmin-h-8\b[^"]*\bmin-w-8\b[^"]*"/.test(tokens)) findings.push(`${F.tokens}: the table select hit area is not 32px (2)`);
  for (const label of ["Select row", "Select all on page"]) {
    const i = table.indexOf(`aria-label="${label}"`);
    const before = i < 0 ? "" : table.slice(Math.max(0, i - 400), i);
    if (!/TABLE_SELECT_HIT_CLASS/.test(before) || !/className=\{TABLE_SELECT_CHECKBOX_CLASS\}/.test(before)) findings.push(`${F.table}: "${label}" checkbox is not the 20px box in the 32px hit area (2)`);
  }
  // 3
  if (!/export const TABLE_SELECT_COLUMN_PX = \d+;/.test(tokens)) findings.push(`${F.tokens}: TABLE_SELECT_COLUMN_PX missing (3)`);
  if ((table.match(/width: TABLE_SELECT_COLUMN_PX/g) ?? []).length < 3) findings.push(`${F.table}: selector header/cells/footer are not sized by TABLE_SELECT_COLUMN_PX (3)`);
  if (/\{selectable \? \(\s*<th className="w-8/.test(table)) findings.push(`${F.table}: selector header is a fixed w-8, not its content width (3)`);
  if (!/const isFigureColumn = \(c: ParityColumn<T>\) => c\.kind === "money" \|\| c\.kind === "number";/.test(table) || !/proportional && column && isFigureColumn\(column\)\s*\?\s*w/.test(table) || !/width: cssWidthFor\(w, column\)/.test(table))
    findings.push(`${F.table}: money / number columns take a shrinking share — truncated money (3)`);
  // 4
  if (!/export function effectiveActionMode\(/.test(view)) findings.push(`${F.view}: effectiveActionMode (the one action per row) is missing (4)`);
  if (!/onClick=\{\(\) => \(actionMode === "match" \? setMatchDrawerTxId\(tx\.id\) : void postTransaction\(tx\)\)\}/.test(view)) findings.push(`${F.view}: the Action button's click does not follow its label (Match must open the matcher) (4)`);
  if (!/qboActionLabel\(actionMode\)/.test(view)) findings.push(`${F.view}: the Action button label is not the row's one action (4)`);
  if (/label:\s*"Action type"/i.test(view)) findings.push(`${F.view}: an "Action type" column is back — one column (4)`);
  const badgeAt = view.indexOf("data-b3-match-badge-inline=\"1\"");
  const badge = badgeAt < 0 ? "" : view.slice(badgeAt, view.indexOf("</button>", badgeAt));
  if (/bg-\[#1F2A44\] text-white/.test(badge)) findings.push(`${F.view}: the "N matches found" line is a second filled action box (4)`);
  return findings;
}

function load() {
  const files = frontendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const allow = JSON.parse(read(ALLOW_REL)).files;
  const r = spawnSync("git", ["show", `origin/main:${ALLOW_REL}`], { cwd: ROOT, encoding: "utf8" });
  const mainAllow = r.status === 0 ? JSON.parse(r.stdout).files : null;
  return { tokens: read(F.tokens), table: read(F.table), view: read(F.view), files, allow, mainAllow };
}

if (process.argv.includes("--selftest")) {
  const base = load();
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["banking single-select", { ...base, files: [...base.files, ["apps/frontend/src/pages/banking/X.tsx", '<select><option value="">All types</option></select>']] }],
    ["new single-select elsewhere", { ...base, files: [...base.files, ["apps/frontend/src/pages/x/Y.tsx", '<SelectCombobox><option value="all">All statuses</option></SelectCombobox>']] }],
    ["allowlist grows", { ...base, allow: { ...base.allow, "apps/frontend/src/pages/x/Z.tsx": 1 }, mainAllow: base.mainAllow ?? base.allow }],
    ["small checkbox", { ...base, tokens: base.tokens.replace('TABLE_SELECT_CHECKBOX_CLASS = "h-5 w-5', 'TABLE_SELECT_CHECKBOX_CLASS = "h-3 w-3') }],
    ["small hit area", { ...base, tokens: base.tokens.replace("min-h-8 min-w-8", "min-h-6 min-w-6") }],
    ["row checkbox unsized", { ...base, table: base.table.replace("className={TABLE_SELECT_CHECKBOX_CLASS}\n                aria-label=\"Select row\"", "aria-label=\"Select row\"") }],
    ["money shrinks", { ...base, table: base.table.replace("proportional && column && isFigureColumn(column)", "false") }],
    ["label/click disagree", { ...base, view: base.view.replace('onClick={() => (actionMode === "match" ? setMatchDrawerTxId(tx.id) : void postTransaction(tx))}', "onClick={() => void postTransaction(tx)}") }],
    ["action type column", { ...base, view: base.view + '\nconst c = { key: "actionType", label: "Action type" };\n' }],
  ];
  for (const [name, input] of plants) {
    if (check(input).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(load());
if (findings.length) {
  console.error(`verify-banking-tables-ui-qbo-parity FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-banking-tables-ui-qbo-parity PASS: set filters multi-select (Banking 0, rest shrink-only), 20px/32px table checkboxes, content-width selector + unshrinkable money, one Action per row");
