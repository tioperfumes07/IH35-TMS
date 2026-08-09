#!/usr/bin/env node
/** LST-F101 / C-11 — Lists Fleet subnav must derive from DOMAIN_CONFIG (not missing). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUBNAV = "apps/frontend/src/pages/lists/ListsSubNav.tsx";
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const LABEL = "verify-lists-fleet-subnav-complete";
const SELFTEST = process.argv.includes("--selftest");

function liveKeys(mapSrc, domain) {
  const safetyBlock = mapSrc.match(new RegExp(`key:\\s*"${domain}"[\\s\\S]*?catalogs:\\s*\\[([\\s\\S]*?)\\],\\s*\\},`));
  if (!safetyBlock) return [];
  const keys = [];
  const re = /live:\s*(true|false)\s*,\s*catalogKey:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(safetyBlock[1]))) {
    if (m[1] === "true") keys.push(m[2]);
  }
  return [...new Set(keys)];
}

function assert(subnavSrc, mapSrc) {
  const problems = [];
  if (!/Fleet catalogs/.test(subnavSrc)) {
    problems.push(`${SUBNAV}: missing Fleet catalogs dropdown`);
  }
  if (!/domainCatalogNavChildren\("fleet"\)|FLEET_CATALOG_CHILDREN/.test(subnavSrc)) {
    problems.push(`${SUBNAV}: Fleet children must come from domainCatalogNavChildren("fleet") / DOMAIN_CONFIG`);
  }
  const keys = liveKeys(mapSrc, "fleet");
  if (keys.length < 5) {
    problems.push(`${MAP}: expected ≥5 live fleet catalogKeys, got ${keys.length}`);
  }
  return problems;
}

if (SELFTEST) {
  const liveSub = fs.readFileSync(path.join(ROOT, SUBNAV), "utf8");
  const liveMap = fs.readFileSync(path.join(ROOT, MAP), "utf8");
  const planted = liveSub.replace(/Fleet catalogs[\s\S]*?\},\n/, "");
  if (!assert(planted, liveMap).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted removal not caught`);
    process.exit(1);
  }
  const liveProblems = assert(liveSub, liveMap);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(
  fs.readFileSync(path.join(ROOT, SUBNAV), "utf8"),
  fs.readFileSync(path.join(ROOT, MAP), "utf8"),
);
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — Fleet subnav from DOMAIN_CONFIG (${liveKeys(fs.readFileSync(path.join(ROOT, MAP), "utf8"), "fleet").length} live keys)`,
);
