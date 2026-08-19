#!/usr/bin/env node
/**
 * FleetOosStrip must EntityLink each OOS unit card
 * (Exact Leaves home.overview|kanban|list|round_trips :unit via shared strip).
 *
 * FAIL: unitNumber rendered as plain text while unitId is present.
 * PASS: EntityLink kind=unit + data-testid=fleet-oos-unit-link.
 *
 * Self-test: node scripts/verify-fleet-oos-strip-unit-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-oos-strip-unit-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/FleetOosStrip.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/data-testid=["']fleet-oos-unit-link["']/.test(src), "must expose fleet-oos-unit-link");
  assert(!/<span className="font-semibold text-gray-900">\{row\.unitNumber\}<\/span>/.test(src), "must not render plain unitNumber span");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']fleet-oos-unit-link["']/,
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
  assert(failed, "--selftest expected FAIL when unit link testid removed");
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
