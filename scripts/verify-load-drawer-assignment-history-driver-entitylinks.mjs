#!/usr/bin/env node
/**
 * LoadDetailDrawer Assignment History must EntityLink previous/new drivers
 * (Exact Leaves load.drawer.assignment_history:reverse_link / driver).
 *
 * FAIL: plain "Driver {prev} → {next}" text with no EntityLinkOrTombstone.
 * PASS: data-testid load-drawer-assignment-prev-driver-link +
 *       load-drawer-assignment-new-driver-link with EntityLinkOrTombstone kind=driver.
 *
 * Self-test: node scripts/verify-load-drawer-assignment-history-driver-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-drawer-assignment-history-driver-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLinkOrTombstone/.test(src), "must use EntityLinkOrTombstone");
  assert(
    /data-testid=["']load-drawer-assignment-prev-driver-link["']/.test(src),
    "must expose load-drawer-assignment-prev-driver-link"
  );
  assert(
    /data-testid=["']load-drawer-assignment-new-driver-link["']/.test(src),
    "must expose load-drawer-assignment-new-driver-link"
  );
  assert(
    /data-testid=["']load-drawer-assignment-history-driver-links["']/.test(src),
    "must expose load-drawer-assignment-history-driver-links strip"
  );
  // Planted defect class: plain Driver {prev} → {next} without EntityLink
  assert(
    !/Driver \{prev\} → \{next\}/.test(src),
    "must not render plain Driver {prev} → {next} text"
  );
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']load-drawer-assignment-prev-driver-link["']/,
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
  assert(failed, "--selftest expected FAIL when prev-driver testid removed");
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
