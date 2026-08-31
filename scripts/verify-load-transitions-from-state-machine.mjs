#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  canon: "apps/backend/src/dispatch/load-state-machine.ts",
  route: "apps/backend/src/dispatch/loads.routes.ts",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const STATUSES = ["unassigned", "assigned_not_dispatched", "dispatched", "in_transit", "delivered_pending_docs", "completed_docs_received", "cancelled", "abandoned", "driver_walkoff", "driver_no_show"];

function read(rel, overrides) {
  return overrides?.[rel] ?? fs.readFileSync(path.join(root, rel), "utf8");
}

function frontendComponents(overrides) {
  if (overrides) return Object.entries(overrides).filter(([name]) => name.startsWith("apps/frontend/src/") && name.endsWith(".tsx"));
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith(".tsx")) out.push([path.relative(root, absolute), fs.readFileSync(absolute, "utf8")]);
    }
  };
  walk(path.join(root, "apps/frontend/src"));
  return out;
}

export function verify(overrides = null) {
  const errors = [];
  const canon = read(FILES.canon, overrides);
  const route = read(FILES.route, overrides);
  const drawer = read(FILES.drawer, overrides);
  for (const status of STATUSES) {
    if (!canon.includes(`${status}: [`)) errors.push(`missing canonical transition row: ${status}`);
    if (!canon.includes(`${status}: { label: "`)) errors.push(`missing canonical control descriptor: ${status}`);
  }
  if (!route.includes("getAllowedLoadStatusTransitions(String(load.status)).map")) errors.push("detail response is not derived from canonical current-status transitions");
  if (!route.includes("...loadStatusTransitionControls[status]")) errors.push("detail response omits canonical labels/actions");
  if (!drawer.includes("load?.allowed_status_transitions ?? []")) errors.push("drawer does not consume server-derived transitions");
  if (!drawer.includes("allowedStatusTransitions.map((transition)")) errors.push("drawer does not render every allowed transition");
  if (!drawer.includes("new_status: transition.status")) errors.push("drawer mutation is not driven by rendered canonical target");
  if (!drawer.includes("{transition.label}")) errors.push("drawer does not render canonical label");
  const literal = new RegExp(`new_status\\s*:\\s*["'](?:${STATUSES.join("|")})["']`);
  for (const [name, source] of frontendComponents(overrides)) {
    if (literal.test(source)) errors.push(`frontend transition control hardcodes status: ${name}`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.values(FILES).map((file) => [file, read(file)]));
  const plants = [
    ["hardcoded target", { ...base, [FILES.drawer]: base[FILES.drawer].replace("new_status: transition.status", 'new_status: "in_transit"') }],
    ["missing rendered control", { ...base, [FILES.drawer]: base[FILES.drawer].replace("allowedStatusTransitions.map((transition)", "[].map((transition)") }],
    ["route detached from canon", { ...base, [FILES.route]: base[FILES.route].replace("getAllowedLoadStatusTransitions(String(load.status)).map", "[].map") }],
  ];
  const escaped = plants.filter(([, files]) => verify(files).length === 0);
  if (escaped.length) {
    console.error(`verify-load-transitions-from-state-machine selftest FAILED: ${escaped.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-load-transitions-from-state-machine selftest PASS (${plants.length}/${plants.length})`);
  process.exit(0);
}

const errors = verify();
if (errors.length) {
  console.error(`verify-load-transitions-from-state-machine FAIL:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log("verify-load-transitions-from-state-machine PASS — one backend canon drives every drawer transition control");
