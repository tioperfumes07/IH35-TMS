#!/usr/bin/env node
/**
 * E-09 — GUARD. dispatch.stop_arrivals is being retired (Lead decision 2026-10-01). Reader count must stay 0:
 * no backend file may SELECT/JOIN dispatch.stop_arrivals; arrivals come from STOP_ARRIVAL_EVENTS_SQL
 * (geo.geofence_events on load-stop fences). The legacy 250 ft writer (telematics/arrival-detection.service.ts) is
 * retired (CC-3 queue 6, 2026-10-02): no backend file may name the table at all — reader or writer.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = resolve(ROOT, "apps/backend/src");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

export function check(files) {
  const readers = [];
  for (const [path, raw] of Object.entries(files)) {
    if (/dispatch\.stop_arrivals|"dispatch",\s*"stop_arrivals"/.test(stripComments(raw))) readers.push(path);
  }
  return readers.map((r) => `${r} still reads dispatch.stop_arrivals -- use STOP_ARRIVAL_EVENTS_SQL.`);
}

const load = () => Object.fromEntries(walk(SRC).map((f) => [relative(ROOT, f), readFileSync(f, "utf8")]));

function selftest() {
  const g = load();
  return check(g).length === 0 && check({ ...g, "x.ts": "const q = `SELECT * FROM dispatch.stop_arrivals`;" }).length === 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-no-reader-of-stop-arrivals selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-no-reader-of-stop-arrivals FAILED:\n  - ${p.join("\n  - ")}` : "verify-no-reader-of-stop-arrivals: OK -- 0 readers of dispatch.stop_arrivals (writer only, pending the Lead's retirement signature).");
  process.exit(p.length ? 1 : 0);
}
