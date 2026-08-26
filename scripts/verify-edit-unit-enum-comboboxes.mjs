#!/usr/bin/env node
/** FLEET-F6478 — Edit Unit enum fields share canonical Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

const EXPECTED_SELECT_FIELDS = ["operation_country", "title_status", "transferred_to_entity", "status", "quick_availability"];

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to EditVehicleModal");
  for (const key of EXPECTED_SELECT_FIELDS) {
    const field = new RegExp(`key: ["']${key}["'][^\\n]+type: ["']select["']`);
    if (!field.test(source)) throw new Error(`missing governed enum field ${key}`);
  }
  for (const token of [
    '<Combobox',
    'id={def.key}',
    'dataField={def.key}',
    'options={def.options}',
    'value={String(value) || null}',
    'onChange={(next) => setField(def.key, next ?? "")}',
    'allowClear',
    'patch[def.key] = parseFieldValue(draft[def.key], def.type)',
  ]) {
    if (!source.includes(token)) throw new Error(`missing Edit Unit enum contract: ${token}`);
  }
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace('onChange={(next) => setField(def.key, next ?? "")}', 'onChange={() => {}}');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, FLEET_F6478_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted disconnected enum picker stayed green");
  console.log("verify-edit-unit-enum-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract(process.env.FLEET_F6478_PLANTED_SOURCE ?? diskSource);
console.log(`verify-edit-unit-enum-comboboxes PASS — ${EXPECTED_SELECT_FIELDS.length} enum fields use shared Combobox with PATCH semantics`);
