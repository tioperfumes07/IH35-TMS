#!/usr/bin/env node
// AUTO-12 guard: the shared .code-cell must never break/auto-hyphenate codes (WO-…-V5) at their hyphens.
import fs from "node:fs"; import path from "node:path"; import process from "node:process";
const css = fs.readFileSync(path.join(process.cwd(), "apps/frontend/src/index.css"), "utf8");
const m = css.match(/\.code-cell\s*\{([^}]*)\}/);
const fails = [];
if (!m) fails.push(".code-cell rule missing from index.css");
else {
  const body = m[1];
  for (const need of ["white-space: nowrap", "hyphens: none", "word-break: keep-all"]) {
    if (!body.includes(need)) fails.push(`.code-cell must set \`${need}\` (hyphenated codes must not break)`);
  }
}
if (fails.length) { console.error("verify:code-cell-no-hyphen FAIL:"); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log("verify:code-cell-no-hyphen OK");
