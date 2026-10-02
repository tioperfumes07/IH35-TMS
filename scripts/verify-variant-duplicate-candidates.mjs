#!/usr/bin/env node
/**
 * ROUND 297 — the duplicate engine must see VARIANTS, propose only, and never move money.
 * FAILS IF: the variant generator stops proposing the owner's live pairs (or starts proposing unrelated generic-word
 * pairs); the merge route stops being Owner-only or accepts a variant without the explicit owner_approved_variant
 * evidence; the engine stops asserting docs / total / open per party AND the company's open balance unchanged.
 * Run: node scripts/verify-variant-duplicate-candidates.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const ENGINE = "apps/backend/src/mdata/canonical/canonical-entities.service.ts";
const ROUTES = "apps/backend/src/mdata/canonical/canonical-entities.routes.ts";
const GEN = "apps/backend/src/mdata/canonical/variant-candidates.ts";
const TEST = "apps/backend/src/mdata/canonical/variant-candidates.test.ts";

export function audit({ engine, routes, gen, test }) {
  const f = [];
  if (!/input\.evidence !== "owner_approved_variant"/.test(engine)) f.push("engine: variant merges must require owner_approved_variant evidence");
  if (!/const before = await partyMoney\(client, kind, \[input\.survivorId, input\.duplicateId\]\);/.test(engine)) f.push("engine: money snapshot of both parties before the merge is gone");
  if (!/after\.count !== before\.count \|\| after\.total !== before\.total \|\| after\.open !== before\.open \|\| companyAfter !== companyBefore/.test(engine))
    f.push("engine: docs / total / open / company-open equality assertion is gone");
  if (!/throw new Error\(\s*`canonical_money_changed/.test(engine)) f.push("engine: a money change must throw (roll back), not warn");
  const merge = routes.match(/app\.post\("\/api\/v1\/mdata\/canonical\/:kind\/merge"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  if (!/req\.user!\.role !== "Owner"/.test(merge)) f.push("routes: merge must stay Owner-only");
  if (!/evidence: z\.literal\("owner_approved_variant"\)\.optional\(\)/.test(merge)) f.push("routes: variant evidence must be the explicit literal");
  if (!/app\.get\("\/api\/v1\/mdata\/canonical\/variant-candidates"/.test(routes)) f.push("routes: the read-only candidates endpoint is gone");
  if (/mergeIntoCanonical/.test(gen)) f.push("generator: proposing must never merge");
  for (const pair of ["S E Mares Forwarding Service LLC", "DLS Dardini Logistics Services", "BLUEBEACON", "CTS XPRESS LLC", "PILOTMBRIDGE,OH", "FLS Transport Inc."])
    if (!test.includes(pair)) f.push(`test: the owner's live pair "${pair}" is no longer asserted`);
  if (!/does not propose/.test(test)) f.push("test: the negative (generic-word) cases are gone");
  return f;
}

const read = (p) => readFileSync(p, "utf8");
const src = { engine: read(ENGINE), routes: read(ROUTES), gen: read(GEN), test: read(TEST) };
const fails = audit(src);
if (fails.length) { console.error(`verify-variant-duplicate-candidates: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const m = [
    ["score-only merge", { ...src, engine: src.engine.replace(' && input.evidence !== "owner_approved_variant"', "") }],
    ["money warning not throw", { ...src, engine: src.engine.replace("throw new Error(\n      `canonical_money_changed", "console.warn(\n      `canonical_money_changed") }],
    ["non-owner merge", { ...src, routes: src.routes.replace('req.user!.role !== "Owner") return reply.code(403).send({ error: "owner_only" });\n    const p = z.object({ kind: kindSchema }).safeParse(req.params ?? {});\n    const b = z.object({\n', 'false) return reply;\n    const p = z.object({ kind: kindSchema }).safeParse(req.params ?? {});\n    const b = z.object({\n') }],
    ["generator merges", { ...src, gen: src.gen + "\n// mergeIntoCanonical(" }],
  ];
  for (const [name, s] of m) if (audit(s).length === 0) { console.error(`selftest FAIL: ${name}`); process.exit(1); }
  console.log(`verify-variant-duplicate-candidates selftest ${m.length}/${m.length} caught`);
}
console.log("verify-variant-duplicate-candidates: OK — variants proposed, owner approves each, money asserted in the engine");
