#!/usr/bin/env node
/**
 * Relay per-entity API-key guard — NO cross-entity fallback.
 *
 * relay-client.ts::relayApiKey(entityCode) MUST, when an entityCode is supplied, resolve ONLY the
 * entity-scoped `RELAY_API_KEY_<CODE>` and return null if it is unset — it must NEVER fall through to the
 * bare global `RELAY_API_KEY`, which would pull ANOTHER entity's fuel transactions under the wrong
 * operating_company_id (a cross-entity financial-data leak). The bare global key is legitimate ONLY on the
 * legacy no-entityCode path.
 *
 * This is a static guard: it fails if the `if (code) { … }` scoped branch can fall through to the global
 * key (i.e. a CONDITIONAL `return scoped` with no null return inside the block).
 *
 * --selftest exercises assertGuard() against good + buggy fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-key-no-cross-entity-fallback";
const FILE = "apps/backend/src/integrations/relay-payments/relay-client.ts";

/** Extract the `if (code) { … }` scoped branch body from the relayApiKey source. */
function scopedBranch(src) {
  const fn = src.slice(src.indexOf("function relayApiKey"));
  const m = fn.match(/if\s*\(\s*code\s*\)\s*\{/);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < fn.length && depth > 0; i++) {
    if (fn[i] === "{") depth++;
    else if (fn[i] === "}") depth--;
  }
  return fn.slice(start, i - 1);
}

/** @param {{ source: string }} args @returns {string[]} errors */
export function assertGuard({ source }) {
  const errors = [];
  if (!/function relayApiKey\s*\(\s*entityCode/.test(source)) {
    errors.push(`${FILE}: relayApiKey(entityCode) not found`);
    return errors;
  }
  const branch = scopedBranch(source);
  if (branch == null) {
    errors.push(`${FILE}: could not locate the "if (code) { … }" scoped branch`);
    return errors;
  }
  // The scoped branch MUST return unconditionally to null when the scoped key is unset — i.e. it must
  // contain a `return … : null` (or `return null`). A bare conditional `return scoped` with no null
  // return means execution falls through to the global RELAY_API_KEY read below (the leak).
  const hasNullReturn = /return[^;]*\bnull\b/.test(branch);
  const hasScopedReturn = /return\s+scoped/.test(branch);
  if (!hasScopedReturn) {
    errors.push(`${FILE}: the entity-scoped branch does not return the scoped key`);
  }
  if (!hasNullReturn) {
    errors.push(
      `${FILE}: the entity-scoped branch (if (code) {…}) can FALL THROUGH to the global RELAY_API_KEY — ` +
        "it must return null when RELAY_API_KEY_<CODE> is unset (cross-entity fuel leak otherwise)."
    );
  }
  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function selftest() {
  const good = `
export function relayApiKey(entityCode) {
  const code = norm(entityCode);
  if (code) {
    const scoped = process.env[\`RELAY_API_KEY_\${code}\`]?.trim();
    return scoped && scoped.length > 0 ? scoped : null;
  }
  const key = process.env.RELAY_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}`;
  const buggy = `
export function relayApiKey(entityCode) {
  const code = norm(entityCode);
  if (code) {
    const scoped = process.env[\`RELAY_API_KEY_\${code}\`]?.trim();
    if (scoped && scoped.length > 0) return scoped;
  }
  const key = process.env.RELAY_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}`;
  const cases = [
    { name: "fixed (returns null on unset scoped) → 0", in: { source: good }, want: 0 },
    { name: "buggy (falls through to global) → >=1", in: { source: buggy }, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const source = read(FILE);
if (source == null) { console.error(`[${LABEL}] FAILED — missing ${FILE}`); process.exit(1); }
const errors = assertGuard({ source });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — relayApiKey resolves the entity-scoped key only (no global cross-entity fallback).`);
