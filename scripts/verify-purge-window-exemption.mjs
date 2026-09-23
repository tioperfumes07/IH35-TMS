#!/usr/bin/env node
// The purge-window exemption stays exactly as ruled (Lead, docs/bus/09-23-2026-LEAD-RULING-CURSOR-
// PURGE-WINDOW-GUARD-STATE.md). Static, no DATABASE_URL:
//   1. the eight named guards, and only they, call the purge-window helper — a new guard cannot inherit it;
//   2. money-pr-local-gate accepts the EMPTY BY PURGE exit at all four live-guard sites and prints
//      the counted summary line;
//   3. the window opens only on a verified purge, closes when day 1 closes, and expires 72 hours
//      after verified_at whatever the feed has done;
//   4. a committed purge_state.json parses and carries only the known keys.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PURGE_STATE_PATH, PURGE_WINDOW_GUARDS, PURGE_WINDOW_HOURS, purgeWindow } from "./lib/purge-window.mjs";

const LABEL = "verify-purge-window-exemption";
export const ALLOW_OFFLINE_SKIP = "static source and state-file checks; never connects to a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = path.join(ROOT, "scripts/money-pr-local-gate.mjs");
const KNOWN_KEYS = new Set(["purged_at", "verified_at", "day1_closed_at", "day1_day"]);

const failures = [];

const callers = fs
  .readdirSync(path.join(ROOT, "scripts"))
  .filter((f) => f.endsWith(".mjs") && f !== path.basename(fileURLToPath(import.meta.url)))
  .filter((f) => /exitIfEmptyByPurge\s*\(|purgeWindowFor\s*\(/.test(fs.readFileSync(path.join(ROOT, "scripts", f), "utf8")))
  .map((f) => f.replace(/\.mjs$/, ""))
  .sort();
const expected = [...PURGE_WINDOW_GUARDS].sort();
if (PURGE_WINDOW_GUARDS.length !== 8) failures.push(`PURGE_WINDOW_GUARDS lists ${PURGE_WINDOW_GUARDS.length} guards; the rulings name eight`);
for (const c of callers) if (!expected.includes(c)) failures.push(`${c} calls the purge-window helper but is not one of the eight`);
for (const e of expected) if (!callers.includes(e)) failures.push(`${e} is one of the eight but no longer calls the purge-window helper at its empty-table arm`);

const gate = fs.readFileSync(GATE, "utf8");
const sites = (gate.match(/code !== 0 && !acceptedAsEmptyByPurge\(/g) ?? []).length;
if (sites !== 4) failures.push(`money-pr-local-gate accepts EMPTY BY PURGE at ${sites} site(s); expected 4 (control totals, parity, LIVE_DOMAIN_GUARDS, E7 batch 2)`);
if (!/PURGE_WINDOW_GUARDS\.includes\(guard\)/.test(gate) || !/purgeWindow\(\)\.open/.test(gate)) {
  failures.push("money-pr-local-gate no longer checks the guard list and the open window before accepting the skip");
}
if (!/GUARDS SKIPPED — EMPTY BY PURGE, verified /.test(gate)) failures.push("money-pr-local-gate no longer prints the counted EMPTY BY PURGE summary line");

const at = (iso, hours) => new Date(new Date(iso).getTime() + hours * 3_600_000);
const V = "2026-09-24T12:00:00.000Z";
const cases = [
  ["no state", {}, at(V, 1), false],
  ["verified 1h ago", { verified_at: V }, at(V, 1), true],
  ["verified 71h59m ago", { verified_at: V }, at(V, 71.99), true],
  ["expired at 72h", { verified_at: V }, at(V, PURGE_WINDOW_HOURS), false],
  ["day 1 closed", { verified_at: V, day1_closed_at: at(V, 5).toISOString() }, at(V, 6), false],
  ["purged but not verified", { purged_at: V }, at(V, 1), false],
  ["verified_at not a timestamp", { verified_at: "soon" }, at(V, 1), false],
];
for (const [name, state, now, want] of cases) {
  if (purgeWindow(state, now).open !== want) failures.push(`window "${name}" should be ${want ? "open" : "closed"}`);
}

if (fs.existsSync(PURGE_STATE_PATH)) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(PURGE_STATE_PATH, "utf8"));
  } catch (e) {
    failures.push(`${path.relative(ROOT, PURGE_STATE_PATH)} does not parse: ${e.message}`);
  }
  for (const k of Object.keys(state ?? {})) if (!KNOWN_KEYS.has(k)) failures.push(`purge_state.json has an unknown key "${k}"`);
}

if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
const w = purgeWindow();
console.log(
  `${LABEL}: PASS — exactly the 8 named guards may skip EMPTY BY PURGE; the gate accepts it at 4 sites; ` +
    `window ${w.open ? `OPEN (verified ${w.verifiedAt}, expires ${w.expiresAt})` : `closed (${w.reason})`}; ${cases.length} window cases hold.`
);
