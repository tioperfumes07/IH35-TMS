#!/usr/bin/env node
/**
 * LV-115 — an `?entity=` parameter the server cannot resolve must NEVER silently widen to ALL.
 *
 * THE DEFECT (verified live on deploy dc85375): GET /api/v1/home/scenario-tracker resolved its entity
 * with `isUuid ? rawEntity : "ALL"`. The UI sends the CODE (`?entity=USMCA`), which is not a uuid, so it
 * fell through to ALL and the endpoint answered **200 with the three-entity SUM under every entity
 * button** — TRANSP, USMCA and TRK each reported hop.gl = 1766, which is 1747 + 13 + 6. Passing the raw
 * UUIDs returned the true 1747 / 13 / 6. The owner's progress board was presenting merged totals as
 * per-entity numbers.
 *
 * WHY A TEXT GUARD ON THE SQL WOULD HAVE MISSED IT — and why this guard is shaped the way it is: the SQL
 * predicate was CORRECT and RLS was never breached. The scoping worked; the caller just never asked for
 * a scope, because its identifier type silently failed to parse. Nothing in the query text is wrong, so
 * verify-mdata-entity-scope / verify-join-entity-scoped cannot see this class at all. It is the same trap
 * as ACCT-F120. The only observable is the DECISION the route makes about scope.
 *
 * WHAT THIS ASSERTS, statically: no route may compute its entity scope with a pattern that falls back to
 * an ALL/global sentinel when the identifier merely fails a FORMAT test. An unresolvable entity must
 * produce an error, not a wider result set.
 *
 * NOT CLAIMED: this cannot prove the resolution query is correct, nor that the 400 is reachable at
 * runtime. It proves the silent-widening SHAPE is absent. Runtime behaviour is covered by the route's
 * own tests and by GUARD's live re-check (each entity button showing its own number, a bad code → 400).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-entity-param-never-silently-all";
const SRC = "apps/backend/src";

/**
 * The exact silent-widening shape: a uuid/format test chosen as the ONLY gate, with an ALL-ish sentinel
 * on the failing branch. Matches both ternary orders.
 */
const SILENT_WIDEN = [
  // isUuid ? raw : "ALL"   /  isUuid ? raw : "all"
  /\bis[A-Za-z]*[Uu]uid\b[^;\n]{0,80}\?[^;\n]{0,80}:\s*["'`](ALL|all|\*)["'`]/,
  // !isUuid ? "ALL" : raw
  /!\s*\bis[A-Za-z]*[Uu]uid\b[^;\n]{0,80}\?\s*["'`](ALL|all|\*)["'`]/,
  // UUID_RE.test(x) ? x : "ALL"
  /\.test\s*\([^)]*\)\s*\?[^;\n]{0,80}:\s*["'`](ALL|all|\*)["'`]/,
];

export function auditSource(src, file = "<mem>") {
  const problems = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments. A fix SHOULD be allowed to quote the defect it removed — this guard's own subject
    // line ("the previous logic was `isUuid ? rawEntity : \"ALL\"`") is exactly such a quote, and an
    // earlier version flagged it, which would have punished documenting the root cause.
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (!SILENT_WIDEN.some((re) => re.test(line))) continue;
    problems.push(
      `${file}:${i + 1}: an entity identifier that fails a FORMAT test falls back to ALL — ` +
        `"${line.trim().slice(0, 100)}". A caller asking for ONE entity would silently receive EVERY ` +
        `entity, with HTTP 200 and no error (LV-115: the tracker returned the 3-entity sum 1766 under ` +
        `every entity button). Resolve the identifier (code -> id) and return 400 when it cannot be ` +
        `resolved. Never widen on a parse failure.`
    );
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.includes(".test.")) out.push(rel);
}

function auditTree() {
  const files = [];
  walk(SRC, files);
  if (files.length === 0) return [`${LABEL}: scanned ZERO backend sources — scope is wrong, refusing to pass vacuously.`];
  const problems = [];
  for (const rel of files) problems.push(...auditSource(readFileSync(join(ROOT, rel), "utf8"), rel));
  return problems;
}

function selftest() {
  const failures = [];

  // The exact pre-fix line from home.routes.ts.
  const bad = `const entityScope = isUuid ? rawEntity : "ALL";`;
  if (auditSource(bad).length === 0) failures.push("case1 FAIL — the LV-115 silent-widening ternary was NOT caught");

  // Inverted order, same defect.
  const badInverted = `const scope = !isUuid ? "ALL" : rawEntity;`;
  if (auditSource(badInverted).length === 0) failures.push("case2 FAIL — the inverted silent-widening form was NOT caught");

  // Regex-test form.
  const badTest = `const scope = UUID_RE.test(raw) ? raw : "ALL";`;
  if (auditSource(badTest).length === 0) failures.push("case3 FAIL — the .test() silent-widening form was NOT caught");

  // The FIX shape — resolve, else error. Must be clean.
  const good = `const entityScope = entity ?? "ALL";`;
  if (auditSource(good).length !== 0) failures.push("case4 FAIL — the resolved-or-null fallback was flagged");

  // Widening to ALL when NO entity was requested is legitimate and must not be flagged.
  const noneRequested = `const scope = rawEntity ? resolvedId : "ALL";`;
  if (auditSource(noneRequested).length !== 0)
    failures.push("case5 FAIL — widening on an ABSENT entity (legitimate) was flagged");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real tree still contains the shape: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — all three silent-widening forms caught; resolve-or-error and absent-entity clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no route silently widens an unresolvable entity to ALL`);
}

main();
