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
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-converted-catalog-reachable-from-hub";

const FE_REGISTRY = "apps/frontend/src/hooks/useCatalogQuery.ts";
const HUB = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const BE_ROUTES = "apps/backend/src/catalogs/generic-catalog.routes.ts";

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

/**
 * Every backend file that declares catalog configs — NOT just generic-catalog.routes.ts.
 *
 * Catalogs are legitimately registered across several modules (catalogs/fuel/index.ts,
 * catalogs/fleet/*, catalogs/driver/*, and inline createCatalogRoutes({...}) calls). Reading only the
 * one file made every catalog registered elsewhere look unregistered, so this guard reported 29
 * working catalogs as facades the moment their frontend registry entries were added.
 */
function readAllBackendCatalogSources() {
  const roots = [resolve(ROOT, "apps/backend/src/catalogs")];
  const parts = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
        const src = readFileSync(p, "utf8");
        // Both spellings, or the modules that use catalogPath are never even read.
        if (src.includes("urlSegment:") || src.includes("catalogPath:")) parts.push(src);
      }
    }
  };
  for (const r of roots) walk(r);
  return parts.join("\n");
}

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
  // Anchor on BOTH spellings — urlSegment (generic factory) and catalogPath (dispatch/driver route
  // modules). Anchoring on urlSegment alone yielded zero configs for those modules, so four served
  // dispatch catalogs read as facades.
  for (const m of src.matchAll(/(?:urlSegment|catalogPath):/g)) {
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
      (cfg) =>
        // The URL segment is spelled `urlSegment` by the generic factory and `catalogPath` by the
        // dispatch/driver/accounting route modules; and those modules bake the prefix into their shared
        // registrar, so routePrefix is often absent from the config. Requiring urlSegment + routePrefix
        // together reported seven SERVED catalogs as facades. Accept either spelling, and accept a
        // config that declares the segment without a prefix.
        (cfg.includes(`urlSegment: "${catalogKey}"`) || cfg.includes(`catalogPath: "${catalogKey}"`)) &&
        (cfg.includes(`routePrefix: "${prefix}"`) || !cfg.includes("routePrefix:"))
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
    // The hub must carry the domain the registry claims — allowing for the ONE normalisation the app
    // itself performs. AllCatalogsMap groups driver catalogs under "drivers" (plural) while their API
    // routePrefix is /api/v1/catalogs/driver (singular); buildCatalogPath() maps drivers -> driver via
    // normalizeListsDomain, so both spellings resolve to the same page. Without this the guard reports
    // every driver catalog as having "nowhere to live" while its tile works perfectly.
    const hubDomainAliases = domain === "driver" ? ["driver", "drivers"] : [domain];
    if (!hubDomainAliases.some((d) => new RegExp(`key:\\s*"${d}"`).test(hub))) {
      problems.push(
        `${catalogName}: AllCatalogsMap has no domain "${domain}" — its tile has nowhere to live.`
      );
    }
  }
  return problems;
}

export function fallbackProblems(manifest) {
  const problems = [];
  if (!/import \{ catalogKeyToCatalogName \} from "\.\.\/hooks\/useCatalogQuery"/.test(manifest)) {
    problems.push("manifest must use the generic catalog registry for unmatched Lists hub cards");
  }
  if (!/catalogKeyToCatalogName\(registryDomain, catalogKey\)/.test(manifest)) {
    problems.push("ListsCatalogKeyRoute must verify the domain/key against the generic catalog registry");
  }
  if (!/\/lists\/catalogs\/\$\{registryDomain\}\/\$\{catalogKey\}/.test(manifest)) {
    problems.push("ListsCatalogKeyRoute must redirect registered fallback cards to GenericCatalogPage");
  }
  if (!/domain === "drivers" \? "driver" : domain/.test(manifest)) {
    problems.push("ListsCatalogKeyRoute must preserve the drivers hub to driver registry alias");
  }
  return problems;
}

function run() {
  const registry = read(FE_REGISTRY);
  const problems = [
    ...chainProblems({ registry, hub: read(HUB), backend: readAllBackendCatalogSources() }),
    ...fallbackProblems(read(MANIFEST)),
  ];
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
  const backend = readAllBackendCatalogSources();
  const manifest = read(MANIFEST);

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

  const brokenFallback = fallbackProblems(
    manifest.replace("catalogKeyToCatalogName(registryDomain, catalogKey)", "false")
  );
  if (!brokenFallback.some((problem) => problem.includes("verify the domain/key"))) {
    console.error("SELFTEST FAIL: removed generic Lists fallback was not caught");
    ok = false;
  } else {
    console.log("SELFTEST: 'generic Lists fallback removed -> dead card caught' -> caught as expected");
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
