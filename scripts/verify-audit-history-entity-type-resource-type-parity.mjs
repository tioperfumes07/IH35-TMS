#!/usr/bin/env node
// VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY
//
// Every EntityAuditHistoryTab.tsx caller passes a short `entityType` (e.g. "vendor") that
// audit-events-list.routes.ts matches against payload->>'entity_type'. But the large majority of
// real CRUD writers tag their payload resource_type/resource_id instead (a dotted schema.table
// string, e.g. "mdata.vendors") — so without a mapping, EVERY entity-detail Audit History tab
// whose writer uses resource_type renders a permanent, indistinguishable-from-honest "No audit
// events found", even with real rows in the DB.
//
// This guard statically asserts two things stay true:
// 1. audit-events-list.routes.ts's entity_type filter OR-matches payload->>'resource_type', and
//    its entity_id filter OR-matches payload->>'resource_id' (the fix itself can't regress).
// 2. Every `entityType="..."` value any *.tsx file actually passes to <EntityAuditHistoryTab> has
//    an entry in ENTITY_TYPE_TO_RESOURCE_TYPES — so a NEW audit-history tab added later can't
//    silently reintroduce this exact bug by shipping unmapped.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_FILE = path.join(__dirname, "..", "apps/backend/src/audit/audit-events-list.routes.ts");
const FRONTEND_SRC = path.join(__dirname, "..", "apps/frontend/src");

function checkRouteFile(src) {
  if (!src.includes("entityTypeParam") || !/resource_type['"]?\s*=\s*ANY/.test(src)) {
    return { ok: false, reason: "entity_type filter no longer OR-matches payload->>'resource_type'" };
  }
  const entityIdLine = src.split("\n").find((l) => l.includes("entity_id") && l.includes("filters.push"));
  if (!entityIdLine || !entityIdLine.includes("resource_id") || !/\bOR\b/.test(entityIdLine)) {
    return { ok: false, reason: "entity_id filter no longer OR-matches payload->>'resource_id'" };
  }
  return { ok: true };
}

function extractMap(src) {
  const start = src.indexOf("const ENTITY_TYPE_TO_RESOURCE_TYPES");
  if (start === -1) return null;
  const end = src.indexOf("\n};", start);
  const block = src.slice(start, end);
  const keys = new Set();
  for (const m of block.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*\[/gm)) keys.add(m[1]);
  return keys;
}

function findFrontendEntityTypes(dir) {
  const found = new Set();
  const re = /<EntityAuditHistoryTab[^>]*entityType="([^"]+)"/g;
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else if (name.endsWith(".tsx")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(re)) found.add(m[1]);
      }
    }
  }
  walk(dir);
  return found;
}

function selftest() {
  const REGRESSED = `
  if (input.entity_type) {
    values.push(input.entity_type);
    filters.push(\`e.payload->>'entity_type' = $\${values.length}\`);
  }
  if (input.entity_id) {
    values.push(input.entity_id);
    filters.push(\`e.payload->>'entity_id' = $\${values.length}\`);
  }
`;
  const r1 = checkRouteFile(REGRESSED);
  if (r1.ok) throw new Error("selftest FAILED to catch the original entity_type/entity_id-only regression");

  const FIXED = `
  if (input.entity_type) {
    values.push(input.entity_type);
    const entityTypeParam = values.length;
    const resourceTypeCandidates = ENTITY_TYPE_TO_RESOURCE_TYPES[input.entity_type];
    if (resourceTypeCandidates && resourceTypeCandidates.length > 0) {
      values.push(resourceTypeCandidates);
      filters.push(
        \`(e.payload->>'entity_type' = $\${entityTypeParam} OR e.payload->>'resource_type' = ANY($\${values.length}::text[]))\`
      );
    } else {
      filters.push(\`e.payload->>'entity_type' = $\${entityTypeParam}\`);
    }
  }
  if (input.entity_id) {
    values.push(input.entity_id);
    filters.push(\`(e.payload->>'entity_id' = $\${values.length} OR e.payload->>'resource_id' = $\${values.length})\`);
  }
`;
  const r2 = checkRouteFile(FIXED);
  if (!r2.ok) throw new Error("selftest FAILED to accept the real fix shape: " + r2.reason);

  const mapSrc = `
const ENTITY_TYPE_TO_RESOURCE_TYPES = {
  vendor: ["mdata.vendors"],
  customer: ["mdata.customers"],
};
`;
  const keys = extractMap(mapSrc);
  if (!keys || !keys.has("vendor") || !keys.has("customer") || keys.has("driver")) {
    throw new Error("selftest FAILED to correctly parse map keys");
  }

  console.log("  selftest: OK (regression caught, fix accepted, map parser correct)");
}

const isSelftest = process.argv.includes("--selftest");
selftest();
if (isSelftest) {
  console.log("PASS (selftest only)");
  process.exit(0);
}

let routeSrc;
try {
  routeSrc = readFileSync(ROUTE_FILE, "utf8");
} catch (err) {
  console.error(`FAIL(gated): cannot read ${ROUTE_FILE}: ${err.message}`);
  process.exit(1);
}

const routeResult = checkRouteFile(routeSrc);
if (!routeResult.ok) {
  console.error(`FAIL(gated): audit-events-list.routes.ts — ${routeResult.reason}`);
  process.exit(1);
}

const mapKeys = extractMap(routeSrc);
if (!mapKeys) {
  console.error("FAIL(gated): ENTITY_TYPE_TO_RESOURCE_TYPES map not found in audit-events-list.routes.ts");
  process.exit(1);
}

const frontendEntityTypes = findFrontendEntityTypes(FRONTEND_SRC);
const unmapped = [...frontendEntityTypes].filter((et) => !mapKeys.has(et));
if (unmapped.length > 0) {
  console.error(
    `FAIL(gated): <EntityAuditHistoryTab entityType="..."> value(s) with no ENTITY_TYPE_TO_RESOURCE_TYPES entry: ${unmapped.join(", ")} — add the real resource_type string(s) that entity's CRUD writer uses, or its Audit History tab will render permanently empty.`
  );
  process.exit(1);
}

console.log(
  `PASS: audit-events-list.routes.ts OR-matches resource_type/resource_id, and all ${frontendEntityTypes.size} live EntityAuditHistoryTab entityType value(s) are mapped`
);
process.exit(0);
