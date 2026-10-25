#!/usr/bin/env node
// LEAD 443.365-C — one field-label style for every catalog creator (owner 10-25-2026 4:05 PM: "headers text size ...
// the creators are wrong"). Replaces the hand-typed stacked-label literals under pages/lists with the two constants in
// components/forms/inputClass.ts. Inline checkbox labels ("flex items-center ...") are a different element and untouched.
// Run: node <this> [--apply]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "apps/frontend/src");
const DIR = path.join(SRC, "pages/lists");
const INPUT_CLASS = path.join(SRC, "components/forms/inputClass");

export const MAP = [
  ['<label className="block text-xs font-semibold text-gray-600"', "<label className={FORM_LABEL_CLASS}", "FORM_LABEL_CLASS"],
  ['<label className="block text-xs font-semibold text-[#4B5563]"', "<label className={FORM_LABEL_CLASS}", "FORM_LABEL_CLASS"],
  ['<label className="flex flex-col gap-1 text-xs font-semibold text-gray-600"', "<label className={FORM_LABEL_STACK_CLASS}", "FORM_LABEL_STACK_CLASS"],
];

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) a.push(p);
  }
  return a;
}

function addImport(src, file, names) {
  let rel = path.relative(path.dirname(file), INPUT_CLASS).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${rel.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:\\.js|\\.ts)?["'];?`);
  const m = src.match(re);
  if (m) {
    const have = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const all = [...new Set([...have, ...names])];
    return src.replace(m[0], `import { ${all.join(", ")} } from "${rel}"`);
  }
  // after the last top-level import statement
  const lines = src.split("\n");
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (/^import\b/.test(lines[i]) || (last >= 0 && /^\s+[\w{},\s]*\} from /.test(lines[i]))) last = i;
  // walk to the end of a multi-line import
  while (last >= 0 && last + 1 < lines.length && !/from\s+["'][^"']+["'];?\s*$/.test(lines[last]) ) last++;
  lines.splice(last + 1, 0, `import { ${names.join(", ")} } from "${rel}"`);
  return lines.join("\n");
}

const apply = process.argv.includes("--apply");
const counts = { before: 0, after: 0, files: 0 };
for (const f of walk(DIR)) {
  let src = fs.readFileSync(f, "utf8");
  const used = new Set();
  for (const [from, to, name] of MAP) {
    const n = src.split(from).length - 1;
    if (!n) continue;
    counts.before += n;
    src = src.split(from).join(to);
    used.add(name);
  }
  if (!used.size) continue;
  counts.files++;
  src = addImport(src, f, [...used]);
  if (apply) fs.writeFileSync(f, src);
}
for (const f of walk(DIR)) {
  const s = apply ? fs.readFileSync(f, "utf8") : "";
  for (const [from] of MAP) counts.after += s.split(from).length - 1;
}
console.log(JSON.stringify({ ...counts, apply }));
