#!/usr/bin/env node
/**
 * OptimalDriversPanel ranked rows must EntityLink each driver
 * (Exact Leaves dispatch.panel.optimal_drivers:driver).
 *
 * FAIL: plain display_name text only.
 * PASS: EntityLink kind=driver + data-testid optimal-driver-entitylink-*.
 *
 * Self-test: node scripts/verify-optimal-drivers-panel-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-optimal-drivers-panel-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(
    /data-testid=\{`optimal-driver-entitylink-\$\{d\.rank\}`\}/.test(src) ||
      /optimal-driver-entitylink-/.test(src),
    "must expose optimal-driver-entitylink-* testids"
  );
  assert(/stopPropagation/.test(src), "EntityLink click must stopPropagation so select still works");
  assert(!/<button[\s\S]{0,500}data-testid=\{`optimal-driver-row-/.test(src), "must not nest driver links inside a button");
  assert(/role="button"[\s\S]{0,80}tabIndex=\{rowDisabled \? -1 : 0\}/.test(src), "row shell must retain enabled keyboard activation");
  // BANK-F91298 leftover refuse — OptimalDriversPanel.tsx page-scoped text token ratchet
  assert(!src.includes("text-[11px]"), "OptimalDriversPanel.tsx: leftover text-[11px]");
  assert(!src.includes("#8A92AB") && !src.includes("#334155"), "OptimalDriversPanel.tsx: leftover off-scale muted");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    original.replace(/kind=["']driver["']/, 'kind="planted"'),
    original.replace('<div\n                role="button"', '<button\n                role="button"'),
  ];
  for (const broken of mutations) {
    assert(broken !== original, "--selftest plant must mutate source");
    fs.writeFileSync(FILE, broken);
    let failed = false;
    try {
      check();
    } catch {
      failed = true;
    } finally {
      fs.writeFileSync(FILE, original);
    }
    assert(failed, "--selftest expected planted defect to fail");
  }
  // BANK-F91298 leftover plant — OptimalDriversPanel page-scoped text token ratchet
  const leftoverPlant = original + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  fs.writeFileSync(FILE, leftoverPlant);
  let leftoverFailed = false;
  try {
    check();
  } catch {
    leftoverFailed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(leftoverFailed, "--selftest leftover plant escaped");
  check();
  console.log(`${LABEL}: OK — selftest PASS (2/2 planted defects rejected + leftover plant)`);
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
