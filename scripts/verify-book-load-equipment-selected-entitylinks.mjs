#!/usr/bin/env node
/**
 * BookLoadEquipmentSection must EntityLink selected unit/trailer/driver(s)
 * (Exact Leaves dispatch.parity.book_load_equipment_section:driver|unit|trailer).
 *
 * FAIL: EntityPicker/DriverPicker only — selected identities not navigable.
 * PASS: data-testid=book-load-equipment-selected-entitylinks with unit/trailer/driver EntityLinks.
 *
 * Self-test: node scripts/verify-book-load-equipment-selected-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-equipment-selected-entitylinks";
const FILE = path.join(
  ROOT,
  "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx"
);

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(
    /data-testid=["']book-load-equipment-selected-entitylinks["']/.test(src),
    "must expose book-load-equipment-selected-entitylinks"
  );
  assert(/data-testid=["']book-load-equipment-unit-link["']/.test(src), "must expose unit link testid");
  assert(
    /data-testid=["']book-load-equipment-trailer-link["']/.test(src),
    "must expose trailer link testid"
  );
  assert(
    /data-testid=["']book-load-equipment-driver-link["']/.test(src),
    "must expose driver link testid"
  );
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']book-load-equipment-selected-entitylinks["']/,
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
  assert(failed, "--selftest expected FAIL when selected-entitylinks testid removed");
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
