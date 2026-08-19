#!/usr/bin/env node
/**
 * AwaitingTruckCard (DispatchKanban) must EntityLink unit + driver when IDs exist
 * (Exact Leaves home.kanban:unit|driver).
 *
 * FAIL: plain unit/driver labels on awaiting-assignment synthetic truck cards.
 * PASS: data-testid awaiting-truck-unit-link + awaiting-truck-driver-link with EntityLink.
 *
 * Self-test: node scripts/verify-kanban-awaiting-truck-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kanban-awaiting-truck-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DispatchKanban.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/function AwaitingTruckCard/.test(src), "AwaitingTruckCard must exist");
  const start = src.indexOf("function AwaitingTruckCard");
  const end = src.indexOf("\nfunction KanbanDispatchColumn", start);
  assert(start >= 0 && end > start, "must locate AwaitingTruckCard body");
  const body = src.slice(start, end);
  assert(/data-testid=["']awaiting-truck-unit-link["']/.test(body), "must expose awaiting-truck-unit-link");
  assert(/data-testid=["']awaiting-truck-driver-link["']/.test(body), "must expose awaiting-truck-driver-link");
  assert(/kind=["']unit["']/.test(body), "must EntityLink kind=unit");
  assert(/kind=["']driver["']/.test(body), "must EntityLink kind=driver");
  assert(/stopPropagation/.test(body), "EntityLink clicks must stopPropagation so Book still works");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']awaiting-truck-unit-link["']/,
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
