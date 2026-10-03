#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["vendor"],"leaves":["cards"],"task":"ROUND-381.6-FUEL-CARDS-VENDOR"} */
/**
 * ROUND 381.6 — FAILS IF the Fuel Cards registry loses its VENDOR link (the card issuer), either direction.
 *   static — the column + same-company refusal exist in migration 202615380930; the card list selects the issuer and
 *            filters by it (?vendor_id=, the reverse); the designation route is role-gated and audited; the page shows
 *            the Issuer as a vendor link and lets the owner pick it with the vendor picker (no name guess); the vendor
 *            profile renders the reverse section.
 *   live   — once 202615380930 is applied: the column, its FK to mdata.vendors and the trigger exist; on USMCA no card
 *            type names a vendor of another company. Designations are REPORTED (the owner makes them), never required.
 * Run: node scripts/verify-fuel-card-issuer-vendor-linkage.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the issuer column, FK and same-company refusal must exist on the live database";
const LABEL = "verify-fuel-card-issuer-vendor-linkage";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "202615380930_fuel_card_type_issuer_vendor.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export const WIRES = [
  [`db/migrations/${MIGRATION}`, /ADD COLUMN IF NOT EXISTS issuer_vendor_id uuid REFERENCES mdata\.vendors\(id\)/, "issuer column with its FK"],
  [`db/migrations/${MIGRATION}`, /v\.operating_company_id = NEW\.operating_company_id/, "same-company refusal"],
  ["apps/backend/src/fuel/fuel-card-assignments.service.ts", /t\.issuer_vendor_id::text, iv\.vendor_name AS issuer_vendor_name/, "card list selects its issuer (forward)"],
  ["apps/backend/src/fuel/fuel-card-assignments.service.ts", /\$6::uuid IS NULL OR t\.issuer_vendor_id = \$6::uuid/, "card list filters by issuer vendor (reverse)"],
  ["apps/backend/src/fuel/fuel-card-assignments.routes.ts", /vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "list route accepts ?vendor_id="],
  ["apps/backend/src/fuel/fuel-card-assignments.routes.ts", /"\/api\/v1\/fuel\/card-types\/:id\/issuer"[\s\S]{0,400}requireCardWriteRole[\s\S]{0,900}fuel\.card_type\.issuer_set/, "designation route is role-gated and audited"],
  ["apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx", /label: "Issuer",[\s\S]{0,200}kind="vendor"/, "every card shows its issuer as a vendor link"],
  ["apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx", /<EntityPicker\s+kind="vendor"/, "issuer chosen with the vendor picker"],
  ["apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx", /searchParams\.get\("vendor_id"\)/, "page honours the reverse ?vendor_id="],
  ["apps/frontend/src/pages/VendorDetail.tsx", /<VendorFuelCardsReverseSection /, "vendor profile renders its fuel cards"],
  ["apps/frontend/src/pages/vendors/VendorFuelCardsReverseSection.tsx", /\/fuel\/cards\?vendor_id=/, "vendor profile links to its cards"],
];

export function staticGaps(read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null)) {
  return WIRES.flatMap(([rel, re, what]) => {
    const src = read(rel);
    if (src === null) return [`${rel}: missing (${what})`];
    return re.test(src) ? [] : [`${rel}: ${what} — not found`];
  });
}

if (process.argv.includes("--selftest")) {
  const real = staticGaps();
  const cut = staticGaps((rel) => {
    const src = fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null;
    return rel.endsWith("VendorDetail.tsx") ? src.replace(/<VendorFuelCardsReverseSection /g, "<Gone ") : src;
  });
  const cases = [
    ["the real tree is wired both ways", real.length === 0],
    ["dropping the reverse section FAILS", cut.length === 1 && cut[0].includes("VendorDetail.tsx")],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.map(([n]) => n).join("; ")}`); for (const g of real) console.error(`  ${g}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = staticGaps();
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION])).rowCount > 0;
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — ${MIGRATION} not in the ledger; static wiring checked, live not enforced`);
  } else {
    const s = (await c.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'catalogs' AND table_name = 'fuel_card_types' AND column_name = 'issuer_vendor_id') AS col,
             EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'catalogs.fuel_card_types'::regclass AND contype = 'f'
                       AND confrelid = 'mdata.vendors'::regclass) AS fk,
             EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fuel_card_type_issuer_same_company' AND tgenabled <> 'D') AS trg`)).rows[0];
    if (!s.col) fails.push("catalogs.fuel_card_types.issuer_vendor_id is missing");
    if (!s.fk) fails.push("catalogs.fuel_card_types has no FK to mdata.vendors");
    if (!s.trg) fails.push("same-company refusal trg_fuel_card_type_issuer_same_company is missing or disabled");
    const r = (await c.query(`
      SELECT count(*) FILTER (WHERE t.is_active)::int AS types,
             count(*) FILTER (WHERE t.is_active AND t.issuer_vendor_id IS NOT NULL)::int AS designated,
             count(*) FILTER (WHERE t.issuer_vendor_id IS NOT NULL AND v.operating_company_id IS DISTINCT FROM t.operating_company_id)::int AS foreign_issuer
        FROM catalogs.fuel_card_types t LEFT JOIN mdata.vendors v ON v.id = t.issuer_vendor_id
       WHERE t.operating_company_id = $1::uuid`, [USMCA])).rows[0];
    if (r.foreign_issuer) fails.push(`${r.foreign_issuer} USMCA card type(s) name a vendor of another company`);
    console.log(`${LABEL}: USMCA ${r.designated} of ${r.types} active card types have an issuer designated (owner designates on /fuel/cards; reported, not required)`);
  }
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS — fuel cards carry their issuer vendor, forward and reverse`);
