#!/usr/bin/env node
/**
 * CLS-DEAD-COMBOBOX-IMPORT — mechanical: no Combobox import without <Combobox usage.
 *   node scripts/verify-dead-combobox-imports.mjs
 *   node scripts/verify-dead-combobox-imports.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-dead-combobox-imports";

/** Files that re-export Combobox — never flagged. */
const REEXPORT = new Set([
  "apps/frontend/src/components/Combobox.tsx",
  "apps/frontend/src/components/shared/Combobox.tsx",
  "apps/frontend/src/components/parity/ReferenceSelect.tsx",
  "apps/frontend/src/components/parity/EntityPicker.tsx",
  "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx",
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith(".tsx")) out.push(rel);
  }
}

export function deadComboboxImports(root = ROOT) {
  const files = [];
  walk(SRC, files);
  const dead = [];
  for (const rel of files) {
    if (REEXPORT.has(rel) || rel.endsWith(".test.tsx")) continue;
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/import\s*\{[^}]*\bCombobox\b[^}]*\}\s*from/.test(src)) continue;
    if (/SelectCombobox|QboCombobox/.test(src.split("import")[1]?.slice(0, 80) ?? "")) continue;
    const code = maskComments(src);
    if (!/<Combobox\b/.test(code)) dead.push(rel);
  }
  return dead;
}

if (process.argv.includes("--selftest")) {
  const probe = (src) => {
    if (!/import\s*\{[^}]*\bCombobox\b/.test(src)) return false;
    return !/<Combobox\b/.test(maskComments(src));
  };
  if (!probe('import { Combobox } from "x";\nexport const y = 1;') || probe('import { Combobox } from "x";\n<Combobox />')) {
    console.error(LABEL, "SELFTEST FAIL — basic dead/live cases");
    process.exit(1);
  }
  // CLS-DEAD-COMBOBOX-FALSE-POSITIVE-STRING-SLASH-STAR (found live in FuelReceiptPage.tsx,
  // apps/frontend/src/pages/driver/FuelReceiptPage.tsx): a bare regex comment-stripper does not
  // track quote state, so a `/*`-shaped substring inside an ordinary string prop (e.g.
  // accept="image/*") is misread as opening a block comment and swallows everything up to the
  // NEXT real `*/`, including a real <Combobox> usage in between. maskComments() tracks quote
  // state and must NOT be fooled by this.
  const stringSlashStar = 'import { Combobox } from "x";\n<input accept="image/*" />\n<Combobox />\n{/* a real comment */}';
  if (probe(stringSlashStar)) {
    console.error(LABEL, "SELFTEST FAIL — string-literal /* false positive not fixed");
    process.exit(1);
  }
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}

const dead = deadComboboxImports();
if (dead.length) {
  console.error(`${LABEL} FAIL — ${dead.length} dead Combobox import(s):`);
  for (const d of dead) console.error(`  - ${d}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 0 dead Combobox imports`);
