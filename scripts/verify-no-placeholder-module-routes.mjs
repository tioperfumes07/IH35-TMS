#!/usr/bin/env node
/**
 * No real module route may resolve to ComingSoonPage.
 *
 * A placeholder standing in for a feature is a dead end the owner cannot tell apart from an unbuilt
 * one — it looks navigable and does nothing. Two uses ARE legitimate and are allowed by name:
 *   - the explicit /coming-soon route itself;
 *   - the /lists/:domain and /lists/:domain/:catalogKey fallbacks, which render it only when a domain
 *     or catalog key does not resolve (an unknown-URL page, not a stubbed feature).
 * Anything else — a named module route wired to ComingSoonPage — fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST = join(process.cwd(), "apps", "frontend", "src", "routes", "manifest.tsx");
const ALLOWED_ROUTES = new Set(["/coming-soon"]);
/** Wrapper components that legitimately fall back to the placeholder for an unknown URL. */
const ALLOWED_FALLBACK_COMPONENTS = new Set(["ListsDomainRoute", "ListsCatalogKeyRoute"]);

export function placeholderRoutes(src) {
  const out = [];
  // Split on <Route so each chunk is one route element. A non-greedy regex to ">" stops inside the
  // nested element={<ProtectedRoute>, which hid every placeholder — the selftest caught that.
  const chunks = src.split(/<Route\b/).slice(1);
  for (const chunk of chunks) {
    const block = chunk.split(/<Route\b/)[0];
    const pathM = block.match(/path="([^"]+)"/);
    if (!pathM) continue;
    const path = pathM[1];
    if (!/<ComingSoonPage\s*\/>/.test(block)) continue;
    if (ALLOWED_ROUTES.has(path)) continue;
    out.push(path);
  }
  return out;
}

function selftest() {
  const cases = [
    { name: "named module route on ComingSoon is caught",
      src: `<Route path="/maintenance/tires" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />`, expect: 1 },
    { name: "the sanctioned /coming-soon route passes",
      src: `<Route path="/coming-soon" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />`, expect: 0 },
    { name: "a real component route passes",
      src: `<Route path="/maintenance/tires" element={<ProtectedRoute><TiresPage /></ProtectedRoute>} />`, expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = placeholderRoutes(c.src).length;
    if (got !== c.expect) { console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/${cases.length}`); process.exit(1); }
  console.log(`verify-no-placeholder-module-routes SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const src = readFileSync(MANIFEST, "utf8");
  const routeCount = (src.match(/path="/g) || []).length;
  if (routeCount === 0) {
    console.error("verify-no-placeholder-module-routes FAIL — 0 routes parsed; refusing to report green");
    process.exit(1);
  }
  const bad = placeholderRoutes(src);
  if (bad.length) {
    console.error("verify-no-placeholder-module-routes FAIL — route(s) resolve to a placeholder:");
    for (const p of bad) console.error(`  ${p}`);
    console.error("\nA placeholder on a named module route is a dead end. Build the surface or remove the route.");
    process.exit(1);
  }
  console.log(
    `verify-no-placeholder-module-routes OK — ${routeCount} route(s); no named module route resolves to ComingSoonPage ` +
      `(allowed: /coming-soon, ${[...ALLOWED_FALLBACK_COMPONENTS].join("/")} unknown-URL fallbacks)`
  );
}

main();
