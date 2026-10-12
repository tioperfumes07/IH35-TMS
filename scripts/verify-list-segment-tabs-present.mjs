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

/** Each page, and the segment ids it must offer. Derived from what b3690eb68 deleted + what Drivers still has.
 * `also` (optional): extra source files whose text is concatenated before the id check — Drivers.tsx
 * extracted its DRIVERS_LIST_STATUS_TABS array into a shared config file (pre-dates this guard, PR
 * #5546-era refactor), so the literal `id: "..."` object entries live there, not inline in Drivers.tsx
 * itself. <SecondaryNavTabs> presence is still asserted against Drivers.tsx's own source only. */
export const SEGMENT_PAGES = [
  {
    file: "apps/frontend/src/pages/Drivers.tsx",
    also: ["apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts"],
    required: ["all", "active", "inactive"],
  },
  { file: "apps/frontend/src/pages/Customers.tsx", required: ["all", "active", "inactive"] },
  { file: "apps/frontend/src/pages/Vendors.tsx", required: ["all", "active", "inactive"] },
];

// LEAD 443.99 class B (2026-10-12) — which element carries the segment set.
//   old rule: the page renders <SecondaryNavTabs>, and each required id appears as an `id: "<id>"` literal (page or
//             its `also` config file).
//   new rule: the set is carried by <SecondaryNavTabs>, <NavyPageSubNav> or a <SegmentedControl> status filter; each
//             required id is an `id: "<id>"` tab literal (page or `also` config) OR a `value: "<id>"` option INSIDE a
//             <SegmentedControl ... /> on the page. A `value:` literal anywhere else does not count.
//   why: the owner navy-subnav sweep (LST-F10170 #18898 Vendors, LST-F10179 #18911 Customers, LST-F10180 #18912
//        Drivers) replaced SecondaryNavTabs with NavyPageSubNav, and C-01 / DRV-F417 then moved the
//        active / inactive / all status set onto SegmentedControl chips ("filters are SegmentedControl chips, never
//        a second NavyPageSubNav"). The set is still on all three pages; deleting it (b3690eb68 shape) still fails.
function segmentedControlBlocks(code) {
  const blocks = [];
  const re = /<SegmentedControl\b/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    // the element closes at the first "/>" at JSX depth 0 after its options array — bounded window is enough
    const end = code.indexOf("/>", code.indexOf("options=", m.index) >= 0 ? code.indexOf("options=", m.index) : m.index);
    blocks.push(code.slice(m.index, end < 0 ? m.index + 1200 : end));
  }
  return blocks.join("\n");
}

export function assertSegmentTabs(src, file, required, alsoSrc = "") {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/<(SecondaryNavTabs|NavyPageSubNav|SegmentedControl)\b/.test(code)) {
    problems.push(`${file}: no <SecondaryNavTabs> at all — the §7 segment tab set is gone (b3690eb68 class).`);
    return problems;
  }
  // The id: "..." literals may live inline in the page, or in an imported shared config file (Drivers.tsx
  // extracted DRIVERS_LIST_STATUS_TABS this way) — check the combined text either way.
  const combinedCode = code + "\n" + alsoSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const chips = segmentedControlBlocks(code);
  for (const id of required) {
    // the tab entries are object literals: { id: "active", label: `Active (${...})` } — or chip options
    // { value: "active", label: "Active" } inside a <SegmentedControl>.
    const re = new RegExp(String.raw`id:\s*"${id}"`);
    const chipRe = new RegExp(String.raw`value:\s*"${id}"`);
    if (!re.test(combinedCode) && !chipRe.test(chips)) {
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

  // `also` path (Drivers.tsx's extracted-config shape): the page has <SecondaryNavTabs> but no
  // inline id: "..." literals — the ids live in a separate imported config source instead.
  const configOnly = `<SecondaryNavTabs tabs={DRIVERS_LIST_STATUS_TABS.map((t) => ({ id: t.id }))} />`;
  const configSrc = `export const DRIVERS_LIST_STATUS_TABS = [{ id: "all" }, { id: "active" }, { id: "inactive" }];`;
  const alsoCases = [
    ["also-file supplies all 3 ids", configOnly, configSrc, 0],
    ["also-file missing an id — must still be caught", configOnly, configSrc.replace(', { id: "inactive" }', ""), 1],
    ["also-file empty (page has no ids anywhere) — must still be caught", configOnly, "", 3],
  ];
  for (const [name, src, alsoSrc, want] of alsoCases) {
    const got = assertSegmentTabs(src, "test.tsx", ["all", "active", "inactive"], alsoSrc).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }

  // 443.99 — the SegmentedControl chip shape (Customers / Vendors today).
  const chipGood = `<SegmentedControl value={s} onChange={set} options={[\n { value: "active", label: "Active" },\n { value: "inactive", label: "Inactive" },\n { value: "all", label: "All" },\n]} />`;
  const chipCases = [
    ["chip set with all three values", chipGood, 0],
    ["chip set lost inactive", chipGood.replace('{ value: "inactive", label: "Inactive" },', ""), 1],
    ["value literals outside any SegmentedControl do not count", `<NavyPageSubNav tabs={T} />\nconst opts = [{ value: "all" }, { value: "active" }, { value: "inactive" }];`, 3],
    ["chip control deleted entirely", "const x = 1;", 1],
  ];
  for (const [name, src, want] of chipCases) {
    const got = assertSegmentTabs(src, "test.tsx", ["all", "active", "inactive"]).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }

  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length + alsoCases.length + chipCases.length} mutations detected correctly`);
  process.exit(0);
}

const problems = [];
for (const { file, required, also } of SEGMENT_PAGES) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    problems.push(`${file}: missing — refusing to pass vacuously.`);
    continue;
  }
  const alsoSrc = (also || [])
    .map((rel) => {
      const alsoAbs = path.join(ROOT, rel);
      if (!fs.existsSync(alsoAbs)) {
        problems.push(`${file}: also-file ${rel} missing — refusing to pass vacuously.`);
        return "";
      }
      return fs.readFileSync(alsoAbs, "utf8");
    })
    .join("\n");
  problems.push(...assertSegmentTabs(fs.readFileSync(abs, "utf8"), file, required, alsoSrc));
}
if (problems.length) {
  console.error(`${LABEL} FAIL — a §7 list segment tab set was removed:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${SEGMENT_PAGES.length} list pages keep their segment tab set.`);
process.exit(0);
