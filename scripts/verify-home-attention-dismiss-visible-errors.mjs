#!/usr/bin/env node
/** HOME-F6335 — Today's Attention dismiss writes must surface failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/home/TodaysAttentionTop5.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[dismissError, setDismissError\]/.test(text), "dismiss error state required");
  need(/dismissMutation[\s\S]*onMutate: \(\) => setDismissError\(null\)/.test(text), "dismiss attempt must clear stale error");
  need(/dismissMutation[\s\S]*onError: \(error\)[\s\S]*Failed to dismiss attention item/.test(text), "dismiss failure must be visible");
  need(/role="alert"[\s\S]*\{dismissError\}/.test(text), "dismiss error must render accessibly");
  need(/error instanceof Error \? error\.message/.test(text), "backend detail must be preserved");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-home-attention-dismiss-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setDismissError\(error instanceof Error \? error\.message : "Failed to dismiss attention item"\),/, ""),
    source.replace(/\n    onMutate: \(\) => setDismissError\(null\),/, ""),
    source.replace(/\n        \{dismissError \? <p role="alert"[^\n]+/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-home-attention-dismiss-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-home-attention-dismiss-visible-errors PASS — dismiss failures are visible");
