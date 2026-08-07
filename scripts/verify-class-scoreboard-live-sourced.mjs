#!/usr/bin/env node
/**
 * PROG-CLASS-STALE — the Programs by-class grid must render from a REQUEST-TIME read of the wave
 * queue, not from a build-time generated module.
 *
 * WHAT HAPPENED: `AuditScoreboardPage` rendered the grid straight out of `CLASS_SCOREBOARD`, the
 * const exported by `apps/frontend/src/pages/program/classScoreboard.data.ts`, which
 * `scripts/gen-class-scoreboard.mjs` writes and someone commits. A committed TS module can only
 * change when the generator is re-run AND the frontend is redeployed, so the board drifted from the
 * queue and there was nothing on the page to say so. Measured on origin/main 2026-08-07: the module
 * described 26 classes while `docs/audit/wave-queue.json` held 31 — CLS-CALENDAR and
 * CLS-JOIN-ENTITY-UNSCOPED had no cell at all, and the queue's two `draining` classes were not
 * represented. `verify-class-scoreboard-fresh.mjs` detects exactly that drift and WAS RED at the
 * time; it is not wired into a verify-step, so the drift shipped anyway.
 *
 * WHY FRESHNESS ALONE IS NOT THE FIX: a freshness guard can only prove the committed file matched the
 * queue at CI time. The owner's requirement is that a class changing status is visible on an OPEN
 * board — that is a runtime property, and no build-time check can deliver it. The page already polls
 * this endpoint every 3s for the rest of its data, so the correct fix was to put the class rows in
 * that same payload.
 *
 * CHECKED:
 *   1. The backend serves `classScoreboard`, computed by reading the wave queue (call site, not just
 *      the declaration — the definition-counts-as-usage bug from CLS-GUARD-READS-COMMENTS).
 *   2. The page consumes the live `classScoreboard` off the payload, and the grid renders from that
 *      resolved value — not directly from the imported CLASS_SCOREBOARD const.
 *   3. The page still keeps CLASS_SCOREBOARD as a fallback AND tells the viewer when it is showing it.
 *      A silent fallback is the same silent-empty failure class as the PR feed.
 *   4. The two colour mappings agree. `classifyCell()` in the generator is the offline fallback and
 *      `classCellFor()` in the backend is the live path; if they diverge, the same class changes
 *      colour depending on whether the API answered. Both must map drained/draining/blocked
 *      identically, and neither may colour a cell from `money_critical` or from instance text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BACKEND = "apps/backend/src/program/audit-scoreboard.routes.ts";
const PAGE = "apps/frontend/src/pages/program/AuditScoreboardPage.tsx";
const GEN = "scripts/gen-class-scoreboard.mjs";
const LABEL = "verify-class-scoreboard-live-sourced";

/**
 * Blank comments so prose ABOUT the old build-time path is never read as the code doing it, and so a
 * reason written in a comment can never satisfy a check. Offset-preserving, and string/template
 * literals are left intact.
 */
function maskComments(src) {
  const out = Array.from(src);
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      if (c === "\\") { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && n === "*") {
      const e = src.indexOf("*/", i + 2);
      const stop = e === -1 ? src.length : e + 2;
      for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

export function auditBackend(raw) {
  const src = maskComments(raw);
  const problems = [];
  // Call site, never the declaration: `function readClassScoreboardFromQueue(` would otherwise keep
  // this green with every caller deleted.
  if (!/(?<!function\s)\breadClassScoreboardFromQueue\s*\(/.test(src)) {
    problems.push(`${BACKEND}: the payload does not call readClassScoreboardFromQueue() — the by-class grid falls back to the build-time module and cannot react to a status change without a redeploy.`);
  }
  // Shorthand (`{ classScoreboard }`) and explicit (`classScoreboard: x`) both count.
  if (!/\bclassScoreboard\s*[,:}]/.test(src)) {
    problems.push(`${BACKEND}: the response does not carry a classScoreboard field.`);
  }
  if (!/wave-queue\.json/.test(src)) {
    problems.push(`${BACKEND}: the class rows are not read from docs/audit/wave-queue.json, which is the source of truth for class status.`);
  }
  return problems;
}

export function auditPage(raw) {
  const src = maskComments(raw);
  const problems = [];
  if (!/\bclassScoreboard\b/.test(src)) {
    problems.push(`${PAGE}: never reads classScoreboard from the live payload.`);
  }
  // The grid must map over the RESOLVED board, not the imported const.
  if (/CLASS_SCOREBOARD\.rows\.map\s*\(/.test(src)) {
    problems.push(`${PAGE}: the grid maps CLASS_SCOREBOARD.rows directly — that is the build-time module, so the cells cannot change without a frontend redeploy.`);
  }
  if (!/classBoard\.rows\.map\s*\(/.test(src)) {
    problems.push(`${PAGE}: the grid does not render from the resolved classBoard (live payload, falling back to the generated module).`);
  }
  // A fallback the viewer cannot see is indistinguishable from live data — the exact failure mode of
  // PROG-PRFEED-PRIVATE-EMPTY, one panel up on the same page.
  if (!/class-scoreboard-fallback-warning/.test(src)) {
    problems.push(`${PAGE}: shows no indication when the build-time fallback is what is on screen; a silently stale grid reads as live.`);
  }
  return problems;
}

/** The offline fallback and the live path must colour a class identically. */
export function auditMappingParity(genRaw, backendRaw) {
  const gen = maskComments(genRaw);
  const be = maskComments(backendRaw);
  const problems = [];
  for (const [name, src, label] of [["classifyCell", gen, GEN], ["classCellFor", be, BACKEND]]) {
    const at = src.indexOf(`function ${name}(`);
    if (at === -1) {
      problems.push(`${label}: ${name}() not found — the two colour mappings can no longer be compared.`);
      continue;
    }
    const body = src.slice(at, at + 900);
    for (const [status, code] of [["drained", "CC"], ["draining", "BB"], ["blocked", "XX"]]) {
      if (!new RegExp(`["']${status}["'][\\s\\S]{0,200}?["']${code}["']`).test(body)) {
        problems.push(`${label}: ${name}() does not map status "${status}" to ${code} — the colour law is drained=green(CC), draining=amber(BB), blocked=red(XX), open=neutral(NN).`);
      }
    }
    if (/money_critical/.test(body)) {
      problems.push(`${label}: ${name}() colours a cell from money_critical. Red is reserved for BLOCKED; a money-critical open class stays neutral and carries the separate liveDefect flag.`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const okGen = `function classifyCell(w){switch(w.status){case "drained": return {code:"CC"}; case "draining": return {code:"BB"}; case "blocked": return {code:"XX"}; default: return {code:"NN"};}}`;
  const okBe = `function classCellFor(s){switch(s){case "drained": return {code:"CC"}; case "draining": return {code:"BB"}; case "blocked": return {code:"XX"}; default: return {code:"NN"};}}`;
  const cases = [
    ["backend: wired", `const classScoreboard = readClassScoreboardFromQueue(); reply.send({classScoreboard}); const P="docs/audit/wave-queue.json";`, (s) => auditBackend(s), 0],
    ["backend: declaration alone does not count", `function readClassScoreboardFromQueue(){} const P="docs/audit/wave-queue.json"; reply.send({classScoreboard: null});`, (s) => auditBackend(s), 1],
    ["backend: not wired at all", `reply.send({ modules });`, (s) => auditBackend(s), 1],
    ["page: renders from resolved board with a fallback notice", `const b = sb.classScoreboard ?? CLASS_SCOREBOARD; classBoard.rows.map(r => r); "class-scoreboard-fallback-warning";`, (s) => auditPage(s), 0],
    ["page: still maps the build-time const", `const x = sb.classScoreboard; CLASS_SCOREBOARD.rows.map(r => r); classBoard.rows.map(r => r); "class-scoreboard-fallback-warning";`, (s) => auditPage(s), 1],
    ["page: silent fallback is forbidden", `const b = sb.classScoreboard ?? CLASS_SCOREBOARD; classBoard.rows.map(r => r);`, (s) => auditPage(s), 1],
    ["page: a COMMENT mentioning the testid does not satisfy it", `/* class-scoreboard-fallback-warning */ const b = sb.classScoreboard; classBoard.rows.map(r => r);`, (s) => auditPage(s), 1],
    ["parity: both mappings agree", okGen, (s) => auditMappingParity(s, okBe), 0],
    ["parity: backend drops draining", okGen, (s) => auditMappingParity(s, `function classCellFor(s){if(s==="drained")return {code:"CC"}; if(s==="blocked")return {code:"XX"}; return {code:"NN"};}`), 1],
    ["parity: colouring from money_critical is forbidden", `function classifyCell(w){if(w.status==="drained")return{code:"CC"};if(w.status==="draining")return{code:"BB"};if(w.drain_proof.money_critical)return{code:"XX"};if(w.status==="blocked")return{code:"XX"};return{code:"NN"};}`, (s) => auditMappingParity(s, okBe), 1],
  ];
  let bad = 0;
  for (const [name, src, fn, expect] of cases) {
    const got = fn(src).length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"}, got ${got}`); }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const backendSrc = readFileSync(join(ROOT, BACKEND), "utf8");
const genSrc = readFileSync(join(ROOT, GEN), "utf8");
const problems = [
  ...auditBackend(backendSrc),
  ...auditPage(readFileSync(join(ROOT, PAGE), "utf8")),
  ...auditMappingParity(genSrc, backendSrc),
];

if (problems.length) {
  console.error(`FAIL ${LABEL} — PROG-CLASS-STALE:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — by-class grid is served request-time from the wave queue, the fallback is labelled, and both colour mappings agree`);
