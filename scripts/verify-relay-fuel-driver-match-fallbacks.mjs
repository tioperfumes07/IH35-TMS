#!/usr/bin/env node
/**
 * Guard 1834 — Relay fuel driver match: integration_id ONLY, fallbacks REMOVED.
 *
 * History: this guard used to REQUIRE unique phone / first+last name fallbacks for when
 * drivers.integration_id was empty. Relay (relayed by the Lead 2026-10-03): "use the integration_id to match
 * transactions as thats the value we store on the driver profile that is visible to the users." A guessed
 * driver becomes a wrong settlement deduction, so the guard now proves the opposite: Relay driver.integration_id
 * = mdata.drivers.integration_id and nothing else (no phone, name, email, Relay driver.id, card number), an
 * unmatched driver stays NULL with a named reason, and the CSV importer does not borrow "relay driver id" as an
 * integration_id. (File name kept so verify-step 1834 keeps wiring it.)
 *
 * Rule 17: verify-steps wire this; do not edit package.json / ci.yml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const LABEL = "verify-relay-fuel-driver-match-fallbacks";

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

/** Code only — comments may name the removed fallbacks to explain why they are gone. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export function check({ match, ingest, rematch, csvRoute, routes, index, step }) {
  const f = [];
  const m = stripComments(match);
  if (!/export async function resolveRelayDriverMatch\s*\(/.test(m)) f.push("matcher must export resolveRelayDriverMatch");
  if (!/integration_id = \$2/.test(m)) f.push("matcher must match mdata.drivers.integration_id = $2");
  for (const [re, what] of [
    [/\bphone\b/i, "phone"],
    [/first_name|last_name|lower\(trim\(/i, "name"],
    [/\bemail\b/i, "email"],
    [/relay_driver_id|driver\.id\b/i, "Relay driver.id"],
    [/card_number|fuel_card/i, "card number"],
  ]) {
    if (re.test(m)) f.push(`matcher must not fall back to ${what} — integration_id only`);
  }
  if (!/0000000000000000/.test(m)) f.push("matcher must skip Relay's all-zero placeholder integration_id");
  if (!/unresolved_reason/.test(m)) f.push("matcher must return why a driver stayed unresolved");

  const ing = stripComments(ingest);
  if (!/resolveRelayDriverMatch\(\s*client\s*,\s*operatingCompanyId\s*,\s*relayDriverIntegrationId\s*\)/.test(ing)) {
    f.push("ingest must resolve the driver with resolveRelayDriverMatch(client, operatingCompanyId, relayDriverIntegrationId) only");
  }
  if (/phone: tx\.driver\?\.phone/.test(ing) || /first_name: tx\.driver\?\.first_name/.test(ing)) {
    f.push("ingest must not pass phone/name hints to the matcher");
  }
  if (!/driver_unresolved_reason/.test(ing)) f.push("ingest result must carry driver_unresolved_reason");

  const re = stripComments(rematch);
  if (!/export async function rematchRelayFuelDrivers/.test(re)) f.push("rematch service must exist");
  if (!/resolveRelayDriverMatch\(\s*client\s*,\s*row\.operating_company_id\s*,\s*row\.relay_driver_integration_id\s*\)/.test(re)) {
    f.push("rematch must resolve by relay_driver_integration_id only");
  }
  if (/relay_driver_phone|relay_driver_first_name|relay_driver_last_name/.test(re)) f.push("rematch must not read phone/name for matching");
  if (!/matched_driver_id IS NULL/.test(re)) f.push("rematch must fill NULL only on relay rows");
  if (!/driver_id IS NULL/.test(re)) f.push("rematch must fill NULL only on fuel rows");

  if (/integration_id:\s*relayDriverId/.test(stripComments(csvRoute))) {
    f.push('CSV import must not use "relay driver id" as integration_id (Relay has not confirmed they are equal)');
  }
  if (!routes.includes("/api/integrations/relay/fuel/rematch-drivers")) f.push("rematch route path missing");
  if (!index.includes("registerRelayFuelDriverRematchRoute")) f.push("rematch route not mounted in index");
  if (!step.includes(LABEL)) f.push("verify-step 1834 not wired");
  return f;
}

function load() {
  return {
    match: read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-match.ts"),
    ingest: read("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts"),
    rematch: read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.ts"),
    csvRoute: read("apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts"),
    routes: read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.routes.ts"),
    index: read("apps/backend/src/index.ts"),
    step: read("scripts/verify-steps/1834-verify-relay-fuel-driver-match-fallbacks.mjs"),
  };
}

function selftest() {
  const real = load();
  const base = check(real);
  if (base.length) throw new Error(`real tree must pass first: ${base.join("; ")}`);
  const phoneFallback = `\n  const r = await client.query("SELECT id FROM mdata.drivers WHERE right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2");\n`;
  const plants = [
    ["phone fallback re-added", { ...real, match: real.match + phoneFallback }],
    ["name fallback re-added", { ...real, match: real.match + "\nconst q = `AND lower(trim(first_name)) = $2`;\n" }],
    ["ingest passes phone hint", { ...real, ingest: real.ingest + "\nconst h = { phone: tx.driver?.phone ?? null };\n" }],
    ["CSV borrows driver id", { ...real, csvRoute: real.csvRoute.replace("integration_id: null", "integration_id: relayDriverId") }],
    ["rematch reads name", { ...real, rematch: real.rematch.replace("relay_driver_integration_id\n      FROM", "relay_driver_integration_id, relay_driver_first_name\n      FROM") }],
  ];
  for (const [name, planted] of plants) {
    if (check(planted).length === 0) throw new Error(`planted regression not caught: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS — ${plants.length} planted fallbacks caught`);
}

try {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = check(load());
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`${LABEL}: PASS — Relay driver match is integration_id only; no phone/name/email/driver.id/card fallback`);
  }
} catch (err) {
  console.error(`${LABEL}: FAIL`, err?.message ?? err);
  process.exit(1);
}
