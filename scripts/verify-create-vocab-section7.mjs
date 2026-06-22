// §7 VOCAB GUARD (CLAUDE.md §7): top-level create CTAs must read "+ Create" / "+ Book" — never
// "+ New" / "+ Add". The ONLY allowed "+ Add" is the inline "+ Add new ___" at the end of a reference
// dropdown (a mini-create). This guard LISTS candidate "+ Add X" / "+ New X" button labels so they can
// be triaged: a top-level entity create (e.g. "+ Add User") is a violation → "+ Create User"; a
// sub-item add inside a form (e.g. "+ Add Stop", "+ Add Charge", "+ Add Line") is allowed.
//
// NOTE: report-only by default (process exits 0 with the list). Wire `--strict` into CI only after the
// listed violations are resolved, so it can't false-fail on legitimate sub-item adds.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "apps/frontend/src";
const strict = process.argv.includes("--strict");

// "+ Add Word" or "+ New Word" where Word starts uppercase (an entity/label), NOT "+ Add new …".
const CTA = /\+\s*(Add|New)\s+(?!new\b)([A-Z][A-Za-z0-9 ]{0,28})/g;
// Sub-item adds that are legitimate (added inside a form/editor, not a top-level entity create).
const ALLOWED_SUBITEM = /\b(Add|New)\s+(Stop|Pickup|Delivery|Charge|Charges|Line|Row|Lane|Contact|Note|Item|Adjustment|Advance|Expense|Field|Plate|Mapping|Rate|Stop|Leg|Split|Endorsement|Restriction|Document|File|Photo|Tag|Deduction)\b/;

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) out.push(full);
  }
  return out;
}

const violations = [];
const subitems = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (/\+\s*Add\s+new\b/i.test(line)) return; // allowed inline mini-create
    let m;
    CTA.lastIndex = 0;
    while ((m = CTA.exec(line)) !== null) {
      const label = `+ ${m[1]} ${m[2].trim()}`;
      const entry = `${file}:${i + 1}  ${label}`;
      (ALLOWED_SUBITEM.test(`${m[1]} ${m[2]}`) ? subitems : violations).push(entry);
    }
  });
}

console.log(`§7 vocab scan — ${violations.length} likely violations (top-level '+ Add/New <Entity>'), ${subitems.length} allowed sub-item adds.`);
if (violations.length) {
  console.log("\n--- LIKELY VIOLATIONS (should be '+ Create' / '+ Book') ---");
  for (const v of violations) console.log("  " + v);
}
if (subitems.length) {
  console.log("\n--- allowed sub-item adds (no change) ---");
  for (const s of subitems) console.log("  " + s);
}
if (strict && violations.length) {
  console.error(`\nFAIL verify-create-vocab-section7: ${violations.length} "+ Add/New" CTA(s) — use "+ Create"/"+ Book".`);
  process.exit(1);
}
