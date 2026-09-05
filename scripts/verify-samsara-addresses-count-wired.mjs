#!/usr/bin/env node
/**
 * ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT, Step 1: "Add entity_type = 'addresses' to
 * samsara-remote-count-collector.cron.ts... Report one line: the count." `geo.geofences` has 2
 * rows in the whole DB; the owner's own words: "Samsara has 100s of previous geofence." Nobody
 * had ever asked the collector to count them.
 *
 * This guard locks the wiring this step actually shipped:
 *   1. SamsaraRemoteEntityType includes "addresses".
 *   2. SamsaraClient exposes countAddresses(), routed through countEntity("addresses") to the
 *      real /addresses endpoint (not /fleet/vehicles or /fleet/drivers by accident).
 *   3. remote-count-collector.ts's ENTITY_TYPES includes "addresses" AND countWithRetry actually
 *      dispatches to countAddresses() for it (declaring the type without wiring the dispatch is
 *      the exact silent-gap shape this class of defect takes).
 *
 * Run: node scripts/verify-samsara-addresses-count-wired.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-samsara-addresses-count-wired";
const CLIENT_REL = "apps/backend/src/integrations/samsara/samsara-client.ts";
const COLLECTOR_REL = "apps/backend/src/integrations/samsara/remote-count-collector.ts";

export function run(root = ROOT) {
  const problems = [];
  let clientSrc, collectorSrc;
  try {
    clientSrc = fs.readFileSync(path.join(root, CLIENT_REL), "utf8");
  } catch {
    return [`${CLIENT_REL}: missing`];
  }
  try {
    collectorSrc = fs.readFileSync(path.join(root, COLLECTOR_REL), "utf8");
  } catch {
    return [`${COLLECTOR_REL}: missing`];
  }

  if (!/SamsaraRemoteEntityType\s*=\s*"drivers"\s*\|\s*"vehicles"\s*\|\s*"addresses"/.test(clientSrc)) {
    problems.push(`${CLIENT_REL}: SamsaraRemoteEntityType no longer includes "addresses"`);
  }
  if (!/async countAddresses\(\)/.test(clientSrc)) {
    problems.push(`${CLIENT_REL}: countAddresses() is missing`);
  }
  if (!/"\/addresses"/.test(clientSrc)) {
    problems.push(`${CLIENT_REL}: no request routes to the real /addresses endpoint`);
  }

  if (!/ENTITY_TYPES:\s*SamsaraRemoteEntityType\[\]\s*=\s*\[\s*"drivers",\s*"vehicles",\s*"addresses"\s*\]/.test(collectorSrc)) {
    problems.push(`${COLLECTOR_REL}: ENTITY_TYPES no longer includes "addresses"`);
  }
  if (!/countWithRetry[\s\S]{0,300}countAddresses\(\)/.test(collectorSrc)) {
    problems.push(`${COLLECTOR_REL}: "addresses" is declared but countWithRetry never dispatches to countAddresses() — the declared type would silently fall through`);
  }

  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/samsara-addresses-selftest-");
  const writeClient = (content) => {
    const abs = path.join(dir, CLIENT_REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const writeCollector = (content) => {
    const abs = path.join(dir, COLLECTOR_REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  const goodClient = `
    export type SamsaraRemoteEntityType = "drivers" | "vehicles" | "addresses";
    class C {
      async countAddresses() { return this.countEntity("addresses"); }
      async countEntity(t) { return fetchSamsaraPage(token, "/addresses", null); }
    }
  `;
  const goodCollector = `
    const ENTITY_TYPES: SamsaraRemoteEntityType[] = ["drivers", "vehicles", "addresses"];
    async function countWithRetry(client, entityType) {
      return entityType === "drivers" ? client.countDrivers()
        : entityType === "vehicles" ? client.countVehicles()
        : client.countAddresses();
    }
  `;
  writeClient(goodClient);
  writeCollector(goodCollector);
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  // Regress: type declared, dispatch never wired (the exact silent-gap shape).
  writeCollector(`
    const ENTITY_TYPES: SamsaraRemoteEntityType[] = ["drivers", "vehicles", "addresses"];
    async function countWithRetry(client, entityType) {
      return entityType === "drivers" ? client.countDrivers() : client.countVehicles();
    }
  `);
  const undispatched = run(dir);
  if (!undispatched.some((p) => p.includes("silently fall through"))) {
    throw new Error("FAIL to catch: declared-but-undispatched addresses type went undetected");
  }
  writeCollector(goodCollector);

  // Regress: type removed entirely.
  writeClient(`export type SamsaraRemoteEntityType = "drivers" | "vehicles";`);
  const removed = run(dir);
  if (!removed.some((p) => p.includes('no longer includes "addresses"'))) {
    throw new Error("FAIL to catch: SamsaraRemoteEntityType regression went undetected");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Samsara address counting is wired end to end (type, client method, collector dispatch)`);
