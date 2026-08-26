#!/usr/bin/env node
/** FLEET-F6492 — CreateUnit/CreateTrailer company Comboboxes are label-associated. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  unit: fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/fleet/CreateUnitModal.tsx"), "utf8"),
  trailer: fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/fleet/CreateTrailerModal.tsx"), "utf8"),
};

function assertContract(source) {
  const current = JSON.parse(source);
  const checks = [
    [current.unit, 'name="owner_company_id"', 'id="owner_company_id"', 'dataTestId="fleet-create-unit-owner-company"'],
    [current.unit, 'name="currently_leased_to_company_id"', 'id="currently_leased_to_company_id"', 'dataTestId="fleet-create-unit-leased-to-company"'],
    [current.trailer, 'name="currently_leased_to_company_id"', 'id="currently_leased_to_company_id"', 'dataTestId="fleet-create-trailer-leased-to-company"'],
  ];
  for (const [body, name, id, testId] of checks) {
    if (!body.includes(name) || !body.includes(id) || !body.includes(testId)) throw new Error(`orphaned fleet creator company control: ${testId}`);
  }
  for (const [body, token] of [
    [current.unit, 'set("owner_company_id", v ?? "")'],
    [current.unit, 'set("currently_leased_to_company_id", v ?? "")'],
    [current.trailer, 'set("currently_leased_to_company_id", v ?? "")'],
  ]) if (!body.includes(token)) throw new Error(`fleet creator payload path missing: ${token}`);
}

const serialized = JSON.stringify(files);
if (process.argv.includes("--selftest")) {
  const planted = serialized.replace('id=\\"owner_company_id\\"', 'id=\\"wrong_owner_id\\"');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, FLEET_F6492_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted orphaned Owner Company label stayed green");
  console.log("verify-fleet-creator-company-label-association --selftest PASS");
  process.exit(0);
}

assertContract(process.env.FLEET_F6492_PLANTED_SOURCE ?? serialized);
console.log("verify-fleet-creator-company-label-association PASS — 3 creator company controls associated and payloads preserved");
