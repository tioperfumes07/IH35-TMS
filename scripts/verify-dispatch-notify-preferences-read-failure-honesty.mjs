#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","connectivity"],"leaves":["settings.notify"],"task":"DSP-F7091-NOTIFY-PREFERENCES-READ-FAILURE-HONESTY","vertical":"class-sweep"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx";
const read = () => fs.readFileSync(FILE, "utf8");

export function audit(source = read()) {
  const failures = [];
  for (const token of [
    "customerId && prefsQuery.isError",
    "Couldn't load notification preferences",
    "onRetry={() => void prefsQuery.refetch()}",
  ]) if (!source.includes(token)) failures.push(`notify-preferences read failure honesty missing ${token}`);
  if (!/customerId && prefsQuery\.isError[\s\S]{0,500}<ListErrorState/.test(source)) failures.push("preferences query error must render ListErrorState only for a selected customer");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const source = read();
  const mutations = [
    source.replace("customerId && prefsQuery.isError", "customerId && false"),
    source.replace("Couldn't load notification preferences", "Notification preferences"),
    source.replace("onRetry={() => void prefsQuery.refetch()}", "onRetry={() => undefined}"),
  ];
  for (const [index, mutant] of mutations.entries()) {
    if (mutant === source) throw new Error(`mutation ${index + 1} was inert`);
    if (audit(mutant).length === 0) throw new Error(`mutation ${index + 1} survived`);
  }
  console.log(`verify-dispatch-notify-preferences-read-failure-honesty SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`verify-dispatch-notify-preferences-read-failure-honesty FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dispatch-notify-preferences-read-failure-honesty PASS — selected-customer preference failure is explicit and retryable");
