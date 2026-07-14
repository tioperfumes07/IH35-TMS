#!/usr/bin/env node
/**
 * verify-qbo-parity-vendors.mjs
 *
 * QBO-PARITY-VENDORS coverage guard (non-financial, display/filter only).
 *
 * Locks two additive QBO-parity surfaces so they can't silently regress:
 *
 *  1. Vendor LIST view (apps/frontend/src/pages/vendors/VendorsListView.tsx) must expose:
 *       - the three filter chips: "Active", "1099-eligible", "With open" (inside the
 *         data-vendor-filter-chips container), AND
 *       - the two additive columns: a "1099?" column and a "Status" column keyed on
 *         `deactivated_at`.
 *
 *  2. Vendor DETAIL page (apps/frontend/src/pages/VendorDetail.tsx) must expose a
 *       "W-9 / 1099" tab in the tabs array AND render a matching `activeTab === "W-9 / 1099"`
 *       block titled "W-9 / 1099 Status".
 *
 * Checks run against COMMENT-STRIPPED text so a guard-describing comment can never satisfy
 * — or trip — a check. `--selftest` exercises assertGuard() against inline fixtures
 * (well-formed pass + each failure mode).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-parity-vendors";

const LIST_FILE = "apps/frontend/src/pages/vendors/VendorsListView.tsx";
const DETAIL_FILE = "apps/frontend/src/pages/VendorDetail.tsx";

/** Strip // line comments and block comments so a guard-describing COMMENT can't satisfy a check. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// Each required token is [human-name, RegExp]. All must match the comment-stripped source.
const LIST_REQUIRED = [
  ["filter-chips container", /data-vendor-filter-chips\s*=/],
  ["Active chip label", /["']Active["']/],
  ["1099-eligible chip label", /["']1099-eligible["']/],
  ["With open chip label", /["']With open["']/],
  ["1099? column label", /label:\s*["']1099\?["']/],
  ["Status column keyed on deactivated_at", /key:\s*["']deactivated_at["']/],
  ["Status column label", /label:\s*["']Status["']/],
];

const DETAIL_REQUIRED = [
  ["W-9 / 1099 tab in tabs array", /const tabs\s*=\s*\[[^\]]*["']W-9 \/ 1099["'][^\]]*\]/],
  ["W-9 / 1099 activeTab render block", /activeTab\s*===\s*["']W-9 \/ 1099["']/],
  ["W-9 / 1099 Status panel title", /W-9 \/ 1099 Status/],
];

/**
 * Pure evaluation.
 * @param {{ list: string, detail: string }} sources — raw file text (comments stripped inside)
 * @returns {string[]} errors
 */
export function assertGuard({ list, detail }) {
  const errors = [];
  const listCode = stripComments(list ?? "");
  const detailCode = stripComments(detail ?? "");

  if (!listCode) errors.push(`missing:${LIST_FILE}`);
  if (!detailCode) errors.push(`missing:${DETAIL_FILE}`);

  for (const [name, re] of LIST_REQUIRED) {
    if (listCode && !re.test(listCode)) errors.push(`${LIST_FILE}: missing ${name}`);
  }
  for (const [name, re] of DETAIL_REQUIRED) {
    if (detailCode && !re.test(detailCode)) errors.push(`${DETAIL_FILE}: missing ${name}`);
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const goodList = `
    <div data-vendor-filter-chips="true">
      {[
        { key: "active", label: "Active" },
        { key: "1099", label: "1099-eligible" },
        { key: "with-open", label: "With open" },
      ]}
    </div>
    columns={[
      { key: "created_at", label: "Created" },
      { key: "eligible_1099", label: "1099?" },
      { key: "deactivated_at", label: "Status" },
    ]}
  `;
  const goodDetail = `
    const tabs = ["Profile", "A/P", "Documents", "Audit History", "Tasks", "W-9 / 1099"] as const;
    {activeTab === "W-9 / 1099" ? (<DataPanel title="W-9 / 1099 Status" />) : null}
  `;

  const cases = [
    {
      name: "well-formed list + detail → 0 errors",
      in: { list: goodList, detail: goodDetail },
      want: 0,
    },
    {
      name: "list missing 1099? column → >=1 error",
      in: { list: goodList.replace(/label: "1099\?"/, 'label: "1099x"'), detail: goodDetail },
      wantMin: 1,
    },
    {
      name: "list missing filter-chips container → >=1 error",
      in: { list: goodList.replace(/data-vendor-filter-chips="true"/, ""), detail: goodDetail },
      wantMin: 1,
    },
    {
      name: "list missing 'With open' chip → >=1 error",
      in: { list: goodList.replace(/label: "With open"/, 'label: "Overdue"'), detail: goodDetail },
      wantMin: 1,
    },
    {
      name: "list missing Status/deactivated_at column → >=1 error",
      in: { list: goodList.replace(/key: "deactivated_at", label: "Status"/, 'key: "updated_at", label: "Last"'), detail: goodDetail },
      wantMin: 1,
    },
    {
      name: "detail missing W-9 / 1099 tab → >=1 error",
      in: { list: goodList, detail: goodDetail.replace(/, "W-9 \/ 1099"/, "") },
      wantMin: 1,
    },
    {
      name: "detail missing render block → >=1 error",
      in: { list: goodList, detail: goodDetail.replace(/activeTab === "W-9 \/ 1099"/, 'activeTab === "Other"') },
      wantMin: 1,
    },
    {
      name: "a COMMENT mentioning the tokens does NOT satisfy the checks",
      in: {
        list: `// data-vendor-filter-chips label: "1099?" label: "Status" key: "deactivated_at" "Active" "1099-eligible" "With open"`,
        detail: `// "W-9 / 1099" activeTab === "W-9 / 1099" W-9 / 1099 Status`,
      },
      wantMin: 1,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertGuard({ list: read(LIST_FILE), detail: read(DETAIL_FILE) });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Vendors list has 1099?/Status columns + Active/1099-eligible/With-open chips; VendorDetail has the W-9 / 1099 tab.`);
