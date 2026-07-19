#!/usr/bin/env node
/**
 * verify-escrow-audittrail-url-sort.mjs — BANK-SORT-ROLLOUT-ACCT CI guard
 *
 * Locks: EscrowPage + AccountingAuditTrailPage — every visible DATA column header is ASC/DESC
 * sortable and the primary list sort persists in the URL via useUrlSort + ParityTable controlled-sort
 * props (Escrow accounts table uses ?sort=&dir=; postings use ?post_sort=&post_dir=).
 *
 * Usage:
 *   node scripts/verify-escrow-audittrail-url-sort.mjs
 *   node scripts/verify-escrow-audittrail-url-sort.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-audittrail-url-sort";
const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PAGES = [
  {
    file: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    label: "Escrow",
    minSortedParityTables: 2,
  },
  {
    file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
    label: "Audit Trail",
    minSortedParityTables: 1,
  },
];
const EXEMPT = new Set(["actions", "action", "delete", "allocate", "expand", "controls"]);

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function findNonSortableDataColumns(source) {
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = source.slice(start, end);
    if (EXEMPT.has(key)) continue;
    if (!/label\s*:/.test(block)) continue;
    if (!/sortable\s*:\s*true/.test(block)) offenders.push(key);
  }
  return offenders;
}

function countParityTablesWithControlledSort(source) {
  const blocks = source.match(/<ParityTable[\s\S]*?\/>/g) ?? [];
  return blocks.filter(
    (b) => /sortKey=\{/.test(b) && /sortDirection=\{/.test(b) && /onSortChange=\{/.test(b),
  ).length;
}

export function escrowAuditTrailUrlSortErrors({ hookSrc, pages }) {
  const failures = [];
  if (!hookSrc) failures.push(`${HOOK_FILE} — MISSING`);
  else if (!/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK_FILE} — must export useUrlSort`);

  for (const page of pages) {
    const pageSrc = page.pageSrc;
    if (!pageSrc) {
      failures.push(`${page.file} — MISSING`);
      continue;
    }
    if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${page.file} — must import useUrlSort`);
    if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${page.file} — must call useUrlSort()`);
    const sortedTables = countParityTablesWithControlledSort(pageSrc);
    if (sortedTables < page.minSortedParityTables) {
      failures.push(
        `${page.file} — need ${page.minSortedParityTables} ParityTable(s) with sortKey/sortDirection/onSortChange (found ${sortedTables})`,
      );
    }
    const bad = findNonSortableDataColumns(pageSrc);
    if (bad.length) failures.push(`${page.file} — data column(s) missing sortable: true: ${bad.join(", ")}`);
  }
  return failures;
}

function selftest() {
  const goodHook = `export function useUrlSort() { useSearchParams(); }`;
  const goodEscrow = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    useUrlSort();
    useUrlSort({ key: "post_sort", dir: "post_dir" });
    columns={[{ key: "holder_type", label: "Type", sortable: true }]}
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
    <ParityTable sortKey={postingSortKey} sortDirection={postingSortDirection} onSortChange={onPostingSortChange} />
  `;
  const goodAudit = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, sortDirection, onSortChange } = useUrlSort();
    { key: "occurred_at", label: "Occurred", sortable: true }
    { key: "event_class", label: "Event", sortable: true }
    { key: "actions", label: "Actions" }
    <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
  `;
  const pages = [
    { file: PAGES[0].file, label: "Escrow", minSortedParityTables: 2, pageSrc: goodEscrow },
    { file: PAGES[1].file, label: "Audit Trail", minSortedParityTables: 1, pageSrc: goodAudit },
  ];
  const goodErrors = escrowAuditTrailUrlSortErrors({ hookSrc: goodHook, pages });
  const planted = [
    ["escrow no hook", { hookSrc: goodHook, pages: [{ ...pages[0], pageSrc: goodEscrow.replace(/useUrlSort\s*\(/g, "noop(") }, pages[1]] }, "must call useUrlSort()"],
    ["audit missing sortable", { hookSrc: goodHook, pages: [pages[0], { ...pages[1], pageSrc: goodAudit.replace('label: "Event", sortable: true', 'label: "Event"') }] }, "event_class"],
    ["escrow one table sorted", { hookSrc: goodHook, pages: [{ ...pages[0], pageSrc: goodEscrow.replace(/<ParityTable sortKey=\{postingSortKey\}[\s\S]*?\/>/, "") }, pages[1]] }, "need 2 ParityTable"],
  ];
  const missed = planted.filter(([, fixture, needle]) => !escrowAuditTrailUrlSortErrors(fixture).some((f) => f.includes(needle)));
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const e of goodErrors) console.error(`  good rejected: ${e}`);
    for (const [n] of missed) console.error(`  missed: ${n}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${planted.length} planted regressions caught)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = escrowAuditTrailUrlSortErrors({
  hookSrc: readFile(HOOK_FILE),
  pages: PAGES.map((p) => ({ ...p, pageSrc: readFile(p.file) })),
});
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) failures.length && console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (Escrow + Audit Trail — data columns sortable + URL-persisted via useUrlSort)`);
