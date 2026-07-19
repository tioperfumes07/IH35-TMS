#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-posting-lineage-url-sort";
const PAGE = "apps/frontend/src/pages/accounting/PostingLineagePage.tsx";
const HOOK = "apps/frontend/src/hooks/useUrlSort.ts";
const EXEMPT = new Set(["actions", "action", "delete", "allocate", "expand", "controls"]);

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function findNonSortable(source) {
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = source.slice(start, end);
    if (EXEMPT.has(key)) continue;
    if (!/sortable\s*:\s*true/.test(block)) offenders.push(key);
  }
  return offenders;
}

export function errors({ hookSrc, pageSrc }) {
  const failures = [];
  if (!hookSrc || !/export function useUrlSort/.test(hookSrc)) failures.push(`${HOOK} — must export useUrlSort`);
  if (!pageSrc) return [...failures, `${PAGE} — MISSING`];
  if (!/from ["'].*useUrlSort["']/.test(pageSrc)) failures.push(`${PAGE} — must import useUrlSort`);
  if (!/useUrlSort\s*\(/.test(pageSrc)) failures.push(`${PAGE} — must call useUrlSort()`);
  if (!/sortKey=\{sortKey\}/.test(pageSrc)) failures.push(`${PAGE} — sortKey={sortKey}`);
  if (!/sortDirection=\{sortDirection\}/.test(pageSrc)) failures.push(`${PAGE} — sortDirection={sortDirection}`);
  if (!/onSortChange=\{onSortChange\}/.test(pageSrc)) failures.push(`${PAGE} — onSortChange={onSortChange}`);
  const bad = findNonSortable(pageSrc);
  if (bad.length) failures.push(`${PAGE} — missing sortable: true: ${bad.join(", ")}`);
  return failures;
}

function selftest() {
  const good = {
    hookSrc: `export function useUrlSort() {}`,
    pageSrc: `import { useUrlSort } from "../../hooks/useUrlSort";
      const { sortKey, sortDirection, onSortChange } = useUrlSort();
      columns={[{ key: "occurred_at", sortable: true }]}
      <ParityTable sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />`,
  };
  const planted = [
    ["no call", { ...good, pageSrc: good.pageSrc.replace("useUrlSort()", "noop()") }, "must call useUrlSort()"],
    ["no sortKey", { ...good, pageSrc: good.pageSrc.replace("sortKey={sortKey}", "") }, "sortKey={sortKey}"],
  ];
  if (errors(good).length || planted.some(([, f, n]) => !errors(f).some((e) => e.includes(n)))) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}
const failures = errors({ hookSrc: read(HOOK), pageSrc: read(PAGE) });
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK`);
