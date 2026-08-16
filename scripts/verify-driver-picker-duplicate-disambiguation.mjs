#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REGISTRY = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
const ROUTE = "apps/backend/src/mdata/drivers.routes.ts";
const TYPE = "apps/frontend/src/types/api.ts";
const LABEL = "verify-driver-picker-duplicate-disambiguation";

export function audit({ registry, route, type }) {
  const failures = [];
  if (!/sublabel:\s*\[[\s\S]{0,500}d\.phone[\s\S]{0,500}d\.samsara_driver_id/.test(registry)) failures.push("shared driver picker lacks phone + Samsara disambiguation");
  if (!/qbo_class_id,[\s\S]{0,100}samsara_driver_id,[\s\S]{0,100}default_expense_account_id/.test(route)) failures.push("driver roster API does not project samsara_driver_id");
  if (!/samsara_driver_id\?:\s*string\s*\|\s*null/.test(type)) failures.push("Driver contract lacks samsara_driver_id");
  if (/slice\([^)]*-[48]/.test(registry)) failures.push("picker disambiguation must not expose truncated UUIDs");
  return failures;
}

const sources = () => ({ registry: readFileSync(join(ROOT, REGISTRY), "utf8"), route: readFileSync(join(ROOT, ROUTE), "utf8"), type: readFileSync(join(ROOT, TYPE), "utf8") });
if (process.argv.includes("--selftest")) {
  const clean = sources();
  const mutations = [
    { ...clean, registry: clean.registry.replaceAll("d.samsara_driver_id", "null") },
    { ...clean, route: clean.route.replace("            samsara_driver_id,\n", "") },
    { ...clean, type: clean.type.replace("  samsara_driver_id?: string | null;\n", "") },
  ];
  if (mutations.some((m) => audit(m).length === 0) || audit(clean).length) process.exit(1);
  console.log(`${LABEL}: selftest PASS — 3/3 planted defects rejected`);
} else {
  const failures = audit(sources());
  if (failures.length) { failures.forEach((f) => console.error(`${LABEL}: ${f}`)); process.exit(1); }
  console.log(`${LABEL}: PASS — every shared driver picker carries non-UUID duplicate context`);
}
