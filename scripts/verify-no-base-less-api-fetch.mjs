#!/usr/bin/env node
/**
 * GUARD: no frontend fetch may bypass the shared client's base-URL resolution.
 *
 * WHY THIS EXISTS (2026-07-23 live audit — SAF-F06, CONFIRMED against prod)
 * Seven page/hook files defined their own tiny `apiGet`/`apiPost` helpers that called
 * `fetch(path, { credentials: "include" })` with a root-relative "/api/v1/..." path and NO base URL.
 *
 * render.yaml sets VITE_API_BASE_URL=https://api.ih35dispatch.com and the static site declares no
 * /api rewrite, so those requests went to the SPA origin. Measured on prod:
 *
 *   GET https://app.ih35dispatch.com/api/v1/healthz/shallow -> 200  text/html   (index.html)
 *   GET https://api.ih35dispatch.com/api/v1/healthz/shallow -> 200  application/json
 *
 * The SPA fallback answers 200, so `res.ok` is TRUE and the customary `if (!res.ok) throw` guard
 * never fires. `res.json()` then throws on HTML, react-query swallows it into an error state, and
 * the panel renders as EMPTY — indistinguishable from "no data yet". That is why it survived: the
 * failure mode looks exactly like a legitimately empty table.
 *
 * Rule: call the shared client (apiRequest/apiRequestFormData), or at minimum wrap the path in
 * resolveApiUrl(). A bare fetch of an /api path outside api/client.ts is a defect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-no-base-less-api-fetch";
const SELFTEST = process.argv.includes("--selftest");

// The shared client is the ONE place allowed to call fetch() on a resolved URL.
const ALLOWED = new Set([path.join("apps/frontend/src/api/client.ts")]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Injectable: the selftest runs this against mutated copies of real source. */
export function assertNoBaseLessFetch(sources) {
  const problems = [];
  const entries =
    sources ??
    Object.fromEntries(walk(SRC).map((abs) => [path.relative(ROOT, abs), fs.readFileSync(abs, "utf8")]));

  for (const [rel, raw] of Object.entries(entries)) {
    if (ALLOWED.has(rel)) continue;
    const code = stripComments(raw);

    // A literal /api path handed straight to fetch().
    for (const m of code.matchAll(/fetch\(\s*[`"']\/api\//g)) {
      const line = code.slice(0, m.index).split("\n").length;
      problems.push(
        `${rel}:${line}: fetch() called with a literal "/api/..." path — it resolves against the SPA ` +
          `origin, which answers 200 with index.html, so res.ok is true and res.json() throws. ` +
          `Use apiRequest() or wrap the path in resolveApiUrl().`
      );
    }

    // A path variable handed to fetch() without resolveApiUrl().
    for (const m of code.matchAll(/fetch\(\s*(?!resolveApiUrl|buildUrl)([A-Za-z_$][\w$]*)\s*[,)]/g)) {
      const varName = m[1];
      // Only flag identifiers that plausibly carry an API path.
      if (!/^(path|url|endpoint|href)$/i.test(varName)) continue;
      const line = code.slice(0, m.index).split("\n").length;
      problems.push(
        `${rel}:${line}: fetch(${varName}) does not resolve the API base URL — a root-relative ` +
          `/api path silently receives index.html (HTTP 200) and renders as empty data. ` +
          `Wrap it: fetch(resolveApiUrl(${varName}), ...) or use apiRequest().`
      );
    }
  }
  return problems;
}

if (SELFTEST) {
  const failures = [];
  const expectCaught = (name, sources, expect) => {
    const problems = assertNoBaseLessFetch(sources);
    if (!problems.some((p) => p.includes(expect))) {
      failures.push(
        `${name}: planted defect NOT caught (expected "${expect}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  // Case 1: a page-local helper doing bare fetch(path) — the exact SAF-F06 shape.
  expectCaught(
    "bare-fetch-path",
    {
      "apps/frontend/src/pages/x/Bad.tsx":
        'async function apiGet(path: string) {\n  const res = await fetch(path, { credentials: "include" });\n  return res.json();\n}\n',
    },
    "does not resolve the API base URL"
  );

  // Case 2: a literal /api path.
  expectCaught(
    "literal-api-path",
    { "apps/frontend/src/pages/x/Bad2.tsx": 'const r = await fetch("/api/v1/thing");\n' },
    'literal "/api/..." path'
  );

  // Case 3: the fixed shape must NOT be flagged (guards against over-matching).
  const okProblems = assertNoBaseLessFetch({
    "apps/frontend/src/pages/x/Good.tsx":
      'import { resolveApiUrl } from "../../api/client";\nasync function apiGet(path: string) {\n  const res = await fetch(resolveApiUrl(path), { credentials: "include" });\n  return res.json();\n}\n',
  });
  if (okProblems.length) {
    failures.push(`false-positive: the corrected shape was flagged: ${okProblems.join(" | ")}`);
  }

  // The live tree must be clean.
  const live = assertNoBaseLessFetch();
  if (live.length) failures.push(`live sources FAIL: ${live.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 planted defects caught, corrected shape not flagged, live clean`);
  process.exit(0);
}

const problems = assertNoBaseLessFetch();
if (problems.length) {
  console.error(`${LABEL} FAILED — ${problems.length} base-less API fetch site(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every frontend API fetch resolves the base URL`);


// FAIL-K2/K3 — ApiError must surface response body, not bare "status 400".
{
  const clientPath = path.join(ROOT, "apps/frontend/src/api/client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  if (!src.includes("function messageFromApiPayload") || !src.includes("messageFromApiPayload(status, data)")) {
    console.error("FAIL-K2: apps/frontend/src/api/client.ts must derive ApiError.message from response body (messageFromApiPayload)");
    process.exit(1);
  }
}

