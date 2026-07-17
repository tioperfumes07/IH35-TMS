#!/usr/bin/env node
/**
 * verify-crm-url-sort.mjs — BANK-SORT-ROLLOUT-CRM CI guard
 *
 * Locks: legacy master-detail roster pages `/customers` (Customers.tsx) and `/vendors`
 * (Vendors.tsx) persist the sidebar "Sort by name" / "Sort by name (Z-A)" control in the URL
 * via the shared `useUrlSort` hook (?sort=name&dir=asc|desc) — same contract the accounting
 * twins (CustomersListView / VendorsListView) shipped under BANK-SORT-ROLLOUT-ACCT (#2609).
 *
 * ROOT CAUSE guarded: those pages held name-sort in local useState, so a reload / shared link
 * always reset to A→Z and diverged from the accounting list-view twins that already URL-persist.
 *
 * Self-test: node scripts/verify-crm-url-sort.mjs --selftest
 * LINKAGE: FE-only roster UX — no schema, no GL, no banking money.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-crm-url-sort";

const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PAGES = [
  { file: "apps/frontend/src/pages/Customers.tsx", label: "Customers" },
  { file: "apps/frontend/src/pages/Vendors.tsx", label: "Vendors" },
];

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

/**
 * Pure check logic so --selftest can plant failures.
 * Returns an array of failure strings (empty = PASS).
 */
export function checkSources({ hookSrc, pages }) {
  const failures = [];

  if (!hookSrc) {
    failures.push(`${HOOK_FILE} — MISSING (required by CRM roster URL-sort wiring)`);
  }

  for (const { file, label, src } of pages) {
    if (!src) {
      failures.push(`${file} — MISSING`);
      continue;
    }
    if (!/from ["'].*useUrlSort["']/.test(src)) {
      failures.push(`${file} (${label}) — must import useUrlSort from the shared hook`);
    }
    if (!/useUrlSort\s*\(/.test(src)) {
      failures.push(`${file} (${label}) — must call useUrlSort() to persist sort in the URL`);
    }
    // Local useState for name sort is the regression this block closes.
    if (/useState<\s*["']name_asc["']\s*\|\s*["']name_desc["']\s*>/.test(src)) {
      failures.push(
        `${file} (${label}) — must NOT hold sortByName in local useState; drive it from useUrlSort`,
      );
    }
    if (!/sortKey\s*===\s*["']name["']/.test(src)) {
      failures.push(`${file} (${label}) — must map URL sortKey === "name" onto the name-sort control`);
    }
    if (!/onUrlSortChange\s*\(\s*["']name["']/.test(src) && !/onSortChange\s*\(\s*["']name["']/.test(src)) {
      failures.push(
        `${file} (${label}) — must write sort key "name" back into the URL on sidebar sort change`,
      );
    }
    if (!/name_asc/.test(src) || !/name_desc/.test(src)) {
      failures.push(`${file} (${label}) — must still expose name_asc / name_desc to the sidebar control`);
    }
  }

  return failures;
}

function selftest() {
  const goodHook = "export function useUrlSort() { return {}; }\n";
  const goodPage = `
import { useUrlSort } from "../hooks/useUrlSort";
const { sortKey, sortDirection, onSortChange: onUrlSortChange } = useUrlSort();
const sortByName = sortKey === "name" && sortDirection === "desc" ? "name_desc" : "name_asc";
const setSortByName = (value) => onUrlSortChange("name", value === "name_desc" ? "desc" : "asc");
`;
  const badLocalState = `
const [sortByName, setSortByName] = useState<"name_asc" | "name_desc">("name_asc");
`;
  const badNoHook = `
const sortByName = "name_asc";
const setSortByName = () => {};
`;

  const cases = [
    [
      "clean sources pass",
      checkSources({
        hookSrc: goodHook,
        pages: [
          { file: "Customers.tsx", label: "Customers", src: goodPage },
          { file: "Vendors.tsx", label: "Vendors", src: goodPage },
        ],
      }).length === 0,
    ],
    [
      "planted local useState fails",
      checkSources({
        hookSrc: goodHook,
        pages: [{ file: "Customers.tsx", label: "Customers", src: goodPage + badLocalState }],
      }).length > 0,
    ],
    [
      "planted missing useUrlSort import fails",
      checkSources({
        hookSrc: goodHook,
        pages: [{ file: "Customers.tsx", label: "Customers", src: badNoHook }],
      }).length > 0,
    ],
    [
      "planted missing hook file fails",
      checkSources({
        hookSrc: null,
        pages: [{ file: "Customers.tsx", label: "Customers", src: goodPage }],
      }).length > 0,
    ],
    [
      "planted missing name key write fails",
      checkSources({
        hookSrc: goodHook,
        pages: [
          {
            file: "Vendors.tsx",
            label: "Vendors",
            src: goodPage.replace(/onUrlSortChange\("name"/g, 'onUrlSortChange("other"'),
          },
        ],
      }).length > 0,
    ],
  ];

  const failed = cases.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length} checks)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = checkSources({
  hookSrc: readFile(HOOK_FILE),
  pages: PAGES.map(({ file, label }) => ({ file, label, src: readFile(file) })),
});

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (Customers.tsx + Vendors.tsx — name sort URL-persisted via shared useUrlSort)`,
);
