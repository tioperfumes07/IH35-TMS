#!/usr/bin/env node
// LEAD 443.365-B — mark every short-code field in the catalog creators with data-control-kind="code" so the control
// sizing law (styles/control-sizing-law.css) sizes it 104px (owner design law rule 4: "Short code 104px").
// A code field = an <input> whose value binds to a *_code / code / *Code field. Run: node <this> [--apply]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openingTags } from "../verify-popups-one-format.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "apps/frontend/src/pages/lists");
export const CODE_VALUE = /\bvalue=\{[^}]*?(?:\w+_code|\bcode|\w+Code)\b[^}]*\}/;
const SKIP_TYPE = /\btype="(checkbox|radio|hidden|file|date|number)"/;

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) a.push(p);
  }
  return a;
}

const apply = process.argv.includes("--apply");
let total = 0, marked = 0;
const touched = [];
for (const f of walk(DIR)) {
  let src = fs.readFileSync(f, "utf8");
  const tags = openingTags(src, "input").filter((t) => !SKIP_TYPE.test(t.attrs) && CODE_VALUE.test(t.attrs));
  if (!tags.length) continue;
  total += tags.length;
  // insert from the end so earlier indexes stay valid
  for (const t of [...tags].reverse()) {
    if (/data-control-kind=/.test(t.attrs)) continue;
    const at = t.index + "<input".length;
    src = src.slice(0, at) + ' data-control-kind="code"' + src.slice(at);
    marked++;
  }
  touched.push(path.relative(ROOT, f));
  if (apply) fs.writeFileSync(f, src);
}
console.log(JSON.stringify({ code_inputs: total, newly_marked: marked, files: touched.length, apply }, null, 0));
