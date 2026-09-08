#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectorPath = "apps/backend/src/integrations/samsara/driver-mirror-collector.ts";
const canonical = fs.readFileSync(path.join(root, collectorPath), "utf8");

export function failures(source = canonical) {
  const out = [];
  if (!/SELECT id::text, samsara_driver_id, cdl_number/.test(source)) {
    out.push("collector roster must read the canonical mdata.drivers.samsara_driver_id link");
  }
  if (!/const bySamsaraId = new Map<string, string\[\]>\(\)/.test(source) ||
      !/bySamsaraId\.get\(row\.samsara_driver_id\)/.test(source)) {
    out.push("collector must index authoritative Samsara ids and preserve ambiguity detection");
  }
  const idLookup = source.indexOf("const samsaraIdCandidates = input.bySamsaraId.get(input.samsaraDriverId)");
  const licenseLookup = source.indexOf("const licenseCandidates = input.licenseNumber");
  if (idLookup < 0 || licenseLookup < 0 || idLookup > licenseLookup) {
    out.push("authoritative Samsara-id matching must precede license/name heuristics");
  }
  if (!/samsaraIdCandidates\.length === 1[\s\S]*licenseCandidates\.length === 1/.test(source)) {
    out.push("collector must link only a unique authoritative id before unique license fallback");
  }
  if (!/nameCandidates\.length === 1/.test(source)) {
    out.push("exact-name fallback must remain ambiguity-safe");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const plants = [
    canonical.replace("SELECT id::text, samsara_driver_id, cdl_number", "SELECT id::text, cdl_number"),
    canonical.replace("const samsaraIdCandidates = input.bySamsaraId.get(input.samsaraDriverId) ?? [];", "const samsaraIdCandidates: string[] = [];"),
    canonical.replace("samsaraIdCandidates.length === 1", "samsaraIdCandidates.length > 0"),
  ];
  for (const plant of plants) {
    if (failures(plant).length === 0) throw new Error("planted Samsara linkage regression escaped");
  }
  console.log(`PASS verify-samsara-driver-linkage-match-rate --selftest ${plants.length}/${plants.length}`);
}

const found = failures();
if (found.length) {
  found.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS verify-samsara-driver-linkage-match-rate — authoritative external id precedes ambiguity-safe license/name matching");
