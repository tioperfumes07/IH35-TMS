#!/usr/bin/env node
/**
 * verify-frontend-api-routes-exist
 *
 * CI CONTRACT GUARD (finding G10-H3).
 *
 * Extracts every `/api/v1/...` path string referenced from `apps/frontend/src` and asserts each has
 * a matching backend route registration under `apps/backend/src`. This catches the "UI calls a route
 * that was never built" bug class -> the request hits the SPA/backend 404, `.json()` throws, and the
 * feature silently fails.
 *
 * Matching is structural: both sides are reduced to path segments where any dynamic segment
 * (`:param` on the backend, `${...}` / `encodeURIComponent(...)` / `*` on the frontend) becomes a
 * wildcard, then compared segment-for-segment (equal length, each segment equal or wildcard).
 * Query strings and hashes are ignored. Prefix-registered routers (e.g. `app.register(taskRoutes,
 * { prefix: "/api/v1/tasks" })`) are expanded so their relative literals resolve to full paths.
 *
 * ALLOWLIST: frontend features that call routes NOT built yet (G10-H3). The two non-financial reads/
 * actions from the original six (driver dispatch-eligibility, Pre-Flight DVIR queue/route/severity)
 * are now BUILT and removed from this list. The remaining entries are all FINANCIAL and are GATED
 * builds for the owner — they must NOT be built autonomously (three move money; the fourth,
 * mark-transfer, feeds the QBO accounting outbox and needs a financial-aware transfer-direction
 * design that the FE dev explicitly deferred). The guard keeps them visible so CI stays green today.
 * Remove an entry from the allowlist when its backend route is built.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_FRONTEND_API_ROUTES_ROOT ?? process.cwd();
const FRONTEND_DIR = join(ROOT, "apps/frontend/src");
const BACKEND_DIR = join(ROOT, "apps/backend/src");

/**
 * Known-missing backend routes the six frontend features call. `:x` == one wildcard segment; a
 * trailing `**` == "any suffix under this prefix".
 */
const ALLOWLIST = [
  // --- FINANCIAL routes: GATED builds, owner-only. Do NOT build autonomously. ---
  "/api/v1/customers/:x/payments/:x/unapply", // customer payment un-apply (reverses cash application)
  "/api/v1/banking/reconcile/factoring/apply", // factoring bank-match apply (posts factoring settlement)
  // /api/v1/driver-finance/escrow/:x/forfeit — BUILT (SAF-F01): escrow-forfeit.routes.ts, mounted in
  // index.ts. Removed from this allowlist; the guard now resolves the real handler.
  // mark-transfer categorizes a bank txn as an inter-account transfer AND enqueues a QBO accounting
  // outbox event (mirrors the shipped POST /transfer). The FE sends { from_account_id, to_account_id }
  // but the transfer DIRECTION (in/out) must be derived correctly before posting — financial-aware,
  // deferred per the FE dev's note. Build behind the owner gate, not autonomously.
  "/api/v1/banking/transactions/:x/mark-transfer",
  // NOTE (G10-H3 build): the two non-financial routes below were BUILT and removed from this list:
  //   /api/v1/dispatch/drivers/:x/eligibility  → dispatch/driver-eligibility.routes.ts
  //   /api/v1/maintenance/pre-flight-dvir/**   → maintenance/pre-flight-dvir.routes.ts
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Reduce a raw path literal to an array of normalized segments (dynamic -> "*"). */
function normalize(raw) {
  const path = String(raw).split("?")[0].split("#")[0];
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      /[:${*]/.test(seg) || seg.includes("encodeURIComponent") ? "*" : seg.toLowerCase()
    );
}

/** true if a frontend segment array is served by a backend segment array. */
function segMatch(fe, be) {
  if (fe.length !== be.length) return false;
  for (let i = 0; i < fe.length; i += 1) {
    if (fe[i] !== "*" && be[i] !== "*" && fe[i] !== be[i]) return false;
  }
  return true;
}

/** true if a frontend path is covered by an allowlist template (supports trailing `**`). */
function allowMatch(feSegs, template) {
  const isPrefix = template.endsWith("/**");
  const tmpl = normalize(template.replace(/\/\*\*$/, ""));
  if (isPrefix) {
    if (feSegs.length < tmpl.length) return false;
    return segMatch(feSegs.slice(0, tmpl.length), tmpl);
  }
  return segMatch(feSegs, tmpl);
}

/** Extract quoted/backticked literals that start with `prefix` from source text. */
function extractLiterals(text, prefix) {
  const out = [];
  const patterns = [
    new RegExp("`(" + prefix + "[^`]*)`", "g"),
    new RegExp("'(" + prefix + "[^']*)'", "g"),
    new RegExp('"(' + prefix + '[^"]*)"', "g"),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
  }
  return out;
}

/**
 * Backend absolute-route corpus = every quoted literal that starts with `/api`. This is deliberately
 * broad (covers `.get<Generics>(...)`, `app.register` bases, and helper/redirect registrations like
 * `redirectPreservingQuery(app, "/api/...")`); being broad only ADDS coverage, so it cannot produce a
 * false "missing route" failure.
 */
function extractBackendAbsolute(text) {
  const out = [];
  for (const q of ["`", "'", '"']) {
    const re = new RegExp(q + "(/api[^" + q + "]*)" + q, "g");
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
  }
  return out;
}

/**
 * Catalog factory routes: `createCatalogRoutes(app, { urlSegment: "x", routePrefix: "/api/..." })`
 * mounts `${routePrefix}/${urlSegment}` (+ `/:id`) with no static literal. Synthesize those paths by
 * pairing every routePrefix with every urlSegment in the file (cartesian is additive / safe).
 */
function extractCatalogFactoryRoutes(text) {
  const prefixesInFile = [...text.matchAll(/routePrefix\s*:\s*(["'`])(\/api[^"'`]*)\1/g)].map((m) => m[2]);
  const segmentsInFile = [...text.matchAll(/urlSegment\s*:\s*(["'`])([a-z0-9-]+)\1/g)].map((m) => m[2]);
  const out = [];
  for (const prefix of prefixesInFile) {
    for (const seg of segmentsInFile) {
      out.push(`${prefix}/${seg}`);
      out.push(`${prefix}/${seg}/:id`);
    }
  }
  return out;
}

/**
 * Relative route literals (start with "/" but not "/api") from `.get/post/.../(...)` calls, including
 * the `.get<{ Params }>(...)` generic form. These belong to a prefix-registered router and get the
 * prefix prepended before matching.
 */
function extractBackendRelative(text) {
  const out = [];
  const re = /\.(?:get|post|put|patch|delete)\b[^(;]*\(\s*(["'`])(\/[^"'`]*)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!m[2].startsWith("/api")) out.push(m[2]);
  }
  return out;
}

// --- Build the backend route corpus -----------------------------------------------------------
const backendFiles = walk(BACKEND_DIR);
const backendAbsolute = [];
const backendRelative = [];
const prefixes = new Set();

for (const file of backendFiles) {
  const text = readFileSync(file, "utf8");
  for (const p of extractBackendAbsolute(text)) backendAbsolute.push(p);
  for (const p of extractCatalogFactoryRoutes(text)) backendAbsolute.push(p);
  for (const rel of extractBackendRelative(text)) backendRelative.push(rel);
  // Prefix-registered routers: app.register(<ident>, { prefix: "/api/..." })
  const preRe = /\.register\([^,]+,\s*\{[^}]*prefix\s*:\s*(["'`])(\/api[^"'`]*)\1/g;
  let pm;
  while ((pm = preRe.exec(text)) !== null) prefixes.add(pm[2]);
}

const backendSegs = backendAbsolute.map(normalize);
// Expand every discovered prefix against every relative literal (additive: only widens coverage).
for (const prefix of prefixes) {
  const pSegs = normalize(prefix);
  for (const rel of backendRelative) {
    backendSegs.push([...pSegs, ...normalize(rel)]);
  }
}

// --- Collect frontend /api/v1 calls -----------------------------------------------------------
const frontendFiles = walk(FRONTEND_DIR);
const frontendCalls = new Map(); // normalized-key -> { segs, sample }

/**
 * Strip block and line comments before scanning.
 *
 * FALSE-POSITIVE FIX (2026-08-08): this guard reported `/api/v1/...` — a literal ellipsis — as a frontend
 * call with no backend route, "referenced in apps/frontend/src/api/safety.ts". There is no such call. The
 * match came from a JSDoc block whose whole purpose is to say the endpoint is NOT under /api/v1:
 *
 *     Base path is `/api/safety/...` (NOT `/api/v1/...`)
 *
 * So the guard flagged prose explaining the exact thing it was checking for. A guard that cries wolf is
 * worse than no guard: this one is exempt and unwired, and the one concrete "failure" it reported was
 * noise, which is how a real missing route would have been dismissed along with it.
 *
 * Comments cannot contain a real call, so they are removed first. String contents are unaffected — the
 * patterns below still see every genuine literal.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

for (const file of frontendFiles) {
  const text = stripComments(readFileSync(file, "utf8"));
  for (const lit of extractLiterals(text, "/api/v1/")) {
    // A literal ending in "/" is a base prefix the code concatenates onto, not an endpoint itself.
    if (lit.split("?")[0].endsWith("/")) continue;
    const segs = normalize(lit);
    const key = segs.join("/");
    if (!frontendCalls.has(key)) {
      frontendCalls.set(key, { segs, sample: lit.split("?")[0], file });
    }
  }
}

// --- Compare ----------------------------------------------------------------------------------
const unmatched = [];
for (const { segs, sample, file } of frontendCalls.values()) {
  if (backendSegs.some((be) => segMatch(segs, be))) continue;
  if (ALLOWLIST.some((t) => allowMatch(segs, t))) continue;
  unmatched.push({ sample, file });
}

if (unmatched.length > 0) {
  console.error(
    `\n✗ verify-frontend-api-routes-exist: ${unmatched.length} frontend /api/v1 call(s) have no backend route.`
  );
  console.error("  Either the route was renamed/never built, or add it to ALLOWLIST if it is a known gated build.\n");
  for (const u of unmatched.sort((a, b) => a.sample.localeCompare(b.sample))) {
    console.error(`  ${u.sample}\n     referenced in ${u.file.replace(ROOT + "/", "")}`);
  }
  process.exit(1);
}

console.log(
  `✓ verify-frontend-api-routes-exist: all ${frontendCalls.size} frontend /api/v1 calls resolve to a backend route ` +
    `(${ALLOWLIST.length} known-missing allowlisted).`
);
