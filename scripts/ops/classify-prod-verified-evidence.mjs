#!/usr/bin/env node
/**
 * Classify unbound prod_verified:true items by evidence shape (Claude 2026-08-29 census).
 * Exclusive bucket: neon > http > browser > prose.
 * Does not stamp prod_verified. Does not shrink the binding baseline.
 *
 *   node scripts/ops/classify-prod-verified-evidence.mjs
 *   node scripts/ops/classify-prod-verified-evidence.mjs --write
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectClaims, loadManifests, readBaseline } from "../verify-prod-verified-live-binding.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/module-completion/PROD-VERIFIED-EVIDENCE-CLASS.json");
const WRITE = process.argv.includes("--write");

const NEON =
  /\b(SELECT|FROM\s+\w+\.|bypass_rls|n_live_tup|current_user|SET LOCAL app\.|pg_stat_all_tables)\b/i;
const HTTP = /\/api\/v1\/[A-Za-z0-9_./?=&%-]+|https?:\/\/api\.ih35dispatch\.com/i;
const BROWSER =
  /https?:\/\/app\.ih35dispatch\.com|live Chrome|CDP\s|Owner session|click(?:ed|ing)?\b|tab bar shows/i;

function classifyEvidence(ev) {
  const t = String(ev || "");
  if (NEON.test(t)) return "neon";
  if (HTTP.test(t)) return "http";
  if (BROWSER.test(t)) return "browser";
  return "prose";
}

function extractHttpPaths(ev) {
  const t = String(ev || "");
  const out = new Set();
  for (const m of t.matchAll(/\/api\/v1\/[A-Za-z0-9_./?=&%-]+/g)) out.add(m[0].replace(/[.,;:)]+$/, ""));
  return [...out];
}

const manifests = loadManifests();
const claims = collectClaims(manifests);
const { ids: baselineIds } = readBaseline();
const base = new Set(baselineIds);
const itemByKey = new Map();
for (const { module, data } of manifests) {
  for (const it of data.items || []) {
    itemByKey.set(`${module}:${it.id}`, it);
  }
}

const unbound = claims.filter((c) => !c.bound);
const buckets = { neon: [], http: [], browser: [], prose: [] };
for (const c of unbound) {
  const it = itemByKey.get(`${c.module}:${c.id}`) || {};
  const shape = classifyEvidence(it.evidence);
  buckets[shape].push({
    id: c.id,
    module: c.module,
    inBaseline: base.has(c.id),
    httpPaths: extractHttpPaths(it.evidence),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  law: "docs/lockdown/GUARD-CAPACITY-PROOF-PACKET-CASCADE-G2-2026-08-29.md",
  claims: claims.length,
  bound: claims.filter((c) => c.bound).length,
  unbound: unbound.length,
  baseline: baselineIds.length,
  exclusiveBuckets: {
    neon: buckets.neon.length,
    http: buckets.http.length,
    browser: buckets.browser.length,
    prose: buckets.prose.length,
  },
  machineRecheckable: buckets.neon.length + buckets.http.length,
  items: { neon: buckets.neon, http: buckets.http, browser: buckets.browser, prose: buckets.prose },
};

const text = JSON.stringify(report, null, 2) + "\n";
if (WRITE) {
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)} unbound=${unbound.length} neon=${buckets.neon.length} http=${buckets.http.length} browser=${buckets.browser.length} prose=${buckets.prose.length}`);
} else {
  process.stdout.write(text);
}
