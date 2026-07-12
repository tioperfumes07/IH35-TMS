#!/usr/bin/env node
// RELAY-FUEL-INGEST-1: the owner-only Relay CSV import endpoint must stay mounted + reuse the canonical
// parse+upsert (no bespoke ingest). Self-test: --selftest
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const L="verify-relay-csv-import-route-mounted";
export function check(routes,index){const e=[];
  if(!/app\.post\(\s*["']\/api\/integrations\/relay\/fuel\/import-csv["']/.test(routes)) e.push("must POST /api/integrations/relay/fuel/import-csv");
  if(!/parseRelayFuelTransactionRow/.test(routes)||!/upsertRelayFuelTransaction/.test(routes)) e.push("must reuse parseRelayFuelTransactionRow + upsertRelayFuelTransaction");
  if(!/\["Owner",\s*"Administrator"\]\.includes\(role\)/.test(routes)) e.push("must gate to Owner/Administrator");
  if(!/"csv_import"/.test(routes)) e.push("must ingest with source csv_import");
  if(!/registerRelayFuelCsvImportRoute\s*\(\s*app\s*\)/.test(index)) e.push("index.ts must call registerRelayFuelCsvImportRoute(app)");
  return e;}
if(process.argv.includes("--selftest")){
  const good=['app.post("/api/integrations/relay/fuel/import-csv", ()=>{ parseRelayFuelTransactionRow(x); upsertRelayFuelTransaction(a,b,c,"csv_import"); }) ["Owner", "Administrator"].includes(role)',"registerRelayFuelCsvImportRoute(app)"];
  if(check(good[0],good[1]).length){console.error(`${L} --selftest FAILED good`);process.exit(1);}
  if(check("//","//").length!==5){console.error(`${L} --selftest FAILED bad`);process.exit(1);}
  console.log(`${L} --selftest — OK`);
}else{
  const routes=fs.readFileSync(path.join(ROOT,"apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts"),"utf8");
  const index=fs.readFileSync(path.join(ROOT,"apps/backend/src/index.ts"),"utf8");
  const e=check(routes,index);
  if(e.length){console.error(`${L} — FAILED`);for(const x of e)console.error("- "+x);process.exit(1);}
  console.log(`${L} — OK (owner-only Relay CSV import mounted → parse+upsert, csv_import)`);
}
