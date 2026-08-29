#!/usr/bin/env node
/**
 * Guard 2000 — G18 fuel load_id rematch via resolveLoadId (fill-null only, no fake FKs).
 *
 * Rule 17: verify-steps wire this; do not edit package.json / ci.yml / CLAIMED-NUMBERS.json.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

function assertIncludes(hay, needle, label) {
  if (!hay.includes(needle)) {
    throw new Error(`${label}: expected to contain ${JSON.stringify(needle)}`);
  }
}

function selftest() {
  assertIncludes("load-rematch-ok", "load-rematch-ok", "selftest");
  const resolver = read("apps/backend/src/fuel/fuel-transaction-import.ts");
  const mutated = resolver.replace(/\s+AND s\.soft_deleted_at IS NULL/, "");
  if (mutated === resolver || /JOIN mdata\.load_stops s ON s\.load_id = l\.id[\s\S]*?AND s\.soft_deleted_at IS NULL[\s\S]*?GROUP BY l\.id/.test(mutated)) {
    throw new Error("selftest: retired-stop mutation escaped");
  }
  console.log("verify-fuel-g18-load-link-rematch: selftest PASS — active-stop mutation caught");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const rematch = read("apps/backend/src/integrations/relay-payments/relay-fuel-load-rematch.service.ts");
  assertIncludes(rematch, "export async function rematchRelayFuelLoads", "rematch service export");
  assertIncludes(rematch, 'from "../../fuel/fuel-transaction-import.js"', "imports resolveLoadId module");
  assertIncludes(rematch, "resolveLoadId(", "calls resolveLoadId");
  assertIncludes(rematch, "load_id IS NULL", "scan fill-null only");
  assertIncludes(rematch, "archived_at IS NULL", "exclude archived rows");
  assertIncludes(rematch, "AND load_id IS NULL", "update fill-null guard");
  assertIncludes(rematch, "load_exemption_reason = NULL", "clear exemption on match");
  assertIncludes(rematch, "skipped_no_driver_or_unit", "skip counter when no driver/unit");
  assertIncludes(rematch, "skipped_no_load_in_window", "skip counter when no load in window");

  const resolver = read("apps/backend/src/fuel/fuel-transaction-import.ts");
  if (!/JOIN mdata\.load_stops s ON s\.load_id = l\.id[\s\S]*?AND s\.soft_deleted_at IS NULL[\s\S]*?GROUP BY l\.id/.test(resolver)) {
    throw new Error("resolveLoadId must bracket fuel only against active load stops");
  }

  const routes = read("apps/backend/src/integrations/relay-payments/relay-fuel-load-rematch.routes.ts");
  assertIncludes(routes, "/api/integrations/relay/fuel/rematch-loads", "rematch-loads route path");
  assertIncludes(routes, '["Owner", "Administrator"]', "owner/admin auth");
  assertIncludes(routes, "withLuciaBypass", "lucia bypass for RLS");

  const index = read("apps/backend/src/index.ts");
  assertIncludes(index, "registerRelayFuelLoadRematchRoute", "route mounted in index");

  const driverRematch = read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.ts");
  assertIncludes(driverRematch, "rematchRelayFuelLoads", "driver rematch chains load rematch");

  const step = read("scripts/verify-steps/2000-verify-fuel-g18-load-link-rematch.mjs");
  assertIncludes(step, "verify-fuel-g18-load-link-rematch", "verify-step wired");

  console.log("verify-fuel-g18-load-link-rematch: PASS");
}

try {
  main();
} catch (err) {
  console.error("verify-fuel-g18-load-link-rematch: FAIL", err?.message ?? err);
  process.exit(1);
}
