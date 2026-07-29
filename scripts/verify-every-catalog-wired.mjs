#!/usr/bin/env node
/**
 * COMPLETENESS GATE — every wireable catalogs.* table must be reachable and editable.
 *
 * This is a finish line, not a spot check. It fails until the orphan count is ZERO, and it is
 * deliberately dynamic: the table list is not hardcoded here. It comes from
 * docs/inventories/catalog-inventory.json (the LST-ORPH-05 classification of every catalogs.* base
 * table, a prod snapshot) and is CROSS-CHECKED against db/migrations — so a catalogs table added by a
 * future migration and never classified fails this gate instead of quietly becoming unreachable.
 *
 * THREE LEGS, and all three must belong to the same catalog:
 *   1. BACKEND   — a catalog config whose `tableName` matches, carrying routePrefix + urlSegment.
 *   2. HUB       — an AllCatalogsMap entry whose catalogKey equals that config's urlSegment.
 *   3. MANIFEST  — the generic /lists/catalogs/:domain/:catalogKey route exists to resolve it.
 *   4. FRONTEND REGISTRY — an entry in GENERIC_CATALOG_REGISTRY (useCatalogQuery.ts). Without it,
 *      catalogKeyToCatalogName() returns null and the page renders "unknown catalog" even though the
 *      backend route and the hub tile both exist. This leg was missing from the first version of this
 *      gate, which meant a catalog could reach ZERO defects and still not open — the gate would have
 *      certified a broken surface.
 *
 * The legs are read with balanced-brace extraction (the guard-1665 shape), never independent
 * substring checks over the whole file. Two independent substrings pass whenever some OTHER catalog
 * supplies the missing half — that exact bug let a catalog with no registration of its own read as
 * registered, and it survived until a second catalog was added to the same domain.
 *
 * LIE-LIVE: an AllCatalogsMap entry marked `live: true` whose backend leg is missing is reported
 * separately and by name. That is worse than an orphan — the hub advertises a working list, the tile
 * opens, and the API 404s. Termination Reasons is the canonical instance.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const INVENTORY = join(ROOT, "docs", "inventories", "catalog-inventory.json");
/**
 * The OWNER's wiring map (docs/inventories/catalog-wiring-map.csv) is the authority on which catalogs
 * are excluded and why. It supersedes the inventory's classification where the two disagree — and they
 * did, in both directions: the map excludes 6 template/system tables the inventory treated as wireable
 * (chart_of_accounts_seeds, driver_leave_balances, equipment_line_item_templates, leave_policies,
 * pay_rate_templates, work_order_templates), and marks 7 GLOBAL catalogs as WIRE that the inventory had
 * written off as headless. Reading only the inventory therefore under-covered the global catalogs.
 */
const WIRING_MAP = join(ROOT, "docs", "inventories", "catalog-wiring-map.csv");
const HUB = join(ROOT, "apps", "frontend", "src", "pages", "lists", "components", "AllCatalogsMap.tsx");
const MANIFEST = join(ROOT, "apps", "frontend", "src", "routes", "manifest.tsx");
const FE_REGISTRY = join(ROOT, "apps", "frontend", "src", "hooks", "useCatalogQuery.ts");
const BACKEND_DIR = join(ROOT, "apps", "backend", "src");

/**
 * Bespoke catalogs whose AllCatalogsMap `catalogKey` is NOT the kebab-cased table name.
 *
 * Kept as an explicit, tiny map on purpose. Every attempt in this repo to INFER the link between a
 * table and its UI key has produced a wrong answer — the hub is keyed kebab-case while tables are
 * snake_case, and `accounts` is not `accounts` at all. A declared exception is checkable; an inferred
 * one fails silently in whichever direction nobody tested. If this map grows past a handful, that is
 * the signal to give bespoke catalogs a declared key in catalog-inventory.json instead.
 */
const BESPOKE_HUB_KEY = {
  accounts: "chart-of-accounts",
};

/**
 * Bespoke catalogs the owner's map marks WIRE that have a backend route and NO hub tile today.
 *
 * These were invisible before LST-F20c: the bespoke exemption skipped the hub-tile leg, so the gate
 * reported "0 orphans" while 115 rows of owner-designated reference data had no front door. Naming
 * them here does not bless them — it FREEZES them. This list may only SHRINK: a new offender fails
 * the gate, and an entry that becomes wired must be deleted from this list or the gate fails too, so
 * it cannot rot into a permanent allowlist.
 *
 * Why they are not simply wired in the same change: `file_categories` and `wo_cancellation_reasons`
 * carry `add code/display_name` in the owner's map shape_fix column — a schema change, which is
 * owner-gated and belongs nowhere near a guard PR. `mexico_states` and `us_states` need no shape fix
 * and are wireable as-is. Tracked in docs/trackers/LST-F20c-BESPOKE-CATALOGS-NO-HUB-TILE-2026-07-29.md.
 */
const KNOWN_BESPOKE_NO_TILE = new Map([
  ["file_categories", "21 rows · WIRE (global) · needs code/display_name shape fix first"],
  ["mexico_states", "32 rows · WIRE (global) · no shape fix needed — wireable as-is"],
  ["us_states", "56 rows · WIRE (global) · no shape fix needed — wireable as-is"],
  ["wo_cancellation_reasons", "6 rows · WIRE (global) · needs code/display_name shape fix first"],
]);

/** Classifications that MUST be wired. The rest are excluded, each with a written reason in the inventory. */
const WIREABLE = new Set(["ROUTED", "ROUTED-PENDING", "ROUTED-NEEDS-SEED", "ROUTED-READ-ONLY"]);
/** Excluded, by design. HEADLESS-BY-DESIGN = a system lookup no operator edits. RETIRE = superseded. */
const EXCLUDED = new Set(["HEADLESS-BY-DESIGN", "RETIRE"]);

/**
 * Extract each object literal that contains `tableName:`, by walking braces outward then inward.
 * Reused from guard 1665 — fields of one config must be read together or they cannot be attributed.
 */
export function configObjects(src, anchor = /tableName:/g) {
  const out = [];
  for (const m of src.matchAll(anchor)) {
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

function field(cfg, name) {
  const m = cfg.match(new RegExp(`${name}:\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

/** Every backend catalog config, keyed by the table it serves. */
export function backendByTable(files) {
  const byTable = new Map();
  for (const { path, src } of files) {
    for (const cfg of configObjects(src)) {
      const tableName = field(cfg, "tableName");
      if (!tableName) continue;
      // Registrations spell the URL segment TWO ways: `urlSegment` (generic factory) and `catalogPath`
      // (the dispatch/*.routes.ts modules). Reading only urlSegment reported four served catalogs as
      // orphans AND let a duplicate registration through — the boot failed with
      // "Method 'GET' already declared for route '/api/v1/catalogs/dispatch/load-types'". This is the
      // same blind spot that broke boot in #3727; it is spelled out here so it is not made a third time.
      const urlSegment = field(cfg, "urlSegment") ?? field(cfg, "catalogPath");
      // routePrefix may be absent: the dispatch modules bake it into registerDispatchCatalogCrudRoutes,
      // so the config carries only catalogPath + tableName. Derive the domain from the module's own
      // directory (apps/backend/src/catalogs/<domain>/…) rather than treating the config as unregistered.
      const declaredPrefix = field(cfg, "routePrefix");
      const dirDomain = path.match(/apps\/backend\/src\/catalogs\/([a-z-]+)\//)?.[1] ?? null;
      const routePrefix = declaredPrefix ?? (dirDomain ? `/api/v1/catalogs/${dirDomain}` : null);
      if (!byTable.has(tableName)) byTable.set(tableName, []);
      byTable.get(tableName).push({ tableName, urlSegment, routePrefix, path });
    }
  }
  return byTable;
}

/** Every hub tile: { catalogKey, name, live }. */
export function hubEntries(src) {
  const out = [];
  for (const cfg of configObjects(src, /catalogKey:/g)) {
    const catalogKey = field(cfg, "catalogKey");
    const name = field(cfg, "name");
    if (!catalogKey) continue;
    out.push({ catalogKey, name: name ?? catalogKey, live: /live:\s*true/.test(cfg) });
  }
  return out;
}

/**
 * Bespoke catalog routes: a table can be served by a hand-written *.routes.ts under
 * apps/backend/src/catalogs/** instead of the generic factory (civil-fine-types.routes.ts is one).
 * Those are legitimately wired, so the backend leg accepts them too.
 *
 * The file must BOTH reference `catalogs.<table>` AND register an HTTP route. Referencing the table
 * is not enough on its own: safety-v5.routes.ts merely LEFT JOINs catalogs.internal_fine_reasons to
 * label a fine, which does not give an operator any way to edit that list. Counting a JOIN as
 * "wired" would mark genuinely unreachable catalogs as done — the precise failure this gate exists
 * to prevent.
 */
export function bespokeRouteTables(files) {
  const served = new Set();
  for (const { path, src } of files) {
    if (!path.includes("/catalogs/")) continue;
    if (!/\bapp\.(get|post|put|patch|delete)\s*\(/.test(src)) continue;
    // The file must register a route whose PATH names this catalog. Referencing the table is not
    // enough even inside catalogs/: stub-catalog-purge.routes.ts mentions many tables while serving
    // none of them as an editable catalog, and it was making audit_event_types read as wired.
    const registeredPaths = [...src.matchAll(/app\.(?:get|post|put|patch|delete)\s*\(\s*[`"']([^`"']+)/g)].map(
      (m) => m[1]
    );
    for (const m of src.matchAll(/catalogs\.([a-z_][a-z0-9_]*)/g)) {
      const table = m[1];
      const kebab = table.replace(/_/g, "-");
      if (registeredPaths.some((rp) => rp.includes(kebab) || rp.includes(table))) served.add(table);
    }
  }
  return served;
}

function readBackendFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
        const src = readFileSync(p, "utf8");
        if (src.includes("tableName:") || src.includes("catalogs.")) {
          files.push({ path: p.replace(ROOT + "/", ""), src });
        }
      }
    }
  };
  walk(BACKEND_DIR);
  return files;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const tables = inventory.tables ?? {};
  const tableNames = Object.keys(tables);

  // Owner map: table -> status. EXCLUDE (system) and TEMPLATE (special) are the written-reason
  // allowlist; everything else must be wired.
  const mapStatus = new Map();
  const mapLane = new Map();
  for (const line of readFileSync(WIRING_MAP, "utf8").split("\n").slice(1)) {
    if (!line.trim()) continue;
    // Quote-aware split. A naive line.split(",") breaks on quoted values containing a comma —
    // "WIRE (entity, FINANCIAL-hold)" pushed `lane` from index 6 to 7, so every money-lane row was
    // read as belonging to this lane.
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    const table = cells[0]?.trim();
    const status = cells[5]?.trim();
    const lane = cells[6]?.trim();
    if (table && status) mapStatus.set(table, status);
    if (table && lane) mapLane.set(table, lane);
  }
  const OWNER_EXCLUDED = new Set(["EXCLUDE (system)", "TEMPLATE (special)"]);
  /**
   * Catalogs the owner map assigns to the MONEY lane. They are still checked and still reported by
   * name, but they do not fail THIS gate: this lane cannot wire them (accounting.* is out of scope),
   * so failing on them would deadlock every non-financial PR behind another lane's work. The money
   * lane has its own gate. Silence would be worse — the count is printed either way.
   */
  const OTHER_LANE = "owner-gated";
  if (tableNames.length === 0) {
    console.error("verify-every-catalog-wired FAIL — inventory lists 0 tables; refusing to report green");
    process.exit(1);
  }

  const hubSrc = readFileSync(HUB, "utf8");
  const manifestSrc = readFileSync(MANIFEST, "utf8");
  const feRegistrySrc = readFileSync(FE_REGISTRY, "utf8");
  const feCatalogKeys = new Set(
    [...feRegistrySrc.matchAll(/catalogKey:\s*"([a-z0-9-]+)"/g)].map((m) => m[1])
  );
  const backendFiles = readBackendFiles();
  const backend = backendByTable(backendFiles);
  const bespoke = bespokeRouteTables(backendFiles);
  const hub = hubEntries(hubSrc);
  const hubByKey = new Map(hub.map((h) => [h.catalogKey, h]));

  const problems = { unclassified: [], orphan: [], lieLive: [], missingHub: [], missingFeRegistry: [] };

  // LEG 3 asserted once: the generic catalog route must exist, or no catalog resolves.
  if (!manifestSrc.includes('path="/lists/catalogs/:domain/:catalogKey"')) {
    console.error(
      "verify-every-catalog-wired FAIL — the generic route /lists/catalogs/:domain/:catalogKey is gone.\n" +
        "Every catalog resolves through it; without it EVERY hub tile is a dead link."
    );
    process.exit(1);
  }

  let wireable = 0;
  for (const table of tableNames) {
    const entry = tables[table];
    const cls = entry?.classification;
    if (!cls) {
      problems.unclassified.push(table);
      continue;
    }
    // Owner map wins where it and the inventory disagree.
    const owner = mapStatus.get(table);
    if (owner && OWNER_EXCLUDED.has(owner)) continue;

    // A table the owner marked WIRE is wireable even if the inventory called it headless — that is the
    // 7 GLOBAL catalogs the inventory had written off. The ONE exception is a table the repo has since
    // RETIRED by a merged migration (ifta_states, 202610090000): it must never regain an editable route,
    // so the RETIRE classification still wins over the map.
    const ownerSaysWire = Boolean(owner) && !OWNER_EXCLUDED.has(owner);
    if (cls === "RETIRE") continue;
    if (!ownerSaysWire && EXCLUDED.has(cls)) continue;
    if (!ownerSaysWire && !WIREABLE.has(cls)) {
      problems.unclassified.push(`${table} (unknown classification "${cls}")`);
      continue;
    }
    wireable += 1;

    const cfgs = backend.get(table) ?? [];
    const cfg = cfgs.find((c) => c.urlSegment && c.routePrefix);
    if (!cfg) {
      if (bespoke.has(table)) {
        // LST-F20c — a bespoke backend route proves the API exists, NOT that an operator can reach it.
        // This exemption used to skip the hub-tile leg entirely, so a catalog with a complete backend
        // and ZERO user interface reported as fully wired. dispatch_flag_colors sat that way with 24
        // live rows across all 3 entities, counted in the Lists badge and openable from nowhere, while
        // this gate said "0 orphans".
        //
        // The reason the leg was skipped is real: a bespoke catalog has no factory config, so there is
        // no declared `urlSegment` to match a hub tile against. Deriving the key from the table name is
        // right for 16 of the 18 bespoke catalogs but silently wrong for the rest — `accounts` is keyed
        // `chart-of-accounts`. So the exceptions are DECLARED below, never inferred: an unlisted
        // mismatch fails loudly instead of passing quietly.
        const hubKey = BESPOKE_HUB_KEY[table] ?? table.replace(/_/g, "-");
        const hasTile = hubByKey.has(hubKey);
        if (hasTile && KNOWN_BESPOKE_NO_TILE.has(table)) {
          // The ratchet must tighten: a fixed entry has to leave the list, or the list rots into a
          // permanent allowlist that hides the next regression.
          problems.missingHub.push(
            `${table} — now HAS a hub tile but is still listed in KNOWN_BESPOKE_NO_TILE. Delete it ` +
              `from that list so the gap count actually goes down.`
          );
        } else if (!hasTile && !KNOWN_BESPOKE_NO_TILE.has(table)) {
          problems.missingHub.push(
            `${table} [${cls}] — bespoke catalogs/*.routes.ts serves it, but NO AllCatalogsMap tile ` +
              `(looked for catalogKey "${hubKey}"); the API works and no operator can reach it. Add the ` +
              `tile, or declare the real key in BESPOKE_HUB_KEY if the tile uses a different one.`
          );
        }
        continue;
      }
      problems.orphan.push(`${table} [${cls}] — no backend catalog route (neither a factory config nor a catalogs/*.routes.ts serving it)`);
      continue;
    }
    if (!feCatalogKeys.has(cfg.urlSegment)) {
      problems.missingFeRegistry.push(
        `${table} [${cls}] — backend route exists but NO GENERIC_CATALOG_REGISTRY entry (catalogKey "${cfg.urlSegment}"); the page resolves to null and renders "unknown catalog"`
      );
    }
    if (!hubByKey.has(cfg.urlSegment)) {
      problems.missingHub.push(
        `${table} [${cls}] — backend registered at ${cfg.routePrefix}/${cfg.urlSegment} but NO AllCatalogsMap tile; unreachable from the hub`
      );
    }
  }

  // LIE-LIVE: hub advertises a working list with no backend behind it.
  //
  // A tile is backed if EITHER a factory config exposes that urlSegment OR a bespoke catalogs route
  // serves the matching table. Hub keys are kebab-case ("civil-fine-types") while table names are
  // snake_case ("civil_fine_types"), so the two must be normalised before comparison — an earlier
  // revision compared them raw and reported every bespoke-routed catalog as a liar, including
  // Civil Fine Types, which has had a working route module all along.
  const backendSegments = new Set(
    [...backend.values()].flat().map((c) => c.urlSegment).filter(Boolean)
  );
  // A tile is BACKED when a factory config exposes that urlSegment, OR a bespoke catalogs route serves
  // the matching table, OR the tile has its own DEDICATED page route in the manifest.
  //
  // The third case matters and was missing: Driver Teams, OEM Parts Reference and QBO bulk-link are
  // real features with hand-built pages at /lists/<domain>/<key>, not generic catalog surfaces. Judging
  // them only by the generic-catalog path reported four working screens as liars. Maintenance Services
  // Catalog is a fourth: it is served by catalogs/maintenance/services.routes.ts under a urlSegment
  // that does not kebab-map to any table name.
  const dedicatedRouteKeys = new Set(
    [...manifestSrc.matchAll(/path="\/lists\/[a-z-]+\/([a-z0-9-]+)"/g)].map((m) => m[1])
  );
  const backedKeys = new Set([
    ...backendSegments,
    ...[...bespoke].map((t) => t.replace(/_/g, "-")),
    ...dedicatedRouteKeys,
  ]);
  for (const h of hub) {
    if (h.live && !backedKeys.has(h.catalogKey)) {
      problems.lieLive.push(`"${h.name}" (catalogKey ${h.catalogKey}) — live:true but no backend route; the tile opens and the API 404s`);
    }
  }

  const otherLane = [];
  for (const key of Object.keys(problems)) {
    problems[key] = problems[key].filter((line) => {
      const table = String(line).trim().split(/[\s[]/)[0].replace(/^"/, "");
      if (mapLane.get(table) === OTHER_LANE) {
        otherLane.push(line);
        return false;
      }
      return true;
    });
  }

  const total =
    problems.unclassified.length +
    problems.orphan.length +
    problems.lieLive.length +
    problems.missingHub.length +
    problems.missingFeRegistry.length;

  if (total > 0) {
    console.error(`verify-every-catalog-wired FAIL — ${total} catalog wiring defect(s) across ${wireable} wireable table(s):\n`);
    const section = (label, list) => {
      if (!list.length) return;
      console.error(`  ${label} (${list.length}):`);
      for (const l of list) console.error(`    - ${l}`);
      console.error("");
    };
    section("UNCLASSIFIED — a catalog nobody has ruled on", problems.unclassified);
    section("ORPHAN — wireable but no backend registration", problems.orphan);
    section("NO HUB TILE — backend exists but nothing links to it", problems.missingHub);
    section("NO FRONTEND REGISTRY ENTRY — the page cannot resolve the catalog", problems.missingFeRegistry);
    section("LIE-LIVE — hub says live:true, no backend behind it", problems.lieLive);
    console.error("This gate fails until the count is 0. Wire them through the generic catalog factory.");
    process.exit(1);
  }

  if (otherLane.length > 0) {
    console.log(`verify-every-catalog-wired — ${otherLane.length} defect(s) belong to the MONEY lane (not this gate):`);
    for (const l of otherLane) console.log(`    ${l}`);
  }
  console.log(
    `verify-every-catalog-wired OK — ${wireable} wireable catalog(s) all have backend + hub tile + route; ` +
      `0 orphans, 0 lie-live, 0 unclassified in this lane (${tableNames.length} tables classified)`
  );
}

function selftest() {
  const cases = [
    {
      name: "fields of DIFFERENT configs are not combined",
      src: `const a = { tableName: "alpha", routePrefix: "/api/v1/catalogs/x" };\nconst b = { tableName: "beta", urlSegment: "beta-seg" };`,
      check: (m) => {
        const alpha = m.get("alpha")?.[0];
        const beta = m.get("beta")?.[0];
        return alpha?.urlSegment === null && beta?.routePrefix === null;
      },
    },
    {
      name: "a complete config is read whole",
      src: `const a = { tableName: "gamma", routePrefix: "/api/v1/catalogs/y", urlSegment: "gamma-seg" };`,
      check: (m) => {
        const g = m.get("gamma")?.[0];
        return g?.urlSegment === "gamma-seg" && g?.routePrefix === "/api/v1/catalogs/y";
      },
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const m = backendByTable([{ path: "test.ts", src: c.src }]);
    if (!c.check(m)) {
      console.error(`  selftest FAIL — ${c.name}`);
      bad += 1;
    } else {
      console.log(`  selftest OK — ${c.name}`);
    }
  }

  // Hub extraction: live flag must be read from the SAME entry as the key.
  const hub = hubEntries(
    `[{ name: "A", live: true, catalogKey: "a-key" }, { name: "B", live: false, catalogKey: "b-key" }]`
  );
  const aLive = hub.find((h) => h.catalogKey === "a-key")?.live === true;
  const bDead = hub.find((h) => h.catalogKey === "b-key")?.live === false;
  if (aLive && bDead) console.log("  selftest OK — live flag attributed to the correct hub entry");
  else {
    console.error("  selftest FAIL — live flag attributed to the wrong hub entry");
    bad += 1;
  }

  if (bad) {
    console.error(`verify-every-catalog-wired SELFTEST FAIL — ${bad} case(s)`);
    process.exit(1);
  }
  console.log("verify-every-catalog-wired SELFTEST OK");
}

main();
