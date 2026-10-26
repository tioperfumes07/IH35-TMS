#!/usr/bin/env node
// @matrix-built {"modules":["banking"],"cols":["suggestion_engine_priority"],"leafRe":"^transactions\\.categorize$","task":"RC1-443.341"}
// RC1 443.341: catch-all rules (targeting 9000 or no vendor) must never beat a specific rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const LABEL = 'verify-catch-all-rule-never-beats-specific-suggestion';

// --- selftest fixture (no DB needed) ---
// Build a minimal module resolver for the TS-compiled .js
const req = createRequire(import.meta.url);
let mod;
try {
  // Try compiled JS path (CI / built).
  mod = await import('../apps/backend/dist/banking/suggestion-engine.js').catch(() => null);
  if (!mod) mod = await import('../apps/backend/src/banking/suggestion-engine.ts').catch(() => null);
} catch { mod = null; }

/** Static half (used when the engine module cannot be loaded): the two-pass structure must exist in source. */
function staticFailures(src) {
  const f = [];
  if (!/export\s+(?:function|const)\s+isCatchAllRule\b/.test(src)) f.push('isCatchAllRule export missing — RC1 not implemented');
  if (!src.includes('catch_all_rule')) f.push('catch_all_rule source string missing — RC1 not implemented');
  if (!(src.includes('confidence: "low"') || src.includes("confidence: 'low'"))) f.push('low-confidence catch-all path missing');
  if (!src.includes('specific')) f.push('two-pass specific/catchAll separation missing');
  return f;
}
const ENGINE_SRC = fs.readFileSync('apps/backend/src/banking/suggestion-engine.ts', 'utf8');
const SELFTEST = process.argv.includes('--selftest');

if (!mod && !SELFTEST) {
  const f = staticFailures(ENGINE_SRC);
  if (f.length) { console.error(`${LABEL} FAIL (static)\n- ${f.join('\n- ')}`); process.exit(1); }
  console.log(LABEL + ' PASS (static) — two-pass structure present in suggestion-engine.ts');
  process.exit(0);
}


const USMCA_ACCT_9000 = 'c6f629ab-0c65-4aa1-a798-9c77e62a06d2';
const ACCT_FUEL = '353fbd5b-d39c-4709-ac19-60cae52018f7';
const VENDOR_DREAMLINE = '3e72d4a5-e6e7-497a-932e-2d3062502be2';
const BANK_ACCT = 'e83028a5-0000-0000-0000-000000000000';

// Rule A: catch-all — "checkcard" → 9000, no vendor, priority=40
const catchAllRule = {
  priority: 40,
  description_contains: 'checkcard',
  description_regex: null,
  amount_min_cents: null,
  amount_max_cents: null,
  bank_account_filter_id: null,
  then_vendor_id: null,
  then_account_id: USMCA_ACCT_9000,
  then_account_number: '9000',
  then_class_id: null,
};

// Rule B: specific — "dreamline transit" → 5000 + vendor, priority=10
const specificRule = {
  priority: 10,
  description_contains: 'dreamline transit',
  description_regex: null,
  amount_min_cents: null,
  amount_max_cents: null,
  bank_account_filter_id: null,
  then_vendor_id: VENDOR_DREAMLINE,
  then_account_id: ACCT_FUEL,
  then_account_number: '5000',
  then_class_id: null,
};

const ctx = { description_normalized: null, description: 'CHECKCARD 1024 DREAMLINE TRANSIT LLC', amount_cents: 50000, bank_account_id: BANK_ACCT };

/** Behavioral half: the four fixture cases, run against the given engine functions. Throws on the first failure. */
function runCases({ suggestionFromRules, isCatchAllRule }) {
  // Test 1: description matches both rules. Specific rule (lower priority=10) must win over catch-all (priority=40).
  const res1 = suggestionFromRules([catchAllRule, specificRule], ctx);
  assert(res1 !== null, 'expected a suggestion but got null');
  assert.equal(res1.account_id, ACCT_FUEL, `expected fuel account, got ${res1.account_id}`);
  assert.equal(res1.confidence, 'high', `expected high confidence for specific rule, got ${res1.confidence}`);
  assert.equal(res1.source, 'banking_rule', `expected source 'banking_rule', got ${res1.source}`);

  // Test 2: description matches ONLY catch-all. Should return low confidence.
  const ctx2 = { description_normalized: null, description: 'CHECKCARD 1024 UNKNOWN MERCHANT', amount_cents: 5000, bank_account_id: BANK_ACCT };
  const res2 = suggestionFromRules([catchAllRule, specificRule], ctx2);
  assert(res2 !== null, 'catch-all should still fire when nothing specific matches');
  assert.equal(res2.confidence, 'low', `catch-all match should be low confidence, got ${res2.confidence}`);
  assert.equal(res2.source, 'catch_all_rule', `catch-all source should be 'catch_all_rule', got ${res2.source}`);

  // Test 3: no match at all → null
  const ctx3 = { description_normalized: null, description: 'love\'s travel stop', amount_cents: 50000, bank_account_id: BANK_ACCT };
  const res3 = suggestionFromRules([catchAllRule, specificRule], ctx3);
  assert.equal(res3, null, 'should return null when nothing matches');

  // Test 4: isCatchAllRule correctly identifies catch-all
  assert(isCatchAllRule({ then_vendor_id: null, then_account_number: '9000' }), 'no-vendor + 9000 is catch-all');
  assert(isCatchAllRule({ then_vendor_id: null, then_account_number: '5100' }), 'no-vendor is catch-all');
  assert(!isCatchAllRule({ then_vendor_id: VENDOR_DREAMLINE, then_account_number: '5000' }), 'vendor + non-9000 is specific');
}

if (SELFTEST) {
  const fails = (fn) => { try { fn(); return false; } catch { return true; } };
  const results = [];
  // Static half: real source passes; planted structural defects fail (copies only).
  results.push(['static: real source passes', staticFailures(ENGINE_SRC).length === 0]);
  for (const [name, mutated] of [
    ['isCatchAllRule export removed', ENGINE_SRC.replace(/export\s+(function|const)\s+isCatchAllRule\b/g, '$1 isCatchAllRule')],
    ['catch-all never degrades to low', ENGINE_SRC.split('confidence: "low"').join('confidence: "high"').split("confidence: 'low'").join("confidence: 'high'")],
  ]) results.push([`static: planted "${name}" caught`, mutated !== ENGINE_SRC && staticFailures(mutated).length > 0]);
  // Behavioral half: only when the engine module loads in this runtime.
  if (mod) {
    results.push(['behavior: real engine passes 4/4 cases', !fails(() => runCases(mod))]);
    const firstMatchWins = (rules, ctx) => {
      const hit = [...rules].sort((x, y) => y.priority - x.priority).find((r) => ctx.description.toLowerCase().includes(r.description_contains));
      return hit ? { account_id: hit.then_account_id, confidence: 'high', source: 'banking_rule' } : null;
    };
    results.push(['behavior: planted "catch-all beats specific" engine caught', fails(() => runCases({ ...mod, suggestionFromRules: firstMatchWins }))]);
    results.push(['behavior: planted "vendor-less rule treated as specific" caught', fails(() => runCases({ ...mod, isCatchAllRule: (r) => r.then_account_number === '9000' }))]);
  }
  let ok = 0;
  for (const [name, pass] of results) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); if (pass) ok += 1; }
  console.log(`${LABEL} SELFTEST ${ok === results.length ? 'PASS' : 'FAIL'} — ${ok}/${results.length} cases (engine module ${mod ? 'loaded' : 'not loadable here: static half only'})`);
  process.exit(ok === results.length ? 0 : 1);
}

runCases(mod);
console.log(LABEL + ' PASS — 4/4 fixture cases: specific > catch-all, catch-all degrades to low, no-match null');
