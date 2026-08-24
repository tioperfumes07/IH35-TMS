#!/usr/bin/env node
/** TASK-F6336 — Team Chat comment writes must surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/tasks/TasksChatPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[commentError, setCommentError\]/.test(text), "comment error state required");
  need(/createMutation[\s\S]*onMutate: \(\) => setCommentError\(null\)/.test(text), "new comment attempt must clear stale error");
  need(/createMutation[\s\S]*onError: \(error\)[\s\S]*Failed to post comment/.test(text), "comment failure must be visible");
  need(/role="alert"[\s\S]*\{commentError\}/.test(text), "comment error must render accessibly");
  need(/error instanceof Error \? error\.message/.test(text), "backend detail must be preserved");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-tasks-chat-comment-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setCommentError\(error instanceof Error \? error\.message : "Failed to post comment"\),/, ""),
    source.replace(/\n    onMutate: \(\) => setCommentError\(null\),/, ""),
    source.replace(/\n                  \{commentError \? <p role="alert"[^\n]+/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-tasks-chat-comment-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-tasks-chat-comment-visible-errors PASS — comment failures are visible");
