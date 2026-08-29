#!/usr/bin/env node
/**
 * GUARD: A SPEC ENTRY IS A PROMISE THAT SOMETHING APPEARS ON A SCREEN.
 *
 * WHY THIS EXISTS — three instances of one failure class, all found 2026-08-29:
 *   1. C25-C31 economic columns: declared in docs/specs/scoreboard/columns.shared.json,
 *      enforced by verify-economic-columns-c25-c31-present.mjs (spec vs spec), and referenced
 *      by ZERO files under apps/frontend/src/pages/program/. Guard green, screen blank.
 *   2. TXH-01: specified a two-pane wiring map with a monospace GL ledger box and an SVG
 *      link map. A flat ParityTable shipped. The block was scored on its backend contract.
 *   3. prod_verified greens with no live SHA — the same shape one layer down: a claim that
 *      nothing could ever falsify.
 *
 * THE RULE: if a spec promises it, a component must reference it. A guard that compares a
 * spec to itself is a CLOSED LOOP and proves nothing. This guard is deliberately
 * spec-vs-SOURCE, never spec-vs-spec.
 *
 * FAIL CLOSED. A missing spec file, a missing renderer, or an unreadable path FAILS — it is
 * never skipped. "Cannot determine" is reported as its own state and still fails, because a
 * guard that skips silently reports green and is worse than no guard (learned the hard way:
 * both lane-band guards skipped for five unmapped seats, and isAncestor() reported
 * "not an ancestor" for refs it simply could not resolve).
 *
 * RATCHET: the current gap goes in `waivers`, which may only SHRINK. Adding a waiver fails
 * as tampering. That makes the debt visible and monotone instead of hidden.
 *
 * Run:  node scripts/verify-declared-is-rendered.mjs
 *       node scripts/verify-declared-is-rendered.mjs --selftest
 *       node scripts/verify-declared-is-rendered.mjs --write-waivers   (once, at adoption)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.join(ROOT, "docs/specs/RENDER-CONTRACTS.json");
const LABEL = "verify-declared-is-rendered";
const SELFTEST = process.argv.includes("--selftest");
const WRITE = process.argv.includes("--write-waivers");

/** Pull ids out of a spec using a dotted path like "columns[].id" or "elements[].token". */
export function extractIds(specJson, idPath) {
  const [arrPart, key] = idPath.split("[].");
  const arr = arrPart === "" ? specJson : specJson[arrPart] ?? (Array.isArray(specJson) ? specJson : null);
  if (!Array.isArray(arr)) throw new Error(`idPath "${idPath}" did not resolve to an array`);
  return arr.map((row) => (row && typeof row === "object" ? row[key] : row)).filter((v) => typeof v === "string" && v.length);
}

/**
 * Pure core. renderersText is the concatenated source of every renderer.
 * @returns {{missing:string[], present:string[]}}
 */
export function analyseContract({ ids, renderersText }) {
  const missing = [];
  const present = [];
  for (const id of ids) {
    // Boundary rules, learned from this guard's own selftest:
    //  - LEADING may be "." so `row.gl_delta` counts as a real render (it is one).
    //  - TRAILING must exclude [A-Za-z0-9_] so `gl_delta_PLANTED` does NOT satisfy the
    //    contract. That planted-suffix trick is exactly how the C25-C31 guard's own
    //    mutation test works; a looser boundary would let a renamed stub pass.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`);
    (re.test(renderersText) ? present : missing).push(id);
  }
  return { missing, present };
}

export function analyse({ contracts, waivers, read }) {
  const problems = [];
  const warnings = [];
  const stats = { contracts: 0, ids: 0, rendered: 0, waived: 0, unrendered: 0 };
  const waived = new Set(waivers);
  const stillMissing = [];

  for (const c of contracts) {
    stats.contracts++;
    const spec = read(c.spec);
    if (spec === null) {
      problems.push(`${c.id}: spec "${c.spec}" is MISSING or unreadable — cannot determine whether anything renders. Failing closed.`);
      continue;
    }
    let ids;
    try { ids = extractIds(spec, c.idPath); }
    catch (e) { problems.push(`${c.id}: ${e.message}`); continue; }
    if (!ids.length) {
      problems.push(`${c.id}: spec declares ZERO ids. An empty scope is not a pass.`);
      continue;
    }

    const texts = [];
    for (const r of c.renderers) {
      const t = read(r, true);
      if (t === null) { problems.push(`${c.id}: renderer "${r}" is MISSING — a promised screen has no component. Failing closed.`); continue; }
      texts.push(t);
    }
    if (!texts.length) { problems.push(`${c.id}: no readable renderer at all.`); continue; }

    // ANTI-CLOSED-LOOP: a renderer must not be the spec itself.
    if (c.renderers.includes(c.spec)) {
      problems.push(`${c.id}: CLOSED LOOP — "${c.spec}" is listed as its own renderer. A spec cannot prove itself.`);
      continue;
    }

    const { missing, present } = analyseContract({ ids, renderersText: texts.join("\n") });
    stats.ids += ids.length;
    stats.rendered += present.length;

    for (const id of missing) {
      const key = `${c.id}:${id}`;
      if (waived.has(key)) { stats.waived++; warnings.push(`${key} declared but not rendered — waived debt`); }
      else { stats.unrendered++; stillMissing.push(key);
        problems.push(`${key} is declared in ${c.spec} but NO renderer references it. ${c.why || ""}`.trim()); }
    }
  }
  return { problems, warnings, stats, stillMissing };
}

function readRepo(rel, raw = false) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8");
  if (raw) return txt;
  try { return JSON.parse(txt); } catch { return null; }
}

function selftest() {
  const T = []; const t = (n, f) => { try { f(); T.push([n, true]); } catch (e) { T.push([n, false, e.message]); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${a} !== ${b}`); };
  const mk = (spec, renderers, why = "") => ({ id: "c", spec, idPath: "columns[].id", renderers, why });

  t("declared but not rendered FAILS", () => {
    const r = analyse({ contracts: [mk("s.json", ["r.tsx"])], waivers: [],
      read: (p, raw) => (raw ? "nothing here" : { columns: [{ id: "gl_delta" }] }) });
    eq(r.problems.length, 1, "expected 1");
  });
  t("declared AND rendered PASSES", () => {
    const r = analyse({ contracts: [mk("s.json", ["r.tsx"])], waivers: [],
      read: (p, raw) => (raw ? "const x = row.gl_delta;" : { columns: [{ id: "gl_delta" }] }) });
    eq(r.problems.length, 0, "expected 0");
  });
  t("PLANTED SUFFIX does not count as rendered (gl_delta_PLANTED)", () => {
    const r = analyse({ contracts: [mk("s.json", ["r.tsx"])], waivers: [],
      read: (p, raw) => (raw ? "const x = row.gl_delta_PLANTED;" : { columns: [{ id: "gl_delta" }] }) });
    eq(r.problems.length, 1, "suffix must not satisfy the contract");
  });
  t("missing spec FAILS CLOSED (never skips)", () => {
    const r = analyse({ contracts: [mk("gone.json", ["r.tsx"])], waivers: [], read: () => null });
    eq(r.problems.length, 1, "expected 1");
    if (!r.problems[0].includes("MISSING")) throw new Error("wrong mode: " + r.problems[0]);
  });
  t("missing renderer FAILS CLOSED", () => {
    const r = analyse({ contracts: [mk("s.json", ["gone.tsx"])], waivers: [],
      read: (p, raw) => (raw ? null : { columns: [{ id: "a" }] }) });
    if (!r.problems.some((p) => p.includes("has no component"))) throw new Error("not failed closed");
  });
  t("CLOSED LOOP (spec listed as its own renderer) FAILS", () => {
    const r = analyse({ contracts: [mk("s.json", ["s.json"])], waivers: [],
      read: (p, raw) => (raw ? "" : { columns: [{ id: "a" }] }) });
    if (!r.problems.some((p) => p.includes("CLOSED LOOP"))) throw new Error("closed loop not caught");
  });
  t("empty spec is NOT a vacuous pass", () => {
    const r = analyse({ contracts: [mk("s.json", ["r.tsx"])], waivers: [],
      read: (p, raw) => (raw ? "x" : { columns: [] }) });
    if (!r.problems.some((p) => p.includes("ZERO ids"))) throw new Error("empty scope passed");
  });
  t("waived id WARNS, does not fail", () => {
    const r = analyse({ contracts: [mk("s.json", ["r.tsx"])], waivers: ["c:gl_delta"],
      read: (p, raw) => (raw ? "nothing" : { columns: [{ id: "gl_delta" }] }) });
    eq(r.problems.length, 0, "expected 0"); eq(r.warnings.length, 1, "expected 1 warning");
  });

  const bad = T.filter((x) => !x[1]);
  for (const [n, ok, e] of T) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${e ? " — " + e : ""}`);
  console.log(`${LABEL} --selftest ${bad.length ? "FAIL" : "PASS"} ${T.length - bad.length}/${T.length}`);
  process.exit(bad.length ? 1 : 0);
}

function main() {
  if (SELFTEST) return selftest();
  if (!WRITE) {
    const self = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--selftest"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (self.stdout) process.stdout.write(self.stdout);
    if (self.stderr) process.stderr.write(self.stderr);
    if ((self.status ?? 1) !== 0) process.exit(self.status ?? 1);
  }
  const cfg = readRepo(path.relative(ROOT, CONTRACTS));
  if (!cfg) { console.error(`${LABEL} FAIL — ${CONTRACTS} missing/unparseable. Failing closed.`); process.exit(1); }

  if (WRITE) {
    const { stillMissing } = analyse({ contracts: cfg.contracts, waivers: [], read: readRepo });
    cfg.waivers = stillMissing.sort();
    fs.writeFileSync(CONTRACTS, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`${LABEL} wrote ${cfg.waivers.length} waivers (declared-but-unrendered debt)`);
    return;
  }

  // ANTI-TAMPER: the waiver list may only shrink vs origin/main.
  let prev = null;
  try {
    prev = JSON.parse(execSync(`git show origin/main:docs/specs/RENDER-CONTRACTS.json`,
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).waivers || [];
  } catch { prev = null; }

  const { problems, warnings, stats } = analyse({ contracts: cfg.contracts, waivers: cfg.waivers || [], read: readRepo });

  if (Array.isArray(prev)) {
    const p = new Set(prev);
    const added = (cfg.waivers || []).filter((w) => !p.has(w));
    if (added.length) problems.push(`WAIVERS TAMPERED: ${added.length} added (${added.slice(0, 5).join(", ")}). The waiver list may only shrink — render the element instead of waiving it.`);
  }

  console.log(`${LABEL}: contracts=${stats.contracts} ids=${stats.ids} rendered=${stats.rendered} waived=${stats.waived} unrendered=${stats.unrendered}`);
  for (const w of warnings.slice(0, 6)) console.log(`  warn: ${w}`);
  if (warnings.length > 6) console.log(`  warn: …and ${warnings.length - 6} more waived`);
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
