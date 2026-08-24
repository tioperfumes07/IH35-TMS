#!/usr/bin/env node
/** FLT-F6324 — Clear-default driver action must be truthful and never fail silently. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/disabled=\{!defaultDriver\?\.id \|\| clearDefault\.isPending\}/.test(text), "clear action must require a default and block duplicate submits");
  need(/loading=\{clearDefault\.isPending\}/.test(text), "clear action must expose pending state");
  need(/clearDefault\.isError/.test(text), "clear failure state must be consumed");
  need(/Couldn&apos;t clear default driver/.test(text), "clear failure must name the failed action");
  need(/role="alert"/.test(text), "clear failure must be announced");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-clear-default-driver-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("!defaultDriver?.id || clearDefault.isPending", "clearDefault.isPending"),
    source.replace("loading={clearDefault.isPending}", "loading={false}"),
    source.replace("clearDefault.isError", "false"),
    source.replace("Couldn&apos;t clear default driver", "Request failed"),
    source.replace('role="alert"', 'role="status"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-clear-default-driver-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-clear-default-driver-visible-errors PASS — clear-default state and failures are visible");
