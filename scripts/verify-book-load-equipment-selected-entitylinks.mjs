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

function checkSource(src) {
  assert(/EntityLinkOrTombstone/.test(src), "must use EntityLinkOrTombstone");
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
  assert(src.includes('id={assignedUnitId} name={unitOption?.label ?? null} noun="Unit"'), "must bind resolved unit identity");
  assert(src.includes('id={assignedTrailerUnitId} name={trailerOption?.label ?? null} noun="Trailer"'), "must bind resolved trailer identity");
  assert(src.includes('id={primaryDriverId} name={primaryDriverOption?.label ?? null} noun="Driver"'), "must bind resolved primary driver identity");
  assert(src.includes('id={secondaryDriverId} name={secondaryDriverOption?.label ?? null} noun="Driver"'), "must bind resolved team driver identity");
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']book-load-equipment-selected-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{unitOption\?\.label \?\? null\}/, "name={null}"],
    [/name=\{trailerOption\?\.label \?\? null\}/, "name={null}"],
    [/name=\{primaryDriverOption\?\.label \?\? null\}/, "name={null}"],
    [/name=\{secondaryDriverOption\?\.label \?\? null\}/, "name={null}"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, "--selftest plant must mutate source");
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
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
