#!/usr/bin/env node
/**
 * GUARD: FILTER LAW (owner ruling 2026-09-01, docs/bus/LAW-FIX-INSTANTLY-FULL-REGISTER-2026-09-01.md,
 * joined to COLUMN LAW same day).
 *
 * "The filter box is OUT OF PROPORTION with the toolbar around it. Standardize the control size
 * across the app; one scale, not per-page improvisation."
 *
 * Root cause (live-verified, not guessed): `TableSearch` (the shared free-text filter box mounted
 * by `UniversalListToolbar` on effectively every list page) was hardcoded `h-8 ... text-[13px]`
 * while `Combobox` (the shared engine every real dropdown filter — status, customer, vendor, etc.
 * — renders through) is `h-9 ... text-[13px]`. Two controls sitting in the SAME toolbar row, 4px
 * apart in height, on every list page in the app — a real, systemic, visible mismatch, not a
 * per-page styling nit. `UniversalListToolbar`'s own Range popover (date/amount/number fields) had
 * the same drift (h-8/text-[12px] vs the h-9/text-[13px] the rest of the app's form controls —
 * DatePicker, MoneyInput — already use).
 *
 * Fix: ONE shared constant, `FILTER_CONTROL_SIZE_CLASS` in `design/tokens.ts`, referenced by both
 * `TableSearch.tsx` and the `Combobox.tsx` engine (so they can never drift apart again) and by
 * `UniversalListToolbar.tsx`'s Range popover fields. This guard is a hard regression pin, not a
 * ratchet: these three files losing the shared import silently reopens the exact defect.
 *
 * Usage:
 *   node scripts/verify-filter-law.mjs
 *   node scripts/verify-filter-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-filter-law";
const SELFTEST = process.argv.includes("--selftest");

const TOKENS_PATH = "apps/frontend/src/design/tokens.ts";
const TABLE_SEARCH_PATH = "apps/frontend/src/components/table/TableSearch.tsx";
const COMBOBOX_PATH = "apps/frontend/src/components/Combobox.tsx";
const TOOLBAR_PATH = "apps/frontend/src/components/table/UniversalListToolbar.tsx";

export function tokensExportSizeClass(src) {
  return /export const FILTER_CONTROL_SIZE_CLASS\s*=\s*"[^"]*h-9[^"]*"/.test(src);
}

export function fileUsesSharedSizeClass(src) {
  return src.includes("FILTER_CONTROL_SIZE_CLASS");
}

/**
 * A raw h-8 (or h-7) INPUT/SELECT paired with a small font size is the exact drifted shape this
 * law fixed. Scoped to `<input`/`<select` tags specifically (not any h-8 element in the file) —
 * a toolbar TOGGLE BUTTON (e.g. the "Range" popover trigger) is legitimately its own, smaller
 * scale; it is chrome, not a filter form control, and is not part of this law's claim.
 */
export function fileHasStrayFilterHeight(src) {
  const tagRe = /<(input|select)\b[^>]*className=(\{`[^`]*`\}|"[^"]*")/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const classBlob = m[2];
    if (/\bh-[78]\b/.test(classBlob) && /text-\[1[23]px\]/.test(classBlob)) return true;
  }
  return false;
}

if (SELFTEST) {
  const cases = [
    { name: "tokens.ts exporting the real h-9 constant passes", fn: () => tokensExportSizeClass('export const FILTER_CONTROL_SIZE_CLASS = "h-9 text-[13px]";') === true },
    { name: "tokens.ts with a downgraded h-8 constant fails", fn: () => tokensExportSizeClass('export const FILTER_CONTROL_SIZE_CLASS = "h-8 text-[13px]";') === false },
    { name: "a file importing/using the shared constant passes", fn: () => fileUsesSharedSizeClass('className={`${FILTER_CONTROL_SIZE_CLASS} w-full`}') === true },
    { name: "a file with no reference to the shared constant fails", fn: () => fileUsesSharedSizeClass('className="h-8 w-full"') === false },
    {
      name: "reintroducing the old drifted h-8+text-[12px] pair on an <input> is caught",
      fn: () => fileHasStrayFilterHeight('<input type="number" className="h-8 w-full rounded-sm border px-2 text-[12px]" />') === true,
    },
    {
      name: "the fixed h-9+text-[13px] pair on an <input> is NOT flagged as a stray",
      fn: () => fileHasStrayFilterHeight('<input type="number" className={`mt-1 ${FILTER_CONTROL_SIZE_CLASS} w-full`} />') === false,
    },
    {
      name: "an h-8 TOGGLE BUTTON (not input/select) is not flagged — chrome, not a filter control",
      fn: () => fileHasStrayFilterHeight('<button type="button" className="flex h-8 items-center gap-1 text-[12px]">Range</button>') === false,
    },
  ];
  let failed = false;
  for (const c of cases) {
    const ok = c.fn();
    console.log(`${ok ? "PASS" : "FAIL"} — ${c.name}`);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length}/${cases.length} cases correct`);
  process.exit(0);
}

const checks = [
  { path: TOKENS_PATH, assert: tokensExportSizeClass, label: "exports FILTER_CONTROL_SIZE_CLASS at h-9" },
  { path: TABLE_SEARCH_PATH, assert: fileUsesSharedSizeClass, label: "uses the shared constant (not a re-hardcoded height)" },
  { path: COMBOBOX_PATH, assert: fileUsesSharedSizeClass, label: "uses the shared constant (not a re-hardcoded height)" },
  { path: TOOLBAR_PATH, assert: fileUsesSharedSizeClass, label: "Range popover fields use the shared constant" },
];

let failed = false;
for (const check of checks) {
  const abs = path.join(ROOT, check.path);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL — ${check.path} not found; scan path is wrong.`);
    failed = true;
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  if (!check.assert(src)) {
    console.error(`${LABEL} FAIL — ${check.path} no longer ${check.label}. This reopens the exact filter/search-box size mismatch the owner reported.`);
    failed = true;
  }
  if (fileHasStrayFilterHeight(src)) {
    console.error(`${LABEL} FAIL — ${check.path} has a reintroduced h-8/text-[12px] (or h-7) control pair alongside the shared constant.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`${LABEL}: OK — search box, combobox engine, and Range popover all share one control size (FILTER_CONTROL_SIZE_CLASS).`);
process.exit(0);
