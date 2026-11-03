#!/usr/bin/env node
/**
 * E1 / row 162 (LEAD 11-03) — every Relay fill takes its driver from Relay's own id, and a driver may hold several ids.
 * Root cause measured 11-03 (prod, USMCA): 262 of 281 Relay fills had no driver; the matcher read
 * mdata.drivers.integration_id (one id per driver) and 0 drivers carried one, while Relay issues a driver several ids.
 * Static: migration 202616330100 creates integrations.relay_driver_links (FORCED RLS, no DELETE, live-key unique index);
 * the matcher reads the driver column, then the link table, resolves a merged driver to its survivor, refuses an inactive
 * survivor by name, never keys on name/phone; the rematch takes Relay's id before the fuel row and the load, writes NULL
 * only, audits each header; the ingest hook runs it for USMCA only, before the Relay fill records.
 * --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-driver-links-wired";
const F = {
  mig: "db/migrations/202616330100_relay_driver_links.sql",
  match: "apps/backend/src/integrations/relay-payments/relay-fuel-driver-match.ts",
  rematch: "apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.ts",
  hook: "apps/backend/src/fuel/fuel-ingest-hooks.ts",
};

export function findDefects(s) {
  const out = [];
  if (!/FORCE ROW LEVEL SECURITY/.test(s.mig)) out.push("relay_driver_links has no FORCED RLS");
  if (!/REVOKE DELETE ON integrations\.relay_driver_links FROM ih35_app/.test(s.mig) || /GRANT[^;]*DELETE[^;]*relay_driver_links/.test(s.mig)) out.push("relay_driver_links can be deleted (void-not-delete)");
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS relay_driver_links_live_key[\s\S]*?WHERE voided_at IS NULL/.test(s.mig)) out.push("a Relay id can be linked to two drivers at once");
  if (!/d\.merged_into_driver_id IS NULL AND d\.deactivated_at IS NULL/.test(s.mig)) out.push("the seed can link a merged or deactivated driver row");
  const iDirect = s.match.indexOf("AND integration_id = $2");
  const iLink = s.match.indexOf("return resolveRelayDriverLink(client, operatingCompanyId, integrationId)");
  if (iDirect < 0 || iLink < 0 || iLink < iDirect) out.push("the matcher does not read the link table after the driver's own id");
  const link = s.match.slice(s.match.indexOf("export async function resolveRelayDriverLink("), s.match.indexOf("export async function resolveRelayDriverFromLoad("));
  if (!/COALESCE\(d\.merged_into_driver_id, d\.id\)/.test(link)) out.push("a link to a merged driver does not resolve to the survivor");
  if (!/linked_driver_not_active/.test(link)) out.push("an inactive linked driver is matched");
  if (!/l\.voided_at IS NULL/.test(link)) out.push("a voided link still matches");
  if (/phone|first_name|last_name|email/.test(link)) out.push("the link lookup keys on name/phone/email (a guess)");
  const iInt = s.rematch.indexOf("const intMatch = await resolveRelayDriverMatch(");
  const iFuel = s.rematch.indexOf("FROM fuel.fuel_transactions ft");
  const iLoad = s.rematch.indexOf("await resolveRelayDriverFromLoad(");
  if (iInt < 0 || iFuel < 0 || iLoad < 0 || !(iInt < iFuel && iFuel < iLoad)) out.push("the rematch does not take Relay's id before the fuel row and the load");
  if (!/AND matched_driver_id IS NULL/.test(s.rematch) || !/AND driver_id IS NULL/.test(s.rematch)) out.push("the rematch can overwrite an existing driver");
  if (!/appendCrudAudit\([^)]*"relay\.fill_driver_matched"/.test(s.rematch)) out.push("a matched header is not audited");
  const iStep = s.hook.indexOf('"relay.fill_driver_match"');
  if (iStep < 0 || iStep > s.hook.indexOf('"fuel.relay_fill_records"')) out.push("the ingest hook does not match drivers before recording Relay fills");
  if (!/\.filter\(\(id\) => isUsmcaOperatingCompany\(id\)\)/.test(s.hook)) out.push("the driver match touches companies other than USMCA (frozen)");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => ({ ...src, [k]: src[k].replace(a, b) });
  const plants = [
    ["no forced RLS", plant("mig", "ALTER TABLE integrations.relay_driver_links FORCE ROW LEVEL SECURITY;", "")],
    ["delete allowed", plant("mig", "REVOKE DELETE ON integrations.relay_driver_links FROM ih35_app;", "")],
    ["matcher skips links", plant("match", "return resolveRelayDriverLink(client, operatingCompanyId, integrationId)", "return { driver_id: null, unresolved_reason: \"no_active_driver_with_integration_id\" }")],
    ["merged not followed", plant("match", "COALESCE(d.merged_into_driver_id, d.id)", "d.id")],
    ["inactive matched", plant("match", 'if (!res.rows[0].active) return { driver_id: null, unresolved_reason: "linked_driver_not_active" };', "")],
    ["fuel row before Relay id", { ...src, rematch: src.rematch.replace("const intMatch = await resolveRelayDriverMatch(", "/*x*/").replace("// 3. RC6", "const intMatch = await resolveRelayDriverMatch(\n// 3. RC6") }],
    ["audit dropped", plant("rematch", "SYSTEM_ACTOR_USER_ID, \"relay.fill_driver_matched\"", "SYSTEM_ACTOR_USER_ID, \"x\"")],
    ["hook touches frozen companies", plant("hook", ".filter((id) => isUsmcaOperatingCompany(id))", "")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(F).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — Relay fills take their driver from Relay's own id; a driver may hold several ids`);
