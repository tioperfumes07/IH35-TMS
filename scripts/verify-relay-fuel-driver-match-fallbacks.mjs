#!/usr/bin/env node
/**
 * Guard 1834 — Relay fuel driver match must use unique phone/name fallbacks
 * when drivers.integration_id is empty (prod density landmine).
 *
 * Rule 17: verify-steps wire this; do not edit package.json / ci.yml.
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
  assertIncludes("phone-fallback-ok", "phone-fallback-ok", "selftest");
  console.log("verify-relay-fuel-driver-match-fallbacks: selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const match = read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-match.ts");
  assertIncludes(match, "export async function resolveMatchedDriverId", "matcher export");
  assertIncludes(match, "normalizePhoneDigits", "phone normalize");
  assertIncludes(match, "normalizePersonName", "name normalize");
  assertIncludes(match, "right(regexp_replace", "phone SQL unique");
  assertIncludes(match, "lower(trim(first_name))", "name SQL unique");
  assertIncludes(match, "0000000000000000", "skip zero integration_id");

  const ingest = read("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts");
  assertIncludes(ingest, 'from "./relay-fuel-driver-match.js"', "ingest imports matcher");
  assertIncludes(ingest, "first_name: tx.driver?.first_name", "ingest passes name hints");
  assertIncludes(ingest, "phone: tx.driver?.phone", "ingest passes phone hint");

  const rematch = read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.ts");
  assertIncludes(rematch, "export async function rematchRelayFuelDrivers", "rematch service");
  assertIncludes(rematch, "matched_driver_id IS NULL", "fill-null only on relay");
  assertIncludes(rematch, "driver_id IS NULL", "fill-null only on fuel");

  const routes = read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.routes.ts");
  assertIncludes(routes, "/api/integrations/relay/fuel/rematch-drivers", "rematch route path");

  const index = read("apps/backend/src/index.ts");
  assertIncludes(index, "registerRelayFuelDriverRematchRoute", "route mounted in index");

  const step = read("scripts/verify-steps/1834-verify-relay-fuel-driver-match-fallbacks.mjs");
  assertIncludes(step, "verify-relay-fuel-driver-match-fallbacks", "verify-step wired");

  console.log("verify-relay-fuel-driver-match-fallbacks: PASS");
}

try {
  main();
} catch (err) {
  console.error("verify-relay-fuel-driver-match-fallbacks: FAIL", err?.message ?? err);
  process.exit(1);
}
