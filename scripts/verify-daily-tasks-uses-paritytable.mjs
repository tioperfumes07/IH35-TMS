#!/usr/bin/env node
/**
 * Locks the Daily Tasks list to shared ParityTable grammar and a retryable
 * query-error state. The original six columns and row test IDs must remain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-daily-tasks-uses-paritytable";
const PAGE = "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx";
const SERVICE = "apps/backend/src/daily-tasks/daily-tasks.service.ts";
const API = "apps/frontend/src/api/dailyTasks.ts";
const REQUIRED_LABELS = ["Task", "Status", "Assignee", "Due", "Timestamps", "Actions"];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function assertMigrated(source, serviceSource = read(SERVICE), apiSource = read(API)) {
  const errors = [];
  if (!source.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!source.includes('from "../../components/ListErrorState"')) {
    errors.push(`${PAGE}: must import ListErrorState`);
  }
  if ((source.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if ((source.match(/<ListErrorState\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected retryable <ListErrorState>`);
  }
  if (/<table[\s>]/.test(source) || /<thead[\s>]/.test(source)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!source.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label: ${label}`);
    }
  }
  if (!source.includes('storageKey="daily-tasks"')) {
    errors.push(`${PAGE}: must set storageKey="daily-tasks"`);
  }
  if (!source.includes('rowTestId={(task) => `task-row-${task.id}`}')) {
    errors.push(`${PAGE}: must preserve task-row data-testid hooks`);
  }
  if (!source.includes("task.is_overdue ?")) {
    errors.push(`${PAGE}: must preserve overdue row highlighting`);
  }
  if (!source.includes('title="Couldn\'t load task activity"') || !source.includes("onRetry={onRetryEvents}")) {
    errors.push(`${PAGE}: task activity failure must be visible and retryable`);
  }
  if (!/Actor:\s*<EntityLink\s+kind="user"\s+id=\{event\.actor_user_id\}\s+label=\{entityLabel\(event\.actor_name,\s*event\.actor_user_id,\s*"User"\)\}\s*\/>/.test(source)) {
    errors.push(`${PAGE}: activity actor must consume the resolved human identity`);
  }
  if (!serviceSource.includes("AS actor_name") || !serviceSource.includes("LEFT JOIN identity.users u ON u.id = e.actor_user_id")) {
    errors.push(`${SERVICE}: task activity must resolve the actor through identity.users`);
  }
  if (!apiSource.includes("actor_name: string | null")) {
    errors.push(`${API}: DailyTaskEvent must type actor_name`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns: ParityColumn<Task>[] = [
      { key: "title", label: "Task" },
      { key: "status", label: "Status" },
      { key: "assignee", label: "Assignee" },
      { key: "due_at", label: "Due" },
      { key: "created_at", label: "Timestamps" },
      { key: "actions", label: "Actions" },
    ];
    export function DailyTasksPage() {
      return <>{task.is_overdue ? "Overdue" : null}<ListErrorState title="Couldn't load task activity" onRetry={onRetryEvents} />Actor: <EntityLink kind="user" id={event.actor_user_id} label={entityLabel(event.actor_name, event.actor_user_id, "User")} /><ParityTable storageKey="daily-tasks" rowTestId={(task) => \`task-row-\${task.id}\`} columns={columns} /></>;
    }
  `;
  const bad = `export function DailyTasksPage() { return <table><thead><tr><th>Task</th></tr></thead></table>; }`;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  const rawActorErrors = assertMigrated(good.replace(
    'Actor: <EntityLink kind="user" id={event.actor_user_id} label={entityLabel(event.actor_name, event.actor_user_id, "User")} />',
    "Actor: {event.actor_user_id}"
  ));
  const noActivityRetryErrors = assertMigrated(good.replace(
    '<ListErrorState title="Couldn\'t load task activity" onRetry={onRetryEvents} />',
    '<div>No activity events yet.</div>'
  ));
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 4) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  if (!rawActorErrors.some((error) => error.includes("activity actor"))) {
    console.error(`${LABEL} --selftest FAIL raw actor mutation survived`);
    process.exit(1);
  }
  const serviceProjectionErrors = assertMigrated(good, read(SERVICE).replace("AS actor_name", "AS actor_uuid"), read(API));
  if (!serviceProjectionErrors.some((error) => error.includes("resolve the actor"))) {
    console.error(`${LABEL} --selftest FAIL actor projection mutation survived`);
    process.exit(1);
  }
  if (!noActivityRetryErrors.some((error) => error.includes("activity failure"))) {
    console.error(`${LABEL} --selftest FAIL activity retry mutation survived`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const source = read(PAGE);
  const errors = assertMigrated(source);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable with ListErrorState; six task columns preserved.`);
}

main();
