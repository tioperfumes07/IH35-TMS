#!/usr/bin/env node
/** FLEET-F6477 — Edit Trailer equipment type uses canonical Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/components/fleet/EditTrailerModal.tsx";
const source = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(text) {
  if (/<select\s+id="equipment_type"/.test(text)) throw new Error("native equipment-type select returned");
  for (const token of [
    '<Combobox',
    'id="equipment_type"',
    'dataField="equipment_type"',
    'value={draft.equipment_type || "DryVan"}',
    'onChange={(next) => next && set("equipment_type", next)}',
    'patch.equipment_type = draft.equipment_type',
  ]) {
    if (!text.includes(token)) throw new Error(`missing edit-trailer equipment-type contract: ${token}`);
  }
}

if (process.argv.includes("--selftest")) {
  const planted = source.replace('dataField="equipment_type"', 'data-orphaned="equipment_type"');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, FLEET_F6477_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted broken dataField stayed green");
  console.log("verify-edit-trailer-equipment-type-combobox --selftest PASS");
  process.exit(0);
}

const candidate = process.env.FLEET_F6477_PLANTED_SOURCE ?? source;
assertContract(candidate);
console.log("verify-edit-trailer-equipment-type-combobox PASS — edit type uses shared Combobox and preserves PATCH enum");
