#!/usr/bin/env node
/**
 * EquipmentTransferModal must EntityLink selected trailer + from/to drivers
 * (Exact Leaves dispatch.modal.equipment_transfer:driver|trailer).
 *
 * FAIL: EntityPicker values only — no EntityLink strip.
 * PASS: data-testid=equipment-transfer-modal-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-equipment-transfer-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-equipment-transfer-modal-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLinkOrTombstone/.test(src), "must import/use EntityLinkOrTombstone");
  assert(
    /data-testid=["']equipment-transfer-modal-entitylinks["']/.test(src),
    "must expose equipment-transfer-modal-entitylinks"
  );
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(/onChange=\{\(next, option\)/.test(src), "pickers must retain the canonical selected option label");
  assert(/id=\{equipmentUuid\}\s+name=\{equipmentOption\?\.label\}/.test(src), "trailer FK must be coupled to its selected label");
  assert(/id=\{fromDriver\}\s+name=\{fromDriverOption\?\.label\}/.test(src), "from-driver FK must be coupled to its selected label");
  assert(/id=\{toDriver\}\s+name=\{toDriverOption\?\.label\}/.test(src), "to-driver FK must be coupled to its selected label");
  assert(!/entityLabel\(null,\s*(?:equipmentUuid|fromDriver|toDriver)/.test(src), "must not fabricate selected labels from UUIDs");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']equipment-transfer-modal-entitylinks["']/,
    'data-testid="planted-missing"'
  );
  assert(broken !== original, "--selftest plant must mutate testid");
  fs.writeFileSync(FILE, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(failed, "--selftest expected FAIL when entitylinks testid removed");
  const rawUuid = original.replace(/name=\{fromDriverOption\?\.label\}/, 'name={fromDriver}');
  assert(rawUuid !== original, "--selftest label plant must match");
  fs.writeFileSync(FILE, rawUuid);
  let labelFailed = false;
  try {
    check();
  } catch {
    labelFailed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(labelFailed, "--selftest expected FAIL when UUID replaces selected label");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
