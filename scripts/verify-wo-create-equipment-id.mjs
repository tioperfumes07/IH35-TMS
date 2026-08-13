#!/usr/bin/env node
/**
 * GUARD: WO create must submit equipment_id (trailer/reefer) and expose trailer EntityPicker.
 *
 * DEFECT: CreateWorkOrderModal had unit/driver/load but never equipment_id — trailers could not
 * attach to WOs on create despite maintenance.work_orders.equipment_id + BE header.equipment_id.
 *
 * Rule 17: wired via verify-steps/3132-… only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const ID = "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx";
const API = "apps/frontend/src/api/maintenance.ts";
const LABEL = "verify-wo-create-equipment-id";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertWoCreateEquipmentId(sources) {
  const modal = sources?.[MODAL] ?? read(MODAL);
  const id = sources?.[ID] ?? read(ID);
  const api = sources?.[API] ?? read(API);
  const problems = [];

  if (!/equipment_id:\s*string/.test(modal) && !/equipment_id:\s*string;/.test(modal)) {
    problems.push(`${MODAL}: CreateWOFormValues missing equipment_id.`);
  }
  if (!/equipment_id:\s*values\.equipment_id/.test(modal) && !/equipment_id:\s*values\.equipment_id\s*\|\|/.test(modal)) {
    problems.push(`${MODAL}: createWorkOrder header must send equipment_id.`);
  }
  if (!id.includes('kind="trailer"') || !id.includes("equipment_id")) {
    problems.push(`${ID}: trailer EntityPicker bound to equipment_id missing.`);
  }
  if (!id.includes("wo-create-equipment-picker") && !id.includes("wo-equipment-entity-picker")) {
    problems.push(`${ID}: missing wo equipment picker testid.`);
  }
  if (!/equipment_id\?:\s*string/.test(api)) {
    problems.push(`${API}: CreateWorkOrderTwoSectionPayload.header missing equipment_id?.`);
  }
  return problems;
}

function main() {
  if (SELFTEST) {
    const ok = assertWoCreateEquipmentId();
    if (ok.length) {
      console.error(`${LABEL} SELFTEST FAIL — tree broken:\n- ${ok.join("\n- ")}`);
      process.exit(1);
    }
    const broken = assertWoCreateEquipmentId({
      [MODAL]: read(MODAL).replace(/equipment_id/g, "NOT_EQUIP"),
      [ID]: read(ID).replace(/trailer/g, "NOT_TRAILER").replace(/equipment_id/g, "NOT_EQUIP"),
      [API]: read(API).replace(/equipment_id\?:/g, "nope?:"),
    });
    if (broken.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL — planted weak (${broken.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (${broken.length} planted)`);
    process.exit(0);
  }
  const problems = assertWoCreateEquipmentId();
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
