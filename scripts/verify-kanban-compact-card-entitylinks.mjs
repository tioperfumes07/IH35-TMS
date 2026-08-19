#!/usr/bin/env node
/**
 * DispatchKanban compact cards must EntityLink driver/unit (not plain driverUnitLabel).
 *
 * FAIL: {driverUnitLabel(load)} as compact primary text.
 * PASS: data-testid kanban-compact-driver-link / kanban-compact-unit-link.
 *
 * Self-test: node scripts/verify-kanban-compact-card-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kanban-compact-card-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DispatchKanban.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function compactBody(src) {
  const start = src.indexOf("function KanbanCompactCard");
  assert(start >= 0, "must have KanbanCompactCard");
  const end = src.indexOf("function KanbanStandardCard", start);
  assert(end > start, "must find KanbanStandardCard after compact");
  return src.slice(start, end);
}

function check() {
  const body = compactBody(fs.readFileSync(FILE, "utf8"));
  assert(/data-testid=["']kanban-compact-driver-link["']/.test(body), "must expose kanban-compact-driver-link");
  assert(/data-testid=["']kanban-compact-unit-link["']/.test(body), "must expose kanban-compact-unit-link");
  assert(/data-testid=["']kanban-compact-load-link["']/.test(body), "must expose kanban-compact-load-link");
  assert(!/\{driverUnitLabel\(load\)\}/.test(body), "must not render plain driverUnitLabel(load) in compact card body");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']kanban-compact-driver-link["']/,
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
  assert(failed, "--selftest expected FAIL when driver link testid removed");
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
