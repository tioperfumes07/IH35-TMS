#!/usr/bin/env node
/**
 * verify-converted-catalog-reachable-from-hub (LST-A-01)
 *
 * THE DEFECT. A catalog gets converted to per-entity with FORCE RLS, gets a read-only endpoint so one
 * picker can consume it, and then stops there. It never reaches the Lists hub, so the owner cannot
 * find it; and it never gets a write path, so the owner cannot add, rename or retire a code even if
 * they do find it. The data is live and business-critical; the management surface simply does not
 * exist.
 *
 * FOUND LIVE 2026-07-28 on br-fancy-credit-akjnd07a:
 *   catalogs.dispatcher_error_reasons        75 rows, 3 entities, FORCE RLS
 *   catalogs.customer_quality_event_reasons  72 rows, 3 entities, FORCE RLS
 * Both had a GET-only feed at a NON-standard path (/api/v1/catalogs/<segment>, no domain segment) and
 * no entry in AllCatalogsMap. 147 rows of reason codes the owner could read in a dropdown and could
 * not manage anywhere in the product.
 *
 * WHY A HUB ENTRY ALONE WOULD HAVE BEEN A LIE. The generic catalog page resolves its API as
 * /api/v1/catalogs/{domain}/{segment}. Adding the hub tile without registering the backend at that
 * path yields a tile that opens a page that calls a 404 — the same facade class as the safety
 * EntityLinks that navigated to a list and drilled through to nothing. So this guard asserts the whole
 * chain, not the tile.
 *
 * THE CHAIN, per registered generic catalog:
 *   1. registered in the FRONTEND registry (GENERIC_CATALOG_REGISTRY)
 *   2. registered on the BACKEND at the matching routePrefix + urlSegment
 *   3. present in the Lists hub (AllCatalogsMap) under its domain, with the same catalogKey
 * A catalog that satisfies 1+2 but not 3 is invisible. One that satisfies 1+3 but not 2 is a facade.
 *
 * Usage: node scripts/verify-converted-catalog-reachable-from-hub.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-converted-catalog-reachable-from-hub";

const FE_REGISTRY = "apps/frontend/src/hooks/useCatalogQuery.ts";
const HUB = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const BE_ROUTES = "apps/backend/src/catalogs/generic-catalog.routes.ts";

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

/** Pull {catalogName, domain, catalogKey} from the frontend registry. */
export function parseRegistry(src) {
  const out = [];
  const re = /catalogName:\s*"([^"]+)",[\s\S]{0,400}?domain:\s*"([^"]+)",\s*\n\s*catalogKey:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ catalogName: m[1], domain: m[2], catalogKey: m[3] });
  return out;
}

/**
 * Each `GenericCatalogConfig` object literal, extracted by BALANCED BRACES so a config's fields can
 * only ever be read together. Substring checks across the whole file cannot tell which config a field
 * belongs to.
 */
export function backendConfigs(src) {
  const out = [];
  for (const m of src.matchAll(/urlSegment:/g)) {
    let depth = 0;
    let i = m.index;
    while (i > 0) {
      if (src[i] === "}") depth += 1;
      else if (src[i] === "{") {
        if (depth === 0) break;
        depth -= 1;
      }
      i -= 1;
    }
    let j = i;
    depth = 0;
    while (j < src.length) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      j += 1;
    }
    out.push(src.slice(i, j + 1));
  }
  return out;
}

export function chainProblems({ registry, hub, backend }) {
  const problems = [];
  for (const { catalogName, domain, catalogKey } of parseRegistry(registry)) {
    // 2. backend registered at the matching path
    const prefix = `/api/v1/catalogs/${domain}`;
    // The prefix and the segment must belong to the SAME config object. This used to be two
    // INDEPENDENT substring checks over the whole file, which passes whenever some OTHER catalog
    // happens to supply the missing half — so a catalog with no registration of its own could read as
    // registered. It went unnoticed while only one catalog per domain existed; adding a second
    // dispatch catalog exposed it, and the guard's own selftest is what caught it. Pair them by
    // extracting each config's braces.
    const hasBackend = backendConfigs(backend).some(
      (cfg) => cfg.includes(`routePrefix: "${prefix}"`) && cfg.includes(`urlSegment: "${catalogKey}"`)
    );
    if (!hasBackend) {
      problems.push(
        `${catalogName}: no backend registration at routePrefix "${prefix}" + urlSegment "${catalogKey}" — the hub tile would open a page whose API 404s (facade).`
      );
    }
    // 3. reachable from the Lists hub
    if (!new RegExp(`catalogKey:\\s*"${catalogKey}"`).test(hub)) {
      problems.push(
        `${catalogName}: not in AllCatalogsMap — the catalog is live and manageable but the owner cannot find it from the Lists hub (invisible).`
      );
    }
    // the hub must carry the domain the registry claims
    if (!new RegExp(`key:\\s*"${domain}"`).test(hub)) {
      problems.push(
        `${catalogName}: AllCatalogsMap has no domain "${domain}" — its tile has nowhere to live.`
      );
    }
  }
  return problems;
}

function run() {
  const registry = read(FE_REGISTRY);
  const problems = chainProblems({ registry, hub: read(HUB), backend: read(BE_ROUTES) });
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(
    `[${LABEL}] OK — ${parseRegistry(registry).length} generic catalog(s): each is registered on the backend at its own route AND reachable from the Lists hub`
  );
  return true;
}

function selftest() {
  let ok = true;
  if (!run()) {
    console.error("SELFTEST FAIL: the real tree is flagged — false positive");
    ok = false;
  }

  const registry = read(FE_REGISTRY);
  const hub = read(HUB);
  const backend = read(BE_ROUTES);

  const cases = [
    [
      "backend registration removed -> facade caught",
      { registry, hub, backend: backend.replace(/routePrefix: "\/api\/v1\/catalogs\/dispatch"/, 'routePrefix: "/api/v1/catalogs/nope"') },
      /no backend registration/,
    ],
    [
      "hub tile removed -> invisible catalog caught",
      { registry, hub: hub.replace(/catalogKey: "dispatcher-error-reasons"/, 'catalogKey: "gone"'), backend },
      /not in AllCatalogsMap/,
    ],
    [
      "hub domain removed -> nowhere to live caught",
      { registry, hub: hub.replace(/key: "customers"/, 'key: "removed"'), backend },
      /has no domain/,
    ],
    ["untouched -> clean", { registry, hub, backend }, null],
  ];

  for (const [name, sources, expect] of cases) {
    const problems = chainProblems(sources);
    if (expect === null) {
      if (problems.length) {
        console.error(`SELFTEST FAIL: '${name}' expected clean, got ${problems.length}`);
        ok = false;
      } else console.log(`SELFTEST: '${name}' -> clean as expected`);
    } else if (!problems.some((p) => expect.test(p))) {
      console.error(`SELFTEST FAIL: '${name}' not caught (expected ${expect})`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> caught as expected`);
    }
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
