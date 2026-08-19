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
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(
    /data-testid=["']equipment-transfer-modal-entitylinks["']/.test(src),
    "must expose equipment-transfer-modal-entitylinks"
  );
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
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
