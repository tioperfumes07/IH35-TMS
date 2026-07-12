#!/usr/bin/env node
// RELAY-FUEL-INGEST-1: the owner-only Relay fuel backfill endpoint must stay mounted (POST
// /api/integrations/relay/fuel/backfill → runRelayFuelBackfill). Self-test: --selftest
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-backfill-route-mounted";
export function check(routes, index) {
  const e = [];
  if (!/app\.post\(\s*["']\/api\/integrations\/relay\/fuel\/backfill["']/.test(routes)) e.push("route file must POST /api/integrations/relay/fuel/backfill");
  if (!/runRelayFuelBackfill\s*\(/.test(routes)) e.push("route must call runRelayFuelBackfill");
  if (!/\["Owner",\s*"Administrator"\]\.includes\(role\)/.test(routes)) e.push("route must gate to Owner/Administrator");
  if (!/registerRelayFuelBackfillRoute\s*\(\s*app\s*\)/.test(index)) e.push("index.ts must call registerRelayFuelBackfillRoute(app)");
  return e;
}
if (process.argv.includes("--selftest")) {
  const good = ['app.post("/api/integrations/relay/fuel/backfill", ()=>{ runRelayFuelBackfill(app); }) ["Owner", "Administrator"].includes(role)', "registerRelayFuelBackfillRoute(app)"];
  if (check(good[0], good[1]).length) { console.error(`${LABEL} --selftest FAILED good`); process.exit(1); }
  if (check("// nothing", "// nothing").length !== 4) { console.error(`${LABEL} --selftest FAILED bad`); process.exit(1); }
  console.log(`${LABEL} --selftest — OK`);
} else {
  const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-fuel-backfill.routes.ts"), "utf8");
  const index = fs.readFileSync(path.join(ROOT, "apps/backend/src/index.ts"), "utf8");
  const e = check(routes, index);
  if (e.length) { console.error(`${LABEL} — FAILED`); for (const x of e) console.error("- "+x); process.exit(1); }
  console.log(`${LABEL} — OK (owner-only relay fuel backfill route mounted → runRelayFuelBackfill)`);
}
