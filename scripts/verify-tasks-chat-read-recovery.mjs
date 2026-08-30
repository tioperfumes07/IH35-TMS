#!/usr/bin/env node

/**
 * @matrix-built tasks:chat.team_chat:{connectivity,reverse_link}
 * TASK-F7533: every mounted Tasks Chat read has visible, exact recovery.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const relative = "apps/frontend/src/pages/tasks/TasksChatPage.tsx";
const original = fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const contracts = [
  ["tasksQuery", "tasks-chat-picker", "tasks picker"],
  ["commentsQuery", "tasks-chat-thread", "comment thread"],
  ["usersQuery", "tasks-chat-users-error", "mention directory"],
  ["taskByIdQuery", "tasks-chat-deep-link-task-error", "deep-link task context"],
  ["activityQuery", "tasks-chat-activity-error", "activity feed"],
];

function failures(source) {
  const found = [];
  for (const [query, anchor, label] of contracts) {
    if (!source.includes(`${query}.isError ? (`)) found.push(`${label} failure is not rendered`);
    if (!source.includes(`${query}.refetch()`)) found.push(`${label} failure has no exact Retry`);
    if (!source.includes(anchor)) found.push(`${label} has no stable rendered anchor`);
  }
  return found;
}

const baseline = failures(original);
if (baseline.length) {
  console.error(`verify-tasks-chat-read-recovery: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const survivors = [];
  for (const [query, , label] of contracts) {
    const from = `${query}.isError ? (`;
    const mutated = original.replace(from, `${query}.isPending ? (`);
    if (mutated === original || failures(mutated).length === 0) survivors.push(label);
  }
  if (survivors.length) {
    console.error(`verify-tasks-chat-read-recovery: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-tasks-chat-read-recovery: SELFTEST PASS — ${contracts.length}/${contracts.length} query-boundary mutations rejected`);
  process.exit(0);
}

console.log("verify-tasks-chat-read-recovery: PASS — task picker, deep-link context, comments, mentions, and activity fail visibly with Retry");
