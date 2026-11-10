#!/usr/bin/env node
/**
 * verify-capacity-load-board-posting — CAPACITY ENGINE spec §6 (load-board half).
 *   1. the boards are DAT and Truckstop only (Comdata is a fuel-card network, not a load board);
 *   2. a board without API credentials reports "Not connected — needs <board> API credentials" and the screen gets that
 *      status from GET /api/v1/dispatch/capacity (never a silent no-op, never a fake post);
 *   3. only offerable units are posted, and a unit that stops being offerable (booked further out, offer turned off,
 *      position lost) is WITHDRAWN;
 *   4. the sync cron is leased (single-fire), credential-gated and initialized.
 * Usage: node scripts/verify-capacity-load-board-posting.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-capacity-load-board-posting";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/capacity/load-board-posting.service.ts";
const CRON = "apps/backend/src/dispatch/capacity/load-board-posting.cron.ts";
const ROUTES = "apps/backend/src/dispatch/capacity/capacity.routes.ts";
const INDEX = "apps/backend/src/index.ts";

export function check(files) {
  const f = [];
  const svc = files[SVC] ?? "";
  const cron = files[CRON] ?? "";
  const routes = files[ROUTES] ?? "";
  if (!svc || !cron) return ["load-board posting service / cron missing"];
  if (!/export const LOAD_BOARDS: readonly LoadBoard\[\] = \["dat", "truckstop"\];/.test(svc)) f.push("load boards are not exactly DAT + Truckstop");
  if (/comdata/i.test(svc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) f.push("Comdata treated as a load board (it is a fuel-card network)");
  if (!/reason: `Not connected — needs \$\{LABEL\[board\]\} API credentials/.test(svc)) f.push("a board without credentials does not say \"Not connected — needs <board> API credentials\"");
  if (!/boards: LOAD_BOARDS\.map\(\(b\) => boardStatus\(b\)\)/.test(routes)) f.push("the Available Trucks API does not return each board's connection status");
  if (!/\.filter\(\(r\) => r\.offerable &&/.test(svc)) f.push("non-offerable units can be posted");
  if (!/const withdraws = live\.filter\(\(e\) => !want\.has\(e\.unit_id\)\)/.test(svc)) f.push("a unit no longer offerable is not withdrawn");
  if (!/await provider\.withdraw\(/.test(svc) || !/status = 'withdrawn'/.test(svc)) f.push("withdraw is not sent to the board and recorded");
  if (!/if \(!LOAD_BOARDS\.some\(\(b\) => boardStatus\(b\)\.connected\)\) return;/.test(cron)) f.push("posting cron is not credential-gated");
  if (!/leaseSeconds: JOB_LEASE_SECONDS/.test(cron)) f.push("posting cron is not leased (single-fire)");
  if (!/initializeLoadBoardPostingCron\(app\);/.test(files[INDEX] ?? "")) f.push("posting cron not initialized in index.ts");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [SVC, CRON, ROUTES, INDEX]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["Comdata added as a board", mut(SVC, '["dat", "truckstop"];', '["dat", "truckstop", "comdata"];')],
    ["silent not-connected", mut(SVC, "Not connected — needs ${LABEL[board]} API credentials", "")],
    ["status not on the screen API", mut(ROUTES, "boards: LOAD_BOARDS.map((b) => boardStatus(b))", "boards: []")],
    ["posting non-offerable units", mut(SVC, ".filter((r) => r.offerable &&", ".filter((r) =>")],
    ["no withdraw on booking", mut(SVC, "const withdraws = live.filter((e) => !want.has(e.unit_id))", "const withdraws: typeof live = []")],
    ["cron not gated", mut(CRON, "if (!LOAD_BOARDS.some((b) => boardStatus(b).connected)) return;", "")],
    ["cron not leased", mut(CRON, "{ leaseSeconds: JOB_LEASE_SECONDS }", "{}")],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — DAT + Truckstop only, "Not connected — needs <board> API credentials" surfaced, offerable-only posts, withdraw on booking/offer-off, leased + credential-gated cron`);
}
