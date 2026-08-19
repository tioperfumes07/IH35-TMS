#!/usr/bin/env node
/**
 * DispatchKanban Fleet OOS strip chips must EntityLink load/driver/unit
 * (Exact Leaves home.kanban:load|driver|unit).
 *
 * FAIL: plain driverUnitLabel + load_number text on OOS chips.
 * PASS: data-testid kanban-oos-load-link (+ driver/unit when IDs present).
 *
 * Self-test: node scripts/verify-kanban-oos-strip-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kanban-oos-strip-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DispatchKanban.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function oosBody(src) {
  const start = src.indexOf('data-testid="dispatch-kanban-oos-strip"');
  assert(start >= 0, "must have dispatch-kanban-oos-strip");
  return src.slice(start, start + 4500);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  const body = oosBody(src);
  assert(/data-testid=["']kanban-oos-load-link["']/.test(body), "must expose kanban-oos-load-link");
  assert(/data-testid=["']kanban-oos-driver-link["']/.test(body), "must expose kanban-oos-driver-link");
  assert(/data-testid=["']kanban-oos-unit-link["']/.test(body), "must expose kanban-oos-unit-link");
  assert(/kind=["']load["']/.test(body), "must EntityLink kind=load");
  assert(!/\{driverUnitLabel\(load\)\}/.test(body), "must not render plain driverUnitLabel(load)");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']kanban-oos-load-link["']/,
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
  assert(failed, "--selftest expected FAIL when load link testid removed");
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
