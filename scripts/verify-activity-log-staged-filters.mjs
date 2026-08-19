#!/usr/bin/env node
/**
 * verify-activity-log-staged-filters
 * LV-ADMIN-ACTIVITY-LOG-FILTER-NO-CANCEL — Activity Log must stage filters via
 * useStagedListFilters with Apply + Cancel + Reset; query keys applied (not draft).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-activity-log-staged-filters";
const TARGET = "apps/frontend/src/pages/admin/ActivityLogPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="activity-log-filter-cancel"')) errors.push("must expose activity-log-filter-cancel");
  if (!src.includes('data-testid="activity-log-filter-apply"')) errors.push("must expose activity-log-filter-apply");
  if (!src.includes("activity-log-filters")) errors.push("must keep activity-log-filters chrome");
  if (!/queryKey[\s\S]*applied\.actorUserId/.test(src)) errors.push("queryKey must use applied.*");
  if (/setActorUserId|setAction\(|setEntityType|setSince\(/.test(src) && !src.includes("useStagedListFilters")) {
    errors.push("must not keep hand-rolled draft state without useStagedListFilters");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [actorUserId, setActorUserId] = useState("");
    const [applied, setApplied] = useState({});
    <button onClick={() => setApplied({ actorUserId })}>Apply filters</button>
    <button onClick={() => { setActorUserId(""); setApplied({}); }}>Reset</button>
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: ["admin-activity", applied.actorUserId, applied.action, applied.entityType, applied.since],
    <div data-testid="activity-log-filters" />
    <button data-testid="activity-log-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="activity-log-filter-cancel" onClick={staged.cancel}>Cancel</button>
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPage(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Activity Log staged filters with Apply/Cancel/Reset`);
