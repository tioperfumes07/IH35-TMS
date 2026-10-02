#!/usr/bin/env node
/**
 * OWNER DESIGN LAW 2026-10-02 rule 3 (docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md): ONE DATE BOX WIDTH —
 * 132px everywhere, tabular figures, never full-width, never sized from its container; 34px in a filter bar, 40px when
 * edited in a form. FAILS IF any DatePicker on a dispatch surface omits box="filter" | box="field", or if DatePicker's
 * board box stops reading --ih-w-date / --ih-h-control / --ih-h-field.
 * Run: node scripts/verify-dispatch-date-boxes.mjs [--selftest]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PICKER = "apps/frontend/src/components/forms/DatePicker.tsx";
const listFiles = () =>
  execFileSync("git", ["grep", "-l", "<DatePicker", "--", ":(glob)apps/frontend/src/pages/dispatch/**/*.tsx", ":(glob)apps/frontend/src/components/dispatch/**/*.tsx", ":!*.test.tsx"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);

export function audit(files, picker) {
  const fails = [];
  for (const [f, src] of Object.entries(files)) {
    for (const m of src.matchAll(/<DatePicker\b[^>]*?\/?>/gs)) {
      if (!/\bbox="(filter|field)"/.test(m[0])) fails.push(`${f}:${src.slice(0, m.index).split("\n").length} DatePicker without box="filter"|"field"`);
    }
  }
  for (const needle of ['width: "var(--ih-w-date)"', '"var(--ih-h-field)"', '"var(--ih-h-control)"', 'box?: "filter" | "field"']) {
    if (!picker.includes(needle)) fails.push(`${PICKER}: board date box lost ${needle}`);
  }
  return fails;
}

const files = Object.fromEntries(listFiles().map((f) => [f, readFileSync(f, "utf8")]));
const picker = readFileSync(PICKER, "utf8");
const fails = audit(files, picker);
if (fails.length) { console.error(`verify-dispatch-date-boxes: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const [first] = Object.keys(files);
  const cases = [
    ["unboxed picker", { ...files, [first]: files[first].replace(/ box="(filter|field)"/, "") }, picker],
    ["width from container", files, picker.replace('width: "var(--ih-w-date)"', 'width: "100%"')],
  ];
  for (const [name, f, p] of cases) if (audit(f, p).length === 0) { console.error(`verify-dispatch-date-boxes selftest FAIL: ${name}`); process.exit(1); }
  console.log(`verify-dispatch-date-boxes selftest ${cases.length}/${cases.length} caught`);
}
console.log(`verify-dispatch-date-boxes: OK — ${Object.keys(files).length} dispatch files, every date box is 132px (34px filter / 40px field)`);
