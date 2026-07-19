#!/usr/bin/env node
// verify-no-circular-dependencies (p1-circular-dependencies)
// Root cause: apps/backend/src had 3 import cycles (SCCs). Two were trivial type-only cycles that
// created avoidable circular module graphs:
//   - integrations/samsara/cap-14-cargo-sensors: ingester.service <-> threshold.service
//   - maintenance/road-service: tickets.routes <-> wo-integration
// Both were broken by extracting the shared `DbClient` type into a dedicated `db-client.type.ts`
// (type-only module, zero runtime change). This guard makes those fixes permanent and prevents NEW
// cycles: it computes strongly-connected components (Tarjan) over the backend relative-import graph
// and FAILS if any file participates in a cycle that is not in the explicit ALLOWLIST.
//
// The one remaining allowlisted cycle is the outbox handler-registry <-> qbo/tms push-service cluster
// (financial-adjacent; left intact deliberately — breaking it is a scoped owner-gated refactor, not a
// drive-by). Any file entering a cycle OUTSIDE the allowlist (or the two fixed cycles regressing) fails.
//
// Import-safe: exports run() returning a string[] of failures. Self-test: --selftest.
// LINKAGE: N/A (platform/build-graph enforcement infra). Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");

// Files permitted to remain in an import cycle (verified 2026-07-12). This is the outbox/qbo push
// cluster; breaking it is an owner-gated financial-adjacent refactor. Everything else must be acyclic.
const ALLOWLIST = new Set([
  "outbox/handlers/samsara-master-data-push.handler.ts",
  "outbox/handlers/trail-events.handler.ts",
  "outbox/handlers/tms-bill-push.handler.ts",
  "outbox/handlers/tms-invoice-push.handler.ts",
  "outbox/handlers/tms-account-push.handler.ts",
  "outbox/handlers/tms-item-push.handler.ts",
  "outbox/handlers/tms-vendor-push.handler.ts",
  "outbox/handlers/tms-customer-push.handler.ts",
  "outbox/handlers/qbo-master-entity-push.handler.ts",
  "outbox/handlers/dispatch-load-dispatched.handler.ts",
  "outbox/handlers/twilio-whatsapp.ts",
  "outbox/handlers/twilio-sms.ts",
  "outbox/handlers/fmcsa-customer-verify.handler.ts",
  "outbox/handlers/registry.ts",
  "qbo/push.service.ts",
]);

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(e) && !/\.d\.ts$/.test(e)) {
      out.push(p);
    }
  }
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const cand = [base, base + ".ts", base + ".tsx", base + ".mts", base + ".cts", path.join(base, "index.ts"), path.join(base, "index.tsx")];
  if (/\.js$/.test(spec)) {
    const t = base.replace(/\.js$/, "");
    cand.unshift(t + ".ts", t + ".tsx", t + ".mts");
  }
  for (const c of cand) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* not a file */ }
  }
  return null;
}

/** Compute every strongly-connected component of size > 1 (a cycle) in the backend import graph. */
export function computeCycles() {
  const files = [];
  walk(SRC, files);
  const graph = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const deps = new Set();
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1] || m[2] || m[3];
      if (!spec) continue;
      const r = resolveImport(f, spec);
      if (r && r !== f) deps.add(r);
    }
    graph.set(f, deps);
  }
  // Tarjan
  let idx = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const sccs = [];
  function strongconnect(v) {
    indices.set(v, idx);
    low.set(v, idx);
    idx++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  }
  for (const v of graph.keys()) if (!indices.has(v)) strongconnect(v);
  const rel = (p) => path.relative(SRC, p);
  return sccs.map((c) => c.map(rel));
}

export function run() {
  const cycles = computeCycles();
  const failures = [];
  for (const cycle of cycles) {
    const offenders = cycle.filter((f) => !ALLOWLIST.has(f));
    if (offenders.length) {
      failures.push(
        `import cycle (${cycle.length} files) contains non-allowlisted file(s): ${offenders.join(", ")} — break the cycle (extract shared types/deps) or, if intentional, add to ALLOWLIST with justification. Full cycle: ${cycle.join(" -> ")}`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  // Pure-logic selftest against synthetic SCCs (no filesystem dependency).
  const allow = new Set(["a.ts", "b.ts"]);
  const scenarios = [
    { name: "allowlisted cycle passes", cycle: ["a.ts", "b.ts"], expectFail: false },
    { name: "non-allowlisted cycle fails", cycle: ["x.ts", "y.ts"], expectFail: true },
    { name: "mixed cycle fails", cycle: ["a.ts", "z.ts"], expectFail: true },
  ];
  const failed = [];
  for (const s of scenarios) {
    const offenders = s.cycle.filter((f) => !allow.has(f));
    const didFail = offenders.length > 0;
    if (didFail !== s.expectFail) failed.push(s.name);
  }
  if (failed.length) {
    console.error("verify:no-circular-dependencies --selftest FAIL:");
    for (const n of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:no-circular-dependencies --selftest PASS (${scenarios.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:no-circular-dependencies FAIL — new/unexpected import cycle:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:no-circular-dependencies PASS (no import cycles outside the allowlist)");
}
