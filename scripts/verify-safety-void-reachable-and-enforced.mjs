#!/usr/bin/env node
/**
 * SAF-B19 — a void route must be REACHABLE by an operator and ENFORCED once used.
 *
 * The defect this locks has two halves, and the second is the one nobody noticed:
 *
 *   1. REACHABILITY. `POST /api/v1/safety/incidents/:id/void` was written, registered and callable
 *      since SAF-F20 — with no API client and no control anywhere in the frontend. The acceptance
 *      "a row can be voided" was therefore satisfiable only by someone with direct API access. A
 *      registered route is not a feature; a route an operator can reach is.
 *
 *   2. ENFORCEMENT. The route's own doc comment promised that a voided incident "is immutable and
 *      drops out of the operational list." Neither was implemented: the list never filtered
 *      voided_at, and the edit / status / photo-upload paths never checked it. So even once voiding
 *      was reachable, a retracted incident would still appear in the operational list and could
 *      still be edited, re-opened and have evidence attached. A void that changes nothing an
 *      operator can see reads exactly like a feature that does not exist.
 *
 * Denominator rule: void routes are discovered from the backend source, never hardcoded, and the
 * count is printed — so "0 unreachable" always reads as "0 of N".
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BACKEND = join(ROOT, "apps/backend/src");
const FRONTEND = join(ROOT, "apps/frontend/src");
const INCIDENTS = join(BACKEND, "safety/incidents.routes.ts");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** The four writes that must refuse a voided incident, and the list read that must exclude it. */
const ENFORCEMENT_CHECKS = [
  {
    id: "list-excludes-voided",
    describe: "the incident list must exclude voided rows by default",
    test: (src) => /if \(!query\.data\.include_voided\) filters\.push\(`i\.voided_at IS NULL`\)/.test(src),
  },
  {
    id: "edit-refuses-voided",
    describe: "PATCH must not edit a voided incident",
    test: (src) =>
      /UPDATE safety\.incidents\s*\n\s*SET \$\{sets\.join\(", "\)\}[\s\S]{0,400}?WHERE id = \$1 AND operating_company_id = \$2(?:::uuid)? AND voided_at IS NULL/.test(
        src
      ),
  },
  {
    id: "status-refuses-voided",
    describe: "a status transition must refuse a voided incident",
    test: (src) => /if \(row\.voided_at\) return \{ kind: "voided" as const \}/.test(src) && /incident_voided/.test(src),
  },
  {
    id: "photo-refuses-voided",
    describe: "photo upload must refuse a voided incident",
    test: (src) =>
      /UPDATE safety\.incidents\s*\n\s*SET photo_keys = array_append[\s\S]{0,400}?AND voided_at IS NULL/.test(src),
  },
];

export function run() {
  const backendFiles = walk(BACKEND);
  const problems = [];

  // ---- Part 1: every safety void route is reachable from a component ----
  const routes = [];
  for (const f of backendFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/app\.post\(\s*"(\/api\/v1\/safety\/([a-z0-9-]+)\/:id\/void)"/g)) {
      routes.push({ path: m[1], resource: m[2], file: relative(ROOT, f) });
    }
  }

  if (routes.length === 0) {
    return {
      ok: false,
      routes: [],
      message:
        "FAIL: discovered ZERO safety void routes — the guard lost its subject and would pass " +
        "vacuously. Fix the discovery pattern rather than ignoring this.",
    };
  }

  const apiFiles = walk(join(FRONTEND, "api"));
  const componentFiles = walk(FRONTEND).filter(
    (f) => !relative(ROOT, f).includes("/api/") && !relative(ROOT, f).includes("__tests__")
  );
  const componentSrc = componentFiles.map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, "utf8") }));

  const reachable = [];
  for (const route of routes) {
    let client = null;
    for (const f of apiFiles) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export function (\w+)\([^)]*\)[^{]*\{([\s\S]{0,500}?)\n\}/g)) {
        const body = m[2];
        if (body.includes(`safety/${route.resource}/`) && body.includes("/void")) {
          client = m[1];
          break;
        }
      }
      if (client) break;
    }
    if (!client) {
      problems.push(
        `${route.path} is registered (${route.file}) but NO frontend API client calls it — the void is unreachable by any operator.`
      );
      continue;
    }
    const callers = componentSrc.filter((c) => new RegExp(`\\b${client}\\b`).test(c.text));
    if (callers.length === 0) {
      problems.push(
        `${route.path} has a client (${client}) that NO component calls — a declared client is not a control an operator can press.`
      );
      continue;
    }
    reachable.push({ path: route.path, client, caller: callers[0].path });
  }

  // ---- Part 2: the void contract is enforced on safety.incidents ----
  const incidentsSrc = readFileSync(INCIDENTS, "utf8");
  const enforcement = ENFORCEMENT_CHECKS.map((c) => ({ ...c, pass: c.test(incidentsSrc) }));
  for (const c of enforcement) {
    if (!c.pass) {
      problems.push(`void contract NOT enforced — ${c.describe} (${c.id}).`);
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    routes,
    reachable,
    enforcement,
    problems,
    message: ok
      ? `PASS: ${reachable.length} of ${routes.length} safety void routes are reachable from a component, ` +
        `and all ${enforcement.length} incident void-contract enforcement points hold.`
      : `FAIL (${problems.length}):\n  - ${problems.join("\n  - ")}`,
  };
}

/**
 * The selftest re-plants each real defect into the REAL sources — the component's call to
 * voidSafetyIncident, and every one of the four enforcement clauses — and requires the guard to
 * catch each one INDIVIDUALLY, then restores byte-for-byte. Mutating one thing at a time is the
 * point: a selftest that breaks everything at once passes even if the guard only ever checks one
 * condition.
 */
function selftest() {
  // Every component that calls the void client must be planted together. Cargo claim
  // (SAF-F20) also voids via voidSafetyIncident — planting only the incidents cluster
  // left a surviving caller and the selftest falsely green-lit a broken reachability check.
  const voidClientCallers = walk(FRONTEND).filter((f) => {
    if (!/\.(tsx|ts)$/.test(f)) return false;
    const src = readFileSync(f, "utf8");
    // Client definition itself still exports the symbol — plant only call sites.
    if (f.includes("/api/") || f.endsWith("safety-api.ts") || f.endsWith("safetyApi.ts")) return false;
    return src.includes("voidSafetyIncident");
  });
  if (voidClientCallers.length === 0) {
    console.error("SELFTEST FAIL: no frontend voidSafetyIncident callers to plant against.");
    process.exit(1);
  }

  const cases = [
    {
      name: "component no longer calls the void client",
      files: voidClientCallers,
      find: "voidSafetyIncident",
      replace: "__UNREACHABLE_VOID__",
      all: true,
      expect: /NO component calls/,
    },
    {
      name: "list stops excluding voided rows",
      files: [INCIDENTS],
      find: "if (!query.data.include_voided) filters.push(`i.voided_at IS NULL`);",
      replace: "// removed by selftest",
      expect: /list-excludes-voided/,
    },
    {
      name: "PATCH stops refusing a voided incident",
      files: [INCIDENTS],
      find: "WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL\n          RETURNING *",
      replace: "WHERE id = $1 AND operating_company_id = $2::uuid\n          RETURNING *",
      expect: /edit-refuses-voided/,
    },
    {
      name: "status transition stops refusing a voided incident",
      files: [INCIDENTS],
      find: 'if (row.voided_at) return { kind: "voided" as const };',
      replace: "// removed by selftest",
      expect: /status-refuses-voided/,
    },
    {
      name: "photo upload stops refusing a voided incident",
      files: [INCIDENTS],
      find: "            -- SAF-B19: no new evidence onto a retracted record.\n            AND voided_at IS NULL",
      replace: "",
      expect: /photo-refuses-voided/,
    },
  ];

  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository is already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  for (const c of cases) {
    const originals = new Map();
    for (const file of c.files) {
      const original = readFileSync(file, "utf8");
      if (!original.includes(c.find)) {
        console.error(`SELFTEST FAIL: anchor for "${c.name}" not found in ${relative(ROOT, file)} — the mutation would be a no-op.`);
        process.exit(1);
      }
      originals.set(file, original);
    }
    let caught;
    try {
      for (const [file, original] of originals) {
        writeFileSync(file, c.all ? original.replaceAll(c.find, c.replace) : original.replace(c.find, c.replace), "utf8");
      }
      caught = run();
    } finally {
      for (const [file, original] of originals) writeFileSync(file, original, "utf8");
    }
    if (caught.ok || !c.expect.test(caught.message)) {
      console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\nGuard said: ${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name} (${c.files.length} file(s))`);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: all ${cases.length} planted defects were caught and the repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.reachable) for (const r of result.reachable) console.log(`  ${r.path} -> ${r.client} @ ${r.caller}`);
  if (!result.ok) process.exit(1);
}
