#!/usr/bin/env node
/**
 * verify-lst-dot-violation-types-list-chrome.mjs
 * DOT Violation Types catalog list must use one outer section frame with a flat border-b filter row —
 * no separate bordered filter card stacked above DataTable's own border (list chrome box-in-box).
 *
 * --selftest exercises pass + nested-filter-card failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/lists/safety/DotViolationTypesListPage.tsx";
const SAFETY_CATALOG_STATUS_PAGES = [
  "apps/frontend/src/pages/lists/safety/SafetyGenericCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/safety/InternalFineReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/safety/DotViolationTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/ComplaintTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CompanyViolationTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CivilFineTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CargoClaimReasonsListPage.tsx",
];
const LABEL = "verify-lst-dot-violation-types-list-chrome";
const FRAME_MARKER = 'data-testid="dot-violation-types-list-frame"';
const NESTED_FILTER_RE = /className="[^"]*rounded-sm border border-gray-200 bg-white p-3[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function listFrameSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(FRAME_MARKER);
  if (marker < 0) return "";
  const sectionStart = body.lastIndexOf("<section", marker);
  if (sectionStart < 0) return body.slice(marker);
  const tail = body.slice(sectionStart);
  const end = tail.indexOf("</section>");
  return end >= 0 ? tail.slice(0, end + "</section>".length) : tail;
}

/** @param {string} section list frame JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing dot-violation-types-list-frame section wrapper`);
    return problems;
  }
  if (!/<section[\s\S]*className="overflow-hidden rounded-sm border border-gray-200 bg-white"/.test(section)) {
    problems.push(`${TARGET}: list root must be a single overflow-hidden section frame`);
  }
  if (!/border-b border-gray-200 bg-gray-50/.test(section)) {
    problems.push(`${TARGET}: filter toolbar must use border-b on the outer section (no inner card)`);
  }
  if (!/\[&>div\]:rounded-none \[&>div\]:border-0/.test(section)) {
    problems.push(`${TARGET}: DataTable shell must strip duplicate outer border inside the section frame`);
  }
  const nestedFilters = section.match(NESTED_FILTER_RE) ?? [];
  if (nestedFilters.length > 0) {
    problems.push(
      `${TARGET}: filter toolbar nests ${nestedFilters.length} standalone bordered white card(s) — flatten to border-b row`,
    );
  }
  return problems;
}

/** Safety catalog list pages must use Combobox status filter, not native SelectCombobox. */
export function collectCatalogStatusFilterProblems(root = ROOT) {
  const problems = [];
  for (const rel of SAFETY_CATALOG_STATUS_PAGES) {
    const filePath = path.join(root, rel);
    if (!fs.existsSync(filePath)) {
      problems.push(`${rel}: missing safety catalog list page`);
      continue;
    }
    const src = fs.readFileSync(filePath, "utf8");
    if (!src.includes("CatalogStatusFilterCombobox")) {
      problems.push(`${rel}: must use CatalogStatusFilterCombobox for status filter`);
    }
    if (/SelectCombobox[\s\S]{0,200}statusFilter|SelectCombobox[\s\S]{0,200}setStatus/.test(src)) {
      problems.push(`${rel}: must not use SelectCombobox for catalog status filter`);
    }
  }
  const shared = path.join(root, "apps/frontend/src/pages/lists/safety/CatalogStatusFilterCombobox.tsx");
  if (!fs.existsSync(shared)) {
    problems.push("CatalogStatusFilterCombobox.tsx: shared status filter component missing");
  }
  return problems;
}

function selftest() {
  const good = `
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="dot-violation-types-list-frame">
        <div className="grid gap-2 border-b border-gray-200 bg-gray-50 p-3 md:grid-cols-3">filters</div>
        <div className="[&>div]:rounded-none [&>div]:border-0">
          <DataTable />
        </div>
      </section>`;

  const badNested = `
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">filters</div>
      <DataTable />`;

  const cases = [
    { name: "flat section + border-b filters → 0 errors", section: good, want: 0 },
    { name: "standalone bordered filter card → fail", section: badNested, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.section).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n[${LABEL}] SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) {
    console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
    process.exit(1);
  }
  const src = fs.readFileSync(filePath, "utf8");
  const problems = collectProblems(listFrameSection(src)).concat(collectCatalogStatusFilterProblems(ROOT));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — DOT Violation Types list is a flat section frame (no box-in-box).`);
}
