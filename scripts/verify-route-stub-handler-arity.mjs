#!/usr/bin/env node
/**
 * GUARD: test route stubs must not capture the Fastify handler POSITIONALLY.
 *
 * CLASS: CLS-ROUTE-STUB-ARITY.
 *
 * Fastify's shorthand route methods are OVERLOADED:
 *
 *   app.get(path, handler)
 *   app.get(path, options, handler)     // options carries config.rateLimit, schema, preHandler, …
 *
 * A hand-rolled unit-test stub written as `{ get: (_p: string, h) => { handler = h } }` models only
 * the 2-argument form. The moment the route it covers legitimately gains an options object, the
 * captured "handler" IS that options object and every test in the file dies with
 * `TypeError: handler is not a function` — a failure that points at the harness, not at the change.
 *
 * This is not hypothetical and it is not rare. `verify-new-auth-routes-rate-limited` (verify-step
 * 2214) REQUIRES `config.rateLimit` on authorized routes, because the rate-limit plugin is registered
 * `global: false` (opt-in) — an unlimited authorized route has no limit at all. 860 authorized routes
 * still carry no limit, so every one of them is a future conversion to the 3-arg form, and every
 * positional stub covering one is a scheduled breakage. Two such files went red on 2026-08-06.
 *
 * The fix is `apps/backend/test-helpers/capture-route-handler.ts`, which captures the handler as the
 * LAST FUNCTION ARGUMENT — immune to options being added, removed or reordered. This guard keeps the
 * positional-stub count from growing back.
 *
 * SHRINK-ONLY: the baseline is an inventory of remaining offenders, not an approval of them.
 *
 * Usage:
 *   node scripts/verify-route-stub-handler-arity.mjs
 *   node scripts/verify-route-stub-handler-arity.mjs --selftest
 *   node scripts/verify-route-stub-handler-arity.mjs --write-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-route-stub-handler-arity";
const SELFTEST = process.argv.includes("--selftest");
const BASELINE_PATH = "scripts/route-stub-handler-arity-baseline.json";
const SCAN_DIR = "apps/backend/src";

/**
 * A positional route stub: an object property named after an HTTP verb whose function takes a path
 * parameter and then binds the NEXT parameter as the handler.
 *
 * Matches:   get: (p: string, h: Handler) => …        post: (_path: string, h) => …
 * Ignores:   get: (path, ...rest) => …                (rest-args model the real overload)
 *            app.get("/x", handler)                   (a real registration, not a stub)
 */
const STUB_RE =
  /\b(get|post|put|patch|delete|head|options|all)\s*:\s*(?:async\s*)?\(\s*_?[A-Za-z][\w]*\s*(?::\s*string\s*)?,\s*(?!\.\.\.)_?[A-Za-z][\w]*/g;

export function findPositionalStubs(src) {
  const hits = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A rest parameter anywhere in the arg list means the stub forwards everything — that is the
    // correct shape and must never be flagged.
    if (/\(\s*[^)]*\.\.\./.test(line)) continue;
    const re = new RegExp(STUB_RE.source, "g");
    let m;
    while ((m = re.exec(line)) !== null) hits.push({ line: i + 1, method: m[1] });
  }
  return hits;
}

/** Line-INDEPENDENT keys so the baseline does not churn when unrelated code shifts line numbers. */
export function stubKeys(src, rel) {
  const byMethod = new Map();
  for (const h of findPositionalStubs(src)) byMethod.set(h.method, (byMethod.get(h.method) ?? 0) + 1);
  return [...byMethod.entries()].sort().map(([method, count]) => `${rel}|${method}|${count}`);
}

if (SELFTEST) {
  const bad = `const app = { get: (_p: string, h: Handler) => { handlers[_p] = h; } } as never;`;
  const bad2 = `  post: (p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[p] = h; },`;
  const goodRest = `const register = (method) => (path: string, ...rest: unknown[]) => { routes.push(rest); };`;
  const goodReal = `app.get("/api/v1/driver/loads", { config: { rateLimit: { max: 60 } } }, async (req, reply) => {});`;

  const cases = [
    ["bad 2-arg get stub", bad, true],
    ["bad 2-arg post stub", bad2, true],
    ["good rest-arg stub", goodRest, false],
    ["good real registration", goodReal, false],
  ];
  let failed = 0;
  for (const [name, src, shouldFlag] of cases) {
    const flagged = findPositionalStubs(src).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: ${name} — expected flagged=${shouldFlag}, got ${flagged}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length}/${cases.length} mutations detected correctly`);
  process.exit(0);
}

function allTestFiles() {
  const out = [];
  const abs = path.join(ROOT, SCAN_DIR);
  if (!fs.existsSync(abs)) return out;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (e !== "node_modules" && e !== "dist") walk(p);
      } else if (/\.test\.ts$/.test(e)) {
        out.push(path.relative(ROOT, p));
      }
    }
  })(abs);
  return out.sort();
}

const files = allTestFiles();
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO test files under ${SCAN_DIR}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}

const keys = [];
for (const rel of files) keys.push(...stubKeys(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel));
keys.sort();

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(
    path.join(ROOT, BASELINE_PATH),
    JSON.stringify(
      {
        note:
          "Test route stubs that capture the Fastify handler POSITIONALLY (app.get(path, handler)) and " +
          "therefore break when the route gains an options object such as { config: { rateLimit } }. " +
          "An INVENTORY of remaining debt, not an approval of it. May only SHRINK. " +
          "Fix by using apps/backend/test-helpers/capture-route-handler.ts.",
        test_files_scanned: files.length,
        offenders: keys,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${LABEL}: baseline written — ${keys.length} positional stub(s) across ${files.length} test file(s).`);
  process.exit(0);
}

const baselineAbs = path.join(ROOT, BASELINE_PATH);
if (!fs.existsSync(baselineAbs)) {
  console.log(`${LABEL}: OK — no baseline yet; ${keys.length} positional stub(s) across ${files.length} test file(s).`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(fs.readFileSync(baselineAbs, "utf8")).offenders ?? []);
const added = keys.filter((k) => !baseline.has(k));
if (added.length || keys.length > baseline.size) {
  console.error(
    `${LABEL} FAIL — NEW positional route stub(s). These capture arg 2 as the handler and will break ` +
      `the moment the route gains { config: { rateLimit } }:\n`,
  );
  for (const a of added.slice(0, 15)) console.error(`  - ${a}`);
  if (keys.length > baseline.size) {
    console.error(`\n  offender count rose ${baseline.size} -> ${keys.length}. The baseline may only SHRINK.`);
  }
  console.error(`\nFix: use captureRoutes() from apps/backend/test-helpers/capture-route-handler.ts.\n`);
  process.exit(1);
}

console.log(
  `${LABEL}: OK — positional-stub ratchet holding at ${keys.length}/${baseline.size} across ${files.length} test file(s).`,
);
process.exit(0);
