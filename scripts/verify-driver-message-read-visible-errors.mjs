#!/usr/bin/env node
/** DRV-F6332 — Driver message read writes must surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[markReadError, setMarkReadError\]/.test(text), "mark-read error state required");
  need(/const markReadMutation[\s\S]*?onMutate: \(\) => setMarkReadError\(null\)/.test(text), "new attempts must clear stale error");
  need(/const markReadMutation[\s\S]*?onError: \(error\)[\s\S]*?Failed to mark message as read/.test(text), "mark-read failure must be visible");
  need(/role="alert"[\s\S]*?\{markReadError\}/.test(text), "mark-read error must render accessibly");
  need(/error instanceof Error \? error\.message/.test(text), "backend detail must be preserved");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-driver-message-read-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setMarkReadError\(error instanceof Error \? error\.message : "Failed to mark message as read"\),/, ""),
    source.replace(/\n    onMutate: \(\) => setMarkReadError\(null\),/, ""),
    source.replace(/\n      \{markReadError \? \([\s\S]*?\n      \) : null\}/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-message-read-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-message-read-visible-errors PASS — mark-read failures are visible");
