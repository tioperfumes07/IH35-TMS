#!/usr/bin/env node
/** DRV-F6333 — Driver prompt writes fail visibly and snooze only after persisted dismissal. */
import fs from "node:fs";

const arrival = fs.readFileSync("apps/frontend/src/pages/driver/ArrivalPrompt.tsx", "utf8");
const status = fs.readFileSync("apps/frontend/src/pages/driver/StatusSuggestionPrompt.tsx", "utf8");

function audit(a, s) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/confirmMutation[\s\S]*onError:[\s\S]*Failed to confirm arrival/.test(a), "arrival confirm failure must be visible");
  need(/dismissMutation[\s\S]*onSuccess: \(_result, promptId\)[\s\S]*setSnoozedUntilByPrompt/.test(a), "dismiss snooze must occur only after success");
  need(/dismissMutation[\s\S]*onError:[\s\S]*Failed to dismiss arrival check/.test(a), "arrival dismiss failure must be visible");
  need(!/onClick=\{\(\) => \{[\s\S]{0,180}setSnoozedUntilByPrompt/.test(a), "click handler must not snooze before persistence");
  need(/respondMutation[\s\S]*onError:[\s\S]*Failed to respond to status suggestion/.test(s), "status response failure must be visible");
  need((a.match(/role="alert"/g) ?? []).length === 1 && (s.match(/role="alert"/g) ?? []).length === 1, "both prompts need accessible errors");
  need((`${a}\n${s}`.match(/error instanceof Error \? error\.message/g) ?? []).length === 3, "all writes must preserve backend detail");
  return failures;
}

const failures = audit(arrival, status);
if (failures.length) {
  console.error(`verify-driver-prompt-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [arrival.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to confirm arrival"\),/, ""), status],
    [arrival.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to dismiss arrival check"\),/, ""), status],
    [arrival.replace("onSuccess: (_result, promptId)", "onSuccess: ()"), status],
    [arrival, status.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to respond to status suggestion"\),/, "")],
    [arrival.replace(/\{mutationError \? <p role="alert"[^\n]+/, ""), status],
    [arrival, status.replace(/\{mutationError \? <p role="alert"[^\n]+/, "")],
    [arrival.replaceAll("error instanceof Error ? error.message", '"Request failed"'), status.replaceAll("error instanceof Error ? error.message", '"Request failed"')],
  ];
  for (const [index, [a, s]] of mutations.entries()) {
    if ((a === arrival && s === status) || audit(a, s).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-prompt-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-prompt-visible-errors PASS — prompt writes fail visibly and dismissal snooze follows success");
