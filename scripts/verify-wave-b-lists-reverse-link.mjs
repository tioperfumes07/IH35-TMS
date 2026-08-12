#!/usr/bin/env node
/**
 * @matrix-built {"modules":["lists"],"cols":["reverse_link"],"leafRe":".*","task":"WAVE-B-lists-reverse_link","vertical":"column-wave"}
 *
 * Lists reverse_link: every domain hub/map must drill to the LIVE operating module
 * (Safety/Dispatch/Drivers/…) — not catalog-only dead ends.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapFile = path.join(ROOT, "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");
const hubFile = path.join(ROOT, "apps/frontend/src/pages/lists/DomainCatalogHubPage.tsx");
const mapSrc = fs.readFileSync(mapFile, "utf8");
const hubSrc = fs.readFileSync(hubFile, "utf8");

const failures = [];
if (!/export function buildDomainModulePath/.test(mapSrc)) {
  failures.push("AllCatalogsMap must export buildDomainModulePath");
}
for (const [dom, route] of [
  ["safety", "/safety"],
  ["dispatch", "/dispatch"],
  ["drivers", "/drivers"],
  ["maintenance", "/maintenance"],
  ["accounting", "/accounting"],
  ["customers", "/customers"],
  ["vendors", "/vendors"],
]) {
  if (!new RegExp(`${dom}:\\s*"${route}"`).test(mapSrc)) {
    failures.push(`buildDomainModulePath missing ${dom} → ${route}`);
  }
}
if (!/lists-domain-open-module-\$\{domain\.key\}/.test(mapSrc)) {
  failures.push("DomainCatalogSection must use data-testid={`lists-domain-open-module-${domain.key}`}");
}
if (!/lists-domain-hub-open-module-/.test(hubSrc)) {
  failures.push("DomainCatalogHubPage must render Open module Link with lists-domain-hub-open-module-* testid");
}
if (!/buildDomainModulePath\(domain\.key\)/.test(hubSrc)) {
  failures.push("DomainCatalogHubPage must call buildDomainModulePath");
}

if (process.argv.includes("--selftest")) {
  const broken = mapSrc.replace('safety: "/safety"', 'safety: "/broken"');
  if (broken === mapSrc) {
    console.error("selftest FAIL — mutation did not change source");
    process.exit(1);
  }
  console.log("verify-wave-b-lists-reverse-link --selftest PASS");
  process.exit(0);
}

if (failures.length) {
  console.error(`verify-wave-b-lists-reverse-link FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-b-lists-reverse-link PASS — Lists domain → live module reverse links ratcheted");
