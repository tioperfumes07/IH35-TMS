#!/usr/bin/env node
/**
 * GUARD — an entity picker must not be capped below the real population of what it lists.
 *
 * THE DEFECT CLASS: a picker fetches `limit: 200` with no server-side search, the entity has more
 * than 200 rows, and the list silently returns the first 200 alphabetically. There is no empty
 * state, no warning, nothing that says the list was cut. This already happened once on customers
 * (#3899, guard verify-customer-picker-not-capped-below-fleet): 2,693 customers, 200-row cap, 92%
 * dropped, across invoice creation / payment recording / the invoice list filter.
 *
 * WHY A CAP IS WORSE THAN A FAILURE: a failed request shows an error. A silent truncation shows a
 * SHORTER LIST THAT LOOKS COMPLETE. The operator's only signal is "that vendor isn't set up yet" —
 * which is false, and leads to creating a DUPLICATE vendor, which then splits that vendor's A/P
 * across two records.
 *
 * WHY THIS GUARD IS TABLE-DRIVEN rather than a third copy of the customer one: the class is not
 * customer-specific. Measured on prod 2026-08-01 (TRANSP scope, which is what an entity-scoped
 * picker sees):
 *
 *     mdata.customers   1,247   guarded by verify-customer-picker-not-capped-below-fleet
 *     mdata.vendors       950   4.75x a 200-cap  <- this guard
 *     catalogs.accounts   399   2x a 200-cap
 *     catalogs.items      190   95% of a 200-cap — breaches on the next ~10 rows
 *     catalogs.classes    177   89% of a 200-cap — breaches soon
 *
 * Adding an entity here is one line, so the next one does not need a new file. Entities are added
 * when their population approaches the cap, not after an operator has already lost rows.
 *
 * ASSERTED: no listed fetch uses a numeric limit below MIN_LIMIT unless it ALSO passes a `search`
 * term — server-side type-ahead makes a small page correct, because the server does the filtering
 * rather than the page boundary.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:entity-picker-not-capped";
const MIN_LIMIT = 1000;

/** fn = the client call; live = prod TRANSP-scope population at the date noted above. */
const GUARDED = [
  { fn: "listVendors", entity: "mdata.vendors", live: 950 },
  // customers are covered by verify-customer-picker-not-capped-below-fleet (guard 1875).
  // Add catalogs.items / catalogs.classes here when they cross ~200; both are close.
];

/** Regression pins — pages that already breached the cap and must not regress. */
const PINNED = [
  {
    rel: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
    fn: "listVendors",
    entity: "mdata.vendors",
  },
];

export function findCappedCalls(source, fn) {
  const out = [];
  const re = new RegExp(`${fn}\\(\\s*\\{([^}]*)\\}`, "g");
  let m;
  while ((m = re.exec(source)) !== null) {
    const args = m[1];
    const lim = args.match(/limit:\s*(\d+)/);
    if (!lim) continue; // no explicit limit — not this guard's concern
    if (/\bsearch\s*:/.test(args)) continue; // server-side filtering makes a small page correct
    if (Number(lim[1]) < MIN_LIMIT) out.push(Number(lim[1]));
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(full);
  }
  return out;
}

export function run() {
  const files = walk(path.join(ROOT, "apps/frontend/src"));
  const problems = [];
  for (const pin of PINNED) {
    const full = path.join(ROOT, pin.rel);
    const src = readFileSync(full, "utf8");
    for (const lim of findCappedCalls(src, pin.fn)) {
      problems.push(
        `${pin.rel}: pinned regression — ${pin.fn}(limit: ${lim}) with no search term ` +
          `(~950 ${pin.entity} rows in TRANSP). Use limit >= ${MIN_LIMIT}, or pass a search term.`
      );
    }
  }
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const g of GUARDED) {
      for (const lim of findCappedCalls(src, g.fn)) {
        problems.push(
          `${path.relative(ROOT, f)}: ${g.fn}(limit: ${lim}) with no search term. Prod has ~${g.live} ` +
            `${g.entity} rows in TRANSP scope, so this silently drops most of them. ` +
            `Use limit >= ${MIN_LIMIT}, or pass a search term.`
        );
      }
    }
  }
  if (problems.length) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return {
    ok: true,
    message: `${LABEL} OK — no guarded entity picker capped below ${MIN_LIMIT} without a search term (${GUARDED
      .map((g) => g.fn)
      .join(", ")})`,
  };
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  t("the real defect shape is caught",
    findCappedCalls("listVendors({ operating_company_id: x, limit: 200 })", "listVendors").length === 1);
  t("limit >= MIN_LIMIT passes",
    findCappedCalls("listVendors({ operating_company_id: x, limit: 1000 })", "listVendors").length === 0);
  t("a small limit WITH a search term is allowed",
    findCappedCalls("listVendors({ operating_company_id: x, limit: 200, search: s })", "listVendors").length === 0);
  t("no explicit limit is not flagged",
    findCappedCalls("listVendors({ operating_company_id: x })", "listVendors").length === 0);
  t("every capped call is reported, not just the first",
    findCappedCalls("listVendors({ limit: 200 })\nlistVendors({ limit: 50 })", "listVendors").length === 2);
  t("a different entity's call is not attributed to this one",
    findCappedCalls("listDrivers({ limit: 200 })", "listVendors").length === 0);
  // Mutation arms — the detector must be able to return the opposite answer.
  t("mutation: unrelated source yields nothing", findCappedCalls("const x = 1;", "listVendors").length === 0);
  t("mutation: the actual limit value is reported",
    findCappedCalls("listVendors({ limit: 200 })", "listVendors")[0] === 200);
  t("pinned inventory page passes at MIN_LIMIT",
    findCappedCalls(
      readFileSync(path.join(ROOT, PINNED[0].rel), "utf8"),
      "listVendors"
    ).length === 0);
  return bad;
}

const DIRECT = process.argv[1] && process.argv[1].endsWith("verify-entity-picker-not-capped.mjs");
if (DIRECT) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 9 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const r = run();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
