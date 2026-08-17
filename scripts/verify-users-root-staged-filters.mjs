#!/usr/bin/env node
/**
 * verify-users-root-staged-filters.mjs
 * LV-USERS-ROOT-FILTER-PANEL-ABSENT — Users root must mount CollapsedListFilters
 * with staged Role filter (Apply/Cancel/Reset), not bare Search-only chrome.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-users-root-staged-filters";
const TARGET = "apps/frontend/src/pages/Users.tsx";

function analyze(src) {
  const failures = [];
  if (!/CollapsedListFilters/.test(src)) {
    failures.push("Users.tsx must mount CollapsedListFilters");
  }
  if (!/useStagedListFilters/.test(src)) {
    failures.push("Users.tsx must use useStagedListFilters");
  }
  if (!/data-testid="users-root-filter-panel"/.test(src)) {
    failures.push('missing data-testid="users-root-filter-panel"');
  }
  if (!/roleFilter/.test(src)) {
    failures.push("must stage/apply a roleFilter");
  }
  if (!/onApply=\{staged\.apply\}/.test(src) || !/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    failures.push("CollapsedListFilters must wire staged.apply / cancel / reset");
  }
  if (!/searchParams\.get\("role"\)/.test(src)) {
    failures.push('applied role must come from URL searchParams "role"');
  }
  if (!/u\.role === roleFilter/.test(src)) {
    failures.push("filteredUsers must apply roleFilter to row.role");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    export function UsersPage() {
      return <ParityTable hidePager />;
    }
  `;
  const good = `
    import { CollapsedListFilters, useStagedListFilters } from "../components/table";
    const roleFilter = (searchParams.get("role") ?? "").trim();
    const staged = useStagedListFilters({ applied: { roleFilter }, empty: { roleFilter: "" }, onApply: () => {} });
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    <div data-testid="users-root-filter-panel">
      <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} />
    </div>
  `;
  if (analyze(bad).length === 0) fail("selftest expected BAD to fail");
  const g = analyze(good);
  if (g.length) fail(`selftest expected GOOD: ${g.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const failures = analyze(src);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Users root staged Role filters`);
