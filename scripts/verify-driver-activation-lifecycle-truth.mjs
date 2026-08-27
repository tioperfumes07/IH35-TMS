#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");

function route(source, action) {
  return source.match(new RegExp(`app\\.post\\("/api/v1/mdata/drivers/:id/${action}"[\\s\\S]*?\\n  \\}\\);`))?.[0] ?? "";
}

function failuresFor(source) {
  const deactivate = route(source, "deactivate");
  const reactivate = route(source, "reactivate");
  const checks = [
    ["deactivate pre-read carries canonical company", /SELECT id, operating_company_id, deactivated_at, identity_user_id, status/.test(deactivate)],
    ["deactivate rejects an already inactive driver", /mdata_driver_already_deactivated/.test(deactivate)],
    ["deactivate write is company-active and returned", /UPDATE mdata\.drivers[\s\S]{0,320}operating_company_id = \$3::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}RETURNING id, deactivated_at, status/.test(deactivate)],
    ["deactivate lost CAS stops before identity/audit", /if \(!changedRow\) return \{ error: "mdata_driver_state_changed" as const \};[\s\S]{0,180}identityUserId/.test(deactivate)],
    ["reactivate rejects active and terminated states", /mdata_driver_terminated/.test(reactivate) && /mdata_driver_already_active/.test(reactivate)],
    ["reactivate write is company-inactive and returned", /UPDATE mdata\.drivers[\s\S]{0,320}operating_company_id = \$3::uuid[\s\S]{0,100}deactivated_at IS NOT NULL[\s\S]{0,140}RETURNING id, deactivated_at, status/.test(reactivate)],
    ["reactivate lost CAS stops before identity/audit", /if \(!changedRow\) return \{ error: "mdata_driver_state_changed" as const \};[\s\S]{0,180}identityUserId/.test(reactivate)],
    ["both domain no-ops map to HTTP 409", /"error" in deactivated[\s\S]{0,100}reply\.code\(409\)/.test(deactivate) && /"error" in reactivated[\s\S]{0,100}reply\.code\(409\)/.test(reactivate)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-driver-activation-lifecycle-truth: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("SELECT id, operating_company_id, deactivated_at, identity_user_id, status", "SELECT id, deactivated_at, identity_user_id, status"),
    source.replace('if (oldRow.deactivated_at !== null) return { error: "mdata_driver_already_deactivated" as const };', "void oldRow.deactivated_at;"),
    source.replace("AND operating_company_id = $3::uuid", "AND true"),
    source.replace('if (!changedRow) return { error: "mdata_driver_state_changed" as const };', "void changedRow;"),
    source.replace('if (oldRow.status === "Terminated") return { error: "mdata_driver_terminated" as const };', "void oldRow.status;"),
    source.replace('if (oldRow.deactivated_at === null) return { error: "mdata_driver_already_active" as const };', "void oldRow.deactivated_at;"),
    source.replaceAll("AND operating_company_id = $3::uuid", "AND true"),
    source.replaceAll('if (!changedRow) return { error: "mdata_driver_state_changed" as const };', "void changedRow;"),
  ];
  const missed = mutations.map((mutation, index) => ({ index, failures: failuresFor(mutation) })).filter((entry) => entry.failures.length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL verify-driver-activation-lifecycle-truth: missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-driver-activation-lifecycle-truth: caught ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-driver-activation-lifecycle-truth: deactivate/reactivate mutate one company-scoped source state before identity and audit effects.");
