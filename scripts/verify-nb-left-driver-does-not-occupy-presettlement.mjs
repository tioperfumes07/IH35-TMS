#!/usr/bin/env node
/**
 * LEAD 443.243 (owner 10-22: 13693 moves to Jorge Luis / T177; T175 / Leonel is on 13698) — Book Load 13698 for Leonel returned an
 * opaque 409 dispatch_load_conflict: suggestPresettlementLink saw his open pre-settlement P-0112 as "already has an NB" because
 * 13693 (moved back to draft, leaving Leonel) was still linked there, so it opened a SECOND pre-settlement and hit
 * uq_driver_settlements_one_open_per_driver. Also, the Book Load route schema dropped stop facility_name (zod strips unknown keys).
 * THE RULE: an NB occupies a driver's open pre-settlement only while it is still that driver's live load — not after it went back
 * to draft or to another driver. Both NB-occupancy checks (suggest + confirm) carry it; the Book Load stop schema keeps facility_name.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const F = { link: "apps/backend/src/dispatch/presettlement-link.service.ts", routes: "apps/backend/src/dispatch/loads.routes.ts", book: "apps/backend/src/dispatch/book-load.service.ts" };
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const blocks = [...s.link.matchAll(/nb\.trip_type = 'NB'[\s\S]{0,700}?AS has_other_nb/g)].map((m) => m[0]);
  if (blocks.length < 2) p.push(`${F.link}: expected the two NB-occupancy checks (suggest + confirm), found ${blocks.length}`);
  blocks.forEach((b, i) => {
    if (!/nb\.assigned_primary_driver_id IS NOT DISTINCT FROM/.test(b))
      p.push(`${F.link}: NB-occupancy check #${i + 1} counts an NB that moved to another driver`);
    if (!/nb\.status::text NOT IN \('cancelled', 'draft'\)/.test(b))
      p.push(`${F.link}: NB-occupancy check #${i + 1} counts an NB that went back to draft`);
  });
  const stops = s.routes.slice(s.routes.indexOf("const createDispatchLoadBodySchema"), s.routes.indexOf("const updateDispatchLoadBodySchema"));
  if (!/facility_name: z\.string\(\)/.test(stops)) p.push(`${F.routes}: Book Load stop schema drops facility_name`);
  // 443.243 (2): a reassigned load follows its new driver's open pre-settlement, and its bill may change driver on that open trip.
  if (!/if \(input\.presettlement_link_id_before\) \{\s*return moveLoadToNewDriverPresettlementInClientTx\(/.test(s.link))
    p.push(`${F.link}: a reassigned, already-linked load no longer follows its new driver's open pre-settlement`);
  if (!/await reassignLoadToSettlementInClientTx\(client as never, \{/.test(s.link))
    p.push(`${F.link}: the move must go through THE move primitive (reassignLoadToSettlementInClientTx)`);
  if (!/const reassignableOnOpenTrip =\s*identityChanged && existing\.editable_settlement_id != null/.test(s.book) ||
      !/if \(!isRecalculable && !reassignableOnOpenTrip\)/.test(s.book))
    p.push(`${F.book}: a bill on the driver's OPEN pre-settlement refuses the driver change again`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["draft NB counted (suggest)", { link: base.link.replace("AND nb.soft_deleted_at IS NULL AND nb.status::text NOT IN ('cancelled', 'draft')) AS has_other_nb", "AND nb.soft_deleted_at IS NULL AND nb.status::text <> 'cancelled') AS has_other_nb") }],
    ["other-driver NB counted (confirm)", { link: base.link.replace("AND nb.assigned_primary_driver_id IS NOT DISTINCT FROM (SELECT driver_id", "AND (SELECT driver_id") }],
    ["reassigned load stays on the old driver's settlement", { link: base.link.replace("return moveLoadToNewDriverPresettlementInClientTx(", "return null; void (") }],
    ["bill on open trip refuses reassignment", { book: base.book.replace("if (!isRecalculable && !reassignableOnOpenTrip)", "if (!isRecalculable)") }],
    ["facility_name dropped", { routes: base.routes.replace(/\n\s*facility_name: z\.string\(\)\.trim\(\)\.max\(200\)\.optional\(\),/, "") }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-nb-left-driver-does-not-occupy-presettlement: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-nb-left-driver-does-not-occupy-presettlement: OK — only the driver's live NB occupies the open pre-settlement; Book Load keeps facility_name.");
}
