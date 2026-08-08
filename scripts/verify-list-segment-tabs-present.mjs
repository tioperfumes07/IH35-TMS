#!/usr/bin/env node
/**
 * GUARD — the three list pages must keep their §7 segment tabs.
 *
 * WHY THIS EXISTS: `b3690eb68` ("align customers and vendors to locked side-rail layout", 2026-05-18) DELETED
 * the segment-filter tab sets from Customers and Vendors while realigning them. §7 is ADDITIVE-ONLY — archive,
 * never delete — and nothing caught it: the two tests that would have (`VendorsPage.tabs`,
 * `CustomersPage.tabs`) sat red among 33 other FE reds for roughly twelve weeks. Drivers kept its copy, which
 * is the only reason the pattern was still recoverable (#4846 / #4847 / #4852 / #4855).
 *
 * So this asserts the SET EXISTS on all three pages — Drivers included, because it is the one page that never
 * lost its tabs and therefore the one page with no failing test forcing anyone to look at it.
 *
 * NOT CLAIMED: this proves the tab set is RENDERED with its ids. It does not prove the filtering behind each
 * segment is correct — the page tests own that.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-list-segment-tabs-present";

/** Each page, and the segment ids it must offer. Derived from what b3690eb68 deleted + what Drivers still has. */
export const SEGMENT_PAGES = [
  { file: "apps/frontend/src/pages/Drivers.tsx", required: ["all", "active", "inactive"] },
  { file: "apps/frontend/src/pages/Customers.tsx", required: ["all", "active", "inactive"] },
  { file: "apps/frontend/src/pages/Vendors.tsx", required: ["all", "active", "inactive"] },
];

export function assertSegmentTabs(src, file, required) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/<SecondaryNavTabs/.test(code)) {
    problems.push(`${file}: no <SecondaryNavTabs> at all — the §7 segment tab set is gone (b3690eb68 class).`);
    return problems;
  }
  for (const id of required) {
    // the tab entries are object literals: { id: "active", label: `Active (${...})` }
    const re = new RegExp(String.raw`id:\s*"${id}"`);
    if (!re.test(code)) {
      problems.push(
        `${file}: segment tab id "${id}" is missing. §7 is ADDITIVE-ONLY — archive, never delete. ` +
          `b3690eb68 removed this set from Customers and Vendors and nothing caught it for ~12 weeks.`,
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `<SecondaryNavTabs tabs={[{ id: "all", label: "All" },{ id: "active", label: "A" },{ id: "inactive", label: "I" }]} />`;
  const cases = [
    ["all three ids present", good, 0],
    ["REGRESSION BAR — inactive deleted (the b3690eb68 shape)", good.replace('{ id: "inactive", label: "I" }', ""), 1],
    ["whole tab bar deleted", "const x = 1;", 1],
    ["two ids deleted", `<SecondaryNavTabs tabs={[{ id: "all", label: "All" }]} />`, 2],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = assertSegmentTabs(src, "test.tsx", ["all", "active", "inactive"]).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

const problems = [];
for (const { file, required } of SEGMENT_PAGES) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    problems.push(`${file}: missing — refusing to pass vacuously.`);
    continue;
  }
  problems.push(...assertSegmentTabs(fs.readFileSync(abs, "utf8"), file, required));
}
if (problems.length) {
  console.error(`${LABEL} FAIL — a §7 list segment tab set was removed:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${SEGMENT_PAGES.length} list pages keep their segment tab set.`);
process.exit(0);
