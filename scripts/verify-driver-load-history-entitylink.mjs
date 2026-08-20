#!/usr/bin/env node
/**
 * verify-driver-load-history-entitylink.mjs
 *
 * entitylink-driver-load-history (GATED-no):
 * Driver Load History + Dispatch Assignment History must:
 *  1. Expose previous_driver_id / new_driver_id from the assignment-history API
 *  2. Render the canonical load link and nullable related identities through
 *     EntityLinkOrTombstone (not dead links / plain text / ad-hoc Link)
 *  3. Surface query failures via ListErrorState (not false-empty)
 *
 * Rule 17 — verify-step only (no package.json / locked-guards / ci.yml).
 *
 * Usage:
 *   node scripts/verify-driver-load-history-entitylink.mjs
 *   node scripts/verify-driver-load-history-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-load-history-entitylink";

const FILES = {
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  api: "apps/frontend/src/api/dispatch.ts",
  loadHistory: "apps/frontend/src/components/drivers/LoadHistoryTab.tsx",
  assignmentHistory: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
};

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(sources) {
  const failures = [];
  const { service, api, loadHistory, assignmentHistory } = sources;

  if (!service) failures.push(`${FILES.service}: missing`);
  else {
    if (!/h\.previous_driver_id/.test(service) || !/h\.new_driver_id/.test(service)) {
      failures.push(`${FILES.service}: listAssignmentHistoryGlobal SELECT must return previous_driver_id + new_driver_id`);
    }
  }

  if (!api) failures.push(`${FILES.api}: missing`);
  else {
    if (!/previous_driver_id:\s*string\s*\|\s*null/.test(api) || !/new_driver_id:\s*string\s*\|\s*null/.test(api)) {
      failures.push(`${FILES.api}: DispatchAssignmentHistoryRow must type previous_driver_id + new_driver_id`);
    }
  }

  if (!loadHistory) failures.push(`${FILES.loadHistory}: missing`);
  else {
    if (!/listDriverAssignedLoads/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: must call listDriverAssignedLoads (canonical assigned-loads reverse)`);
    }
    if (!/EntityLink/.test(loadHistory) || !/kind\s*=\s*["']load["']/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: must render EntityLink kind="load"`);
    }
    if (!/kind\s*=\s*["']driver["']/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: must render EntityLink kind="driver"`);
    }
    if (!/kind\s*=\s*["']customer["']/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: assigned loads must EntityLink kind="customer"`);
    }
    if (!/kind\s*=\s*["']unit["']/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: assigned loads must EntityLink kind="unit"`);
    }
    const nullableRelations = [
      ["assigned-load customer", /<EntityLinkOrTombstone\s+kind="customer"\s+id=\{row\.customer_id\}\s+name=\{row\.customer_name\}\s+noun="Customer"/],
      ["assigned-load unit", /<EntityLinkOrTombstone\s+kind="unit"\s+id=\{row\.assigned_unit_id\}\s+name=\{row\.assigned_unit_number\}\s+noun="Unit"/],
      ["previous driver", /<EntityLinkOrTombstone\s+kind="driver"\s+id=\{row\.previous_driver_id\}\s+name=\{row\.previous_driver_name\}\s+noun="Driver"/],
      ["new driver", /<EntityLinkOrTombstone\s+kind="driver"\s+id=\{row\.new_driver_id\}\s+name=\{row\.new_driver_name\}\s+noun="Driver"/],
    ];
    for (const [relation, pattern] of nullableRelations) {
      if (!pattern.test(loadHistory)) {
        failures.push(`${FILES.loadHistory}: ${relation} must use EntityLinkOrTombstone with its canonical id + human label`);
      }
    }
    if (!/previous_driver_id/.test(loadHistory) || !/new_driver_id/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: must wire previous_driver_id + new_driver_id into EntityLink`);
    }
    if (!/ListErrorState/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: must use ListErrorState on query failure`);
    }
    if (/!historyQ\.isLoading && rows\.length === 0/.test(loadHistory) && !/!historyQ\.isError/.test(loadHistory)) {
      failures.push(`${FILES.loadHistory}: empty state must not render on isError (false-empty)`);
    }
  }

  if (!assignmentHistory) failures.push(`${FILES.assignmentHistory}: missing`);
  else {
    if (!/EntityLink/.test(assignmentHistory) || !/kind\s*=\s*["']load["']/.test(assignmentHistory)) {
      failures.push(`${FILES.assignmentHistory}: must render EntityLink kind="load"`);
    }
    if (!/kind\s*=\s*["']driver["']/.test(assignmentHistory)) {
      failures.push(`${FILES.assignmentHistory}: must render EntityLink kind="driver"`);
    }
    if (!/ListErrorState/.test(assignmentHistory)) {
      failures.push(`${FILES.assignmentHistory}: must use ListErrorState on query failure`);
    }
    if (/to=\{`\/dispatch\?load_id=/.test(assignmentHistory) || /to="\/dispatch\?load_id=/.test(assignmentHistory)) {
      failures.push(`${FILES.assignmentHistory}: must not use ad-hoc /dispatch?load_id= Link — use EntityLink`);
    }
  }

  return failures;
}

export function run() {
  const sources = {};
  for (const [key, rel] of Object.entries(FILES)) {
    try {
      sources[key] = fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      sources[key] = null;
    }
  }
  return check(sources);
}

function selftest() {
  const good = {
    service: `SELECT h.id, h.load_id, h.previous_driver_id, h.new_driver_id FROM dispatch.load_assignment_history h`,
    api: `export type DispatchAssignmentHistoryRow = { previous_driver_id: string | null; new_driver_id: string | null; };`,
    loadHistory: `
      import { ListErrorState } from "../ListErrorState";
      import { EntityLink } from "../shared/EntityLink";
      import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
      import { listDriverAssignedLoads } from "../../api/mdata";
      {historyQ.isError ? <ListErrorState title="x" status={0} onRetry={() => {}} /> : null}
      {!historyQ.isLoading && !historyQ.isError && rows.length === 0 ? <p>empty</p> : null}
      <EntityLink kind="load" id={row.load_id} />
      <EntityLinkOrTombstone kind="driver" id={row.previous_driver_id} name={row.previous_driver_name} noun="Driver" />
      <EntityLinkOrTombstone kind="driver" id={row.new_driver_id} name={row.new_driver_name} noun="Driver" />
      <EntityLinkOrTombstone kind="customer" id={row.customer_id} name={row.customer_name} noun="Customer" />
      <EntityLinkOrTombstone kind="unit" id={row.assigned_unit_id} name={row.assigned_unit_number} noun="Unit" />
    `,
    assignmentHistory: `
      import { ListErrorState } from "../../components/ListErrorState";
      import { EntityLink } from "../../components/shared/EntityLink";
      {historyQ.isError ? <ListErrorState title="x" status={0} onRetry={() => {}} /> : <ParityTable />}
      <EntityLink kind="load" id={row.load_id} />
      <EntityLink kind="driver" id={row.previous_driver_id} />
      <EntityLink kind="driver" id={row.new_driver_id} />
    `,
  };
  const bad = {
    service: `SELECT h.id, h.load_id FROM dispatch.load_assignment_history h`,
    api: `export type DispatchAssignmentHistoryRow = { load_id: string };`,
    loadHistory: `
      {historyQ.isError ? <p>Unable to load</p> : null}
      {!historyQ.isLoading && rows.length === 0 ? <p>empty</p> : null}
      <td>{row.load_number ?? row.load_id}</td>
      <td>{row.previous_driver_name ?? "—"}</td>
    `,
    assignmentHistory: `
      <Link to={\`/dispatch?load_id=\${encodeURIComponent(row.load_id)}\`}>{row.load_number}</Link>
      <ParityTable emptyText="No assignment history for current filters." />
    `,
  };

  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    console.error(check(good));
    process.exit(1);
  }
  if (!check(bad).length) {
    console.error(`${LABEL} SELFTEST FAILED — bad fixture accepted`);
    process.exit(1);
  }
  const nullableMutations = [
    ["customer dead drill", good.loadHistory.replace("<EntityLinkOrTombstone kind=\"customer\"", "<EntityLink kind=\"customer\"")],
    ["unit dead drill", good.loadHistory.replace("<EntityLinkOrTombstone kind=\"unit\"", "<EntityLink kind=\"unit\"")],
    ["previous-driver dead drill", good.loadHistory.replace("<EntityLinkOrTombstone kind=\"driver\" id={row.previous_driver_id}", "<EntityLink kind=\"driver\" id={row.previous_driver_id}")],
    ["new-driver dead drill", good.loadHistory.replace("<EntityLinkOrTombstone kind=\"driver\" id={row.new_driver_id}", "<EntityLink kind=\"driver\" id={row.new_driver_id}")],
  ];
  for (const [name, loadHistory] of nullableMutations) {
    if (!check({ ...good, loadHistory }).some((failure) => failure.includes("EntityLinkOrTombstone"))) {
      console.error(`${LABEL} SELFTEST FAILED — ${name} mutation survived`);
      process.exit(1);
    }
  }
  console.log(`${LABEL}: selftest PASS — ${nullableMutations.length} nullable-relation mutations detected`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — LoadHistory + AssignmentHistory EntityLink + ListErrorState`);
}

main();
