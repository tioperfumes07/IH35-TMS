#!/usr/bin/env node
/**
 * 443.191 — service code never imports the HTTP route-helper module.
 *
 * accounting/shared.ts is the route-helper module: currentAuthUser -> requireAuth -> auth/session-middleware ->
 * session-provider -> auth/lucia. A service (engine / writer / poster / worker) that imported it for
 * withCompanyScope dragged the whole auth/session stack into every caller's import graph —
 * expense-writer.service.ts -> shared.ts -> lucia broke 13 bank-recon test files + lumper-cash-advance-split at
 * import (Lead ruling 08:55Z). The non-HTTP half (withCompanyScope, recomputeInvoiceTotals,
 * INVOICE_PLEDGE_CENTS_SQL) lives in accounting/db-scope.ts; shared.ts re-exports it for route code.
 *
 * Rules:
 *  1. A non-route backend file (not *.routes.ts / *route*.ts / *.middleware.ts / tests) that imports
 *     accounting/shared.js may only do so for an HTTP symbol (currentAuthUser, validationError,
 *     companyQuerySchema, resolvePrintOperatingCompanyId) — a file taking one of those is HTTP code itself and may
 *     take withCompanyScope with it; otherwise the db-scope symbols come from db-scope.js.
 *  2. accounting/db-scope.ts reaches neither auth/session-middleware.ts nor auth/lucia.ts through its static
 *     import graph.
 *
 * --selftest plants both violations and proves each is caught.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps/backend/src");
const SHARED = normalize("accounting/shared.ts");
const DB_SCOPE = normalize("accounting/db-scope.ts");
const DB_SCOPE_SYMBOLS = new Set(["withCompanyScope", "recomputeInvoiceTotals", "INVOICE_PLEDGE_CENTS_SQL"]);
const HTTP_SYMBOLS = new Set(["currentAuthUser", "validationError", "companyQuerySchema", "resolvePrintOperatingCompanyId"]);
const FORBIDDEN_REACH = [normalize("auth/session-middleware.ts"), normalize("auth/lucia.ts")];

const IMPORT_RE = /(?:^|\n)\s*(import|export)\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)?\s*(?:from\s+)?["']([^"']+)["']/g;

function isRouteLike(rel) {
  return /route/i.test(rel) || /\.middleware\.ts$/.test(rel) || /__tests__|\.test\.ts$/.test(rel);
}

function resolveSpec(fromRel, spec) {
  if (!spec.startsWith(".")) return null;
  let p = normalize(join(dirname(fromRel), spec)).replace(/\.js$/, ".ts");
  if (existsSync(join(SRC, p))) return p;
  if (existsSync(join(SRC, p + ".ts"))) return p + ".ts";
  if (existsSync(join(SRC, p, "index.ts"))) return join(p, "index.ts");
  return null;
}

function imports(rel, read) {
  const src = read(rel);
  if (src == null) return [];
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[2]) continue; // type-only: erased at runtime
    const target = resolveSpec(rel, m[4]);
    if (!target) continue;
    const names = /^\{/.test(m[3] || "")
      ? m[3].slice(1, -1).split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean)
      : null;
    out.push({ target, names, kind: m[1] });
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) acc.push(relative(SRC, p));
  }
  return acc;
}

export function check({ files, read }) {
  const problems = [];
  for (const rel of files) {
    if (isRouteLike(rel) || rel === SHARED) continue;
    for (const imp of imports(rel, read)) {
      if (imp.target !== SHARED || imp.kind !== "import") continue;
      // A file that takes an HTTP helper from shared.ts is HTTP code itself (e.g. a route registrar) — allowed.
      if ((imp.names ?? []).some((n) => HTTP_SYMBOLS.has(n))) continue;
      const bad = (imp.names ?? ["*"]).filter((n) => n === "*" || DB_SCOPE_SYMBOLS.has(n));
      if (bad.length) problems.push(`${rel}: imports ${bad.join(", ")} from accounting/shared.js — service code takes them from accounting/db-scope.js`);
    }
  }
  // Rule 2: db-scope's runtime import graph stays clear of the session stack.
  const seen = new Set([DB_SCOPE]);
  const queue = [DB_SCOPE];
  const prev = new Map();
  while (queue.length) {
    const f = queue.shift();
    for (const { target } of imports(f, read)) {
      if (seen.has(target)) continue;
      seen.add(target);
      prev.set(target, f);
      queue.push(target);
    }
  }
  for (const t of FORBIDDEN_REACH) {
    if (!seen.has(t)) continue;
    const chain = [t];
    for (let c = prev.get(t); c; c = prev.get(c)) chain.unshift(c);
    problems.push(`accounting/db-scope.ts reaches ${t}: ${chain.join(" -> ")}`);
  }
  return problems;
}

function diskRead(rel) {
  try {
    return readFileSync(join(SRC, rel), "utf8");
  } catch {
    return null;
  }
}

if (process.argv.includes("--selftest")) {
  const files = walk(SRC);
  const plantedService = normalize("accounting/__selftest_planted.service.ts");
  const plants = [
    {
      name: "service imports withCompanyScope from shared.js",
      files: [...files, plantedService],
      read: (rel) => (rel === plantedService ? `import { withCompanyScope } from "./shared.js";\n` : diskRead(rel)),
      expect: /__selftest_planted\.service\.ts: imports withCompanyScope/,
    },
    {
      name: "db-scope imports the route-helper module",
      files,
      read: (rel) => (rel === DB_SCOPE ? `import { currentAuthUser } from "./shared.js";\n${diskRead(rel)}` : diskRead(rel)),
      expect: /db-scope\.ts reaches auth\/(session-middleware|lucia)\.ts/,
    },
    {
      name: "a route importing withCompanyScope from shared.js stays allowed",
      files: [...files, normalize("accounting/__selftest_planted.routes.ts")],
      read: (rel) => (rel === normalize("accounting/__selftest_planted.routes.ts") ? `import { withCompanyScope } from "./shared.js";\n` : diskRead(rel)),
      expect: null,
    },
  ];
  let ok = 0;
  for (const p of plants) {
    const out = check({ files: p.files, read: p.read });
    const hit = p.expect ? out.some((l) => p.expect.test(l)) : out.length === 0;
    console.log(`  ${hit ? "PASS" : "FAIL"}  ${p.name}${hit ? "" : `\n        got: ${out.join(" | ") || "(nothing)"}`}`);
    if (hit) ok++;
  }
  console.log(`verify-service-code-no-route-helper-import --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}

const problems = check({ files: walk(SRC), read: diskRead });
if (problems.length) {
  console.error(`verify-service-code-no-route-helper-import FAIL — ${problems.length}:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("verify-service-code-no-route-helper-import PASS — service code takes the company scope from accounting/db-scope.ts; db-scope never reaches the session stack");
