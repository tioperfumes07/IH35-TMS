#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rel = "apps/frontend/src/pages/driver/DriverOnboardingTour.tsx";
const source = fs.readFileSync(path.join(process.cwd(), rel), "utf8");

function failures(src) {
  const required = [
    ["canonical completion writer remains", "await patchDriverOnboarding({ complete: true })"],
    ["successful completion refreshes profile", 'await qc.invalidateQueries({ queryKey: ["driver", "me"] })'],
    ["completion error state exists", "const [completionError, setCompletionError]"],
    ["failure preserves backend detail", 'userFacingApiError(error, "Could not save tour completion.")'],
    ["failure is an accessible alert", '<div role="alert"'],
    ["retry calls the same canonical writer", "onClick={() => void persistCompletion()}"],
    ["retry has an exact operator label", '"Retry saving completion"'],
    ["finish delegates to durable helper", "void persistCompletion()"],
  ];
  if (/catch\s*\{\s*\/\*\s*ignore\s*\*\//s.test(src)) required.push(["silent catch retired", "__forbidden_silent_ignore__"]);
  return required.filter(([, needle]) => !src.includes(needle)).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drop profile refresh", 'await qc.invalidateQueries({ queryKey: ["driver", "me"] })', "void 0"],
    ["drop error message", 'userFacingApiError(error, "Could not save tour completion.")', '""'],
    ["drop accessible alert", '<div role="alert"', "<div"],
    ["disconnect retry", "onClick={() => void persistCompletion()}", "onClick={() => undefined}"],
  ];
  const missed = mutations.filter(([, from, to]) => failures(source.replace(from, to)).length === 0);
  if (missed.length) {
    console.error(`verify-driver-onboarding-completion-fail-loud SELFTEST FAILED: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-driver-onboarding-completion-fail-loud selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-driver-onboarding-completion-fail-loud FAILED:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-driver-onboarding-completion-fail-loud PASS — tour completion is durable, fail-loud, and retryable");
