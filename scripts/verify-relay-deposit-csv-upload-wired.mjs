#!/usr/bin/env node
// GUARD — verify-relay-deposit-csv-upload-wired (ACCT-F11086, register row 12)
//
// Relay publishes no deposit / wallet-funding API (relay-client.ts calls only /api/fuel/transactions/). The ONLY feed
// of integrations.relay_deposits is the Relay portal "All Transactions" CSV through
// POST /api/integrations/relay/fuel/import-csv. On prod (2026-11-03) USMCA held 126 deposits, 126 of them
// ingest_source = 'csv_import', newest relay_created_at 2026-10-09 21:28 UTC, last inserted 2026-10-11 05:07 UTC:
// the route had NO caller in the frontend, so deposits stopped at the last file a coder ran by hand.
//
// This guard keeps the owner's button alive. It asserts:
//   1. the backend route still exists at the path the frontend calls;
//   2. apps/frontend/src/api/relayDeposits.ts calls that path through apiRequestText with "text/csv"
//      (apiRequest JSON-encodes the body — a CSV sent that way imports nothing);
//   3. client.ts apiRequestText sends the body raw (body: text) — not JSON.stringify;
//   4. RelayDepositReview.tsx mounts a file input that calls importRelayTransactionsCsv.
// Self-test: node scripts/verify-relay-deposit-csv-upload-wired.mjs --selftest (plants each defect, must go red).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-deposit-csv-upload-wired";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts",
  api: "apps/frontend/src/api/relayDeposits.ts",
  client: "apps/frontend/src/api/client.ts",
  ui: "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx",
};
const PATH = "/api/integrations/relay/fuel/import-csv";

export function check(src) {
  const errors = [];
  if (!src.route.includes(`app.post("${PATH}"`)) errors.push(`route: ${FILES.route} no longer registers POST ${PATH}`);
  if (!src.api.includes(`"${PATH}"`)) errors.push(`api: ${FILES.api} does not name ${PATH}`);
  const fn = src.api.match(/export function importRelayTransactionsCsv\([\s\S]*?\n}\n/);
  if (!fn) errors.push(`api: ${FILES.api} has no importRelayTransactionsCsv`);
  else {
    if (!/apiRequestText</.test(fn[0])) errors.push("api: importRelayTransactionsCsv does not use apiRequestText (apiRequest JSON-encodes the CSV)");
    if (!/"text\/csv"/.test(fn[0])) errors.push('api: importRelayTransactionsCsv does not send Content-Type "text/csv"');
  }
  const raw = src.client.match(/export async function apiRequestText<T>\([\s\S]*?\n}\n/);
  if (!raw) errors.push(`client: ${FILES.client} has no apiRequestText`);
  else if (!/body: text,/.test(raw[0]) || /JSON\.stringify/.test(raw[0])) errors.push("client: apiRequestText does not send the text body raw");
  if (!/type="file"/.test(src.ui) || !/importRelayTransactionsCsv\(/.test(src.ui)) {
    errors.push(`ui: ${FILES.ui} has no file input wired to importRelayTransactionsCsv`);
  }
  return errors;
}

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), "utf8")]));
}

function selftest() {
  const good = load();
  const base = check(good);
  if (base.length) {
    console.error(`${LABEL} selftest: live tree is red before planting:\n  ${base.join("\n  ")}`);
    process.exit(1);
  }
  const plants = [
    ["route path renamed", { ...good, route: good.route.replace(`app.post("${PATH}"`, 'app.post("/api/x"') }],
    ["api uses JSON apiRequest", { ...good, api: good.api.replace(/apiRequestText<RelayCsvImportResult>\(/, "apiRequest<RelayCsvImportResult>(") }],
    ["api drops text/csv", { ...good, api: good.api.replace('"text/csv"\n', '"application/json"\n') }],
    ["client stringifies", { ...good, client: good.client.replace("body: text,", "body: JSON.stringify(text),") }],
    ["ui loses the button", { ...good, ui: good.ui.replace(/type="file"/g, 'type="text"') }],
  ];
  let failed = 0;
  for (const [name, planted] of plants) {
    const errs = check(planted);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest: planted defect "${name}" was NOT caught`);
      failed++;
    } else console.log(`${LABEL} selftest: caught "${name}" -> ${errs[0]}`);
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} selftest: PASS (${plants.length} of ${plants.length} planted defects caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const errs = check(load());
  if (errs.length) {
    console.error(`${LABEL}: FAIL\n  ${errs.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS (route, api caller, raw text client, UI file input — 4 of 4 wired)`);
}
