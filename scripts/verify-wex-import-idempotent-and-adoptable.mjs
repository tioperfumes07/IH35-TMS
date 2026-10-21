#!/usr/bin/env node
/**
 * LEAD 443.202 — the England Logistics WEX card statement import is IDEMPOTENT and its fills are ADOPTABLE.
 *
 * Owner 2026-10-21: "england wex gets paid from our bank account ... its a fule card." The owner's WEX TransactionReport
 * export (one row per ticket + product: Card #, Tran Date, Tran Time, Invoice, Unit, … Item ULSD/DEFD, Disc PPU, Disc Amt,
 * Amt) runs through the ONE fuel-card statement engine (fuel/dreamline-statement-import.service.ts) with its own rail.
 * What can silently regress, each pinned here:
 *
 *  1. The WEX rail is the card WEX, paid from role fuel_card_payable_wex (2520), with its OWN line hash key and adoption
 *     marker (a WEX line must never collide with, or read as, a Dreamline line).
 *  2. The walk resolves the card payable BY ROLE (never account number "2510"), loads booked receipts per rail, and a
 *     receipt on another fuel rail is cross_rail — never adopted.
 *  3. Idempotent: a line already live (hash) or adopted (marker) is "already_imported"; the provider-ID lookup runs before
 *     the INSERT; the INSERT is ON CONFLICT (source_row_hash) DO NOTHING; the line hash is keyed on the rail.
 *  4. Posted on receipt: the imported fill carries the card type (cardType.id — without it USMCA reads Relay and nothing
 *     posts) and posts only through postFuelFillOnReceipt.
 *  5. Adoptable both ways: a Settlement Creator receipt already on the card is ADOPTED by the statement (named with its
 *     settlement); and a later Creator WEX line — which prints the STATION's ticket number, not WEX's invoice — adopts
 *     the received fill BY SHAPE (findReceivedCardFillByShape, SHAPE_ADOPTION_CARDS has "wex") in the post AND the
 *     preflight, and refuses it by name when it sits elsewhere (card_fill_already_received). Never a second row.
 *  7. A receipt booked at exactly what the card charged adopts (dreamlineAdoptionRefused returns false at |diff| <= 1).
 *     Prod dry run 10-21 20:40Z: the settlements book each WEX receipt at Amt; the 5%-from-retail rule listed 28 of 92
 *     lines amount_mismatch because the WEX discount runs 6-13% of retail.
 *  6. The route reads the .csv as the provider printed it (csvText: invoice "05661" stays "05661"), and the GENERIC fleet
 *     import refuses a provider-statement file (it would land card-less rows and a second copy of every receipt).
 *
 * Static, <1s. --selftest plants each regression and proves it is caught.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-wex-import-idempotent-and-adoptable";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/fuel/dreamline-statement-import.service.ts";
const ROUTES = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const ADOPT = "apps/backend/src/driver-finance/creator-received-fill-adoption.ts";
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const PREFLIGHT = "apps/backend/src/driver-finance/settlement-creator-preflight.ts";
const DB_TEST = "apps/backend/src/fuel/__tests__/wex-statement-import.db.test.ts";
const FILES = [ENGINE, ROUTES, ADOPT, CREATOR, PREFLIGHT, DB_TEST];

function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return "";
  const j = src.indexOf("\n};\n", i);
  return src.slice(i, j < 0 ? undefined : j);
}

function fnBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return "";
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j < 0 ? undefined : j);
}

export function check(files) {
  const p = [];
  const engine = files[ENGINE] ?? "";
  const routes = files[ROUTES] ?? "";
  const adopt = files[ADOPT] ?? "";
  const creator = files[CREATOR] ?? "";
  const preflight = files[PREFLIGHT] ?? "";

  // 1. the rail
  const wex = block(engine, "export const WEX_STATEMENT_RAIL");
  if (!wex) p.push(`${ENGINE}: WEX_STATEMENT_RAIL is missing`);
  else {
    if (!/card_type_code:\s*"WEX"/.test(wex)) p.push(`${ENGINE}: the WEX rail is not card type WEX`);
    if (!/payable_role:\s*"fuel_card_payable_wex"/.test(wex)) p.push(`${ENGINE}: the WEX rail is not paid from role fuel_card_payable_wex`);
    if (!/key:\s*"wex"/.test(wex)) p.push(`${ENGINE}: the WEX rail's line-hash key is not "wex"`);
    if (!/marker_prefix:\s*"wex_inv"/.test(wex)) p.push(`${ENGINE}: the WEX rail's adoption marker is not its own (wex_inv)`);
    if (!/any_truck_scope:\s*"any_truck_exact"/.test(wex)) p.push(`${ENGINE}: the WEX rail reaches another truck's receipt by a fuzzy amount (4 real fills listed cross_rail on the 10-21 fork)`);
  }
  const wexRun = fnBody(engine, "export async function importWexStatement(");
  if (!/rail:\s*WEX_STATEMENT_RAIL/.test(wexRun)) p.push(`${ENGINE}: importWexStatement does not run the WEX rail`);

  // 7. a receipt at the card charge is the charge
  const refused = fnBody(engine, "export function dreamlineAdoptionRefused(");
  if (!/if \(Math\.abs\(diff\) <= 1\) return false;/.test(refused)) p.push(`${ENGINE}: dreamlineAdoptionRefused refuses a receipt booked at exactly the card charge (28 WEX lines amount_mismatch on the 10-21 prod dry run)`);

  // 2. by role, per rail, cross-rail never adopted
  const walk = fnBody(engine, "export async function importFuelCardStatement(");
  if (!walk) p.push(`${ENGINE}: importFuelCardStatement (the one walk) is missing`);
  if (!/const payableId = await resolveRoleAccountOptional\(client as never, companyId, rail\.payable_role\)/.test(walk)) p.push(`${ENGINE}: the card payable is not resolved by the rail's role`);
  if (/companyAccountId\(client, companyId, "25\d0"\)/.test(walk)) p.push(`${ENGINE}: the card payable is resolved by account number`);
  if (!/loadBookedReceipts\(client, companyId, [^)]*, rail\)/.test(walk)) p.push(`${ENGINE}: booked receipts are not loaded for the statement's rail`);
  if (!/matchBookedReceipt\(line, booked, used, rail\.any_truck_scope\)/.test(walk)) p.push(`${ENGINE}: the walk ignores the rail's any-truck scope`);
  if (!/if \(scope === "any_truck_exact"\) return null;/.test(engine)) p.push(`${ENGINE}: matchBookedReceipt has no exact-only any-truck stop`);
  if (!/if \(hit\.rail === "other_rail"\) \{ record\(line, "cross_rail"/.test(walk)) p.push(`${ENGINE}: a receipt on another fuel rail is not listed cross_rail`);

  // 3. idempotent
  if (!/if \(lineIsLive\(hash\) \|\| adoptedMarkers\.has\(marker\)\)/.test(walk)) p.push(`${ENGINE}: a line already imported / adopted is not skipped`);
  if (!/hash: dreamlineLineHash\(line, seq, rail\), marker: dreamlineAdoptMarker\(line, seq, rail\)/.test(walk)) p.push(`${ENGINE}: the line hash / marker is not keyed on the rail`);
  if (!/\.update\(`\$\{rail\.key\}:\$\{line\.card_number\}/.test(engine)) p.push(`${ENGINE}: dreamlineLineHash does not prefix the rail key`);
  const lookup = walk.indexOf("findLiveFuelByProviderTransactionId(client as never, {");
  const insert = walk.indexOf("INSERT INTO fuel.fuel_transactions");
  if (lookup < 0 || insert < 0 || lookup > insert) p.push(`${ENGINE}: the provider-ID lookup does not run before the fuel INSERT`);
  if (!/ON CONFLICT \(operating_company_id, source_row_hash\) DO NOTHING/.test(walk)) p.push(`${ENGINE}: the fuel INSERT is not ON CONFLICT (source_row_hash) DO NOTHING`);

  // 4. card rail + the one poster
  if (!/cardType\.id, line\.product/.test(walk)) p.push(`${ENGINE}: the imported fill does not carry the card type`);
  if (!/await postFuelFillOnReceipt\(client as never, \{ operating_company_id: companyId/.test(walk)) p.push(`${ENGINE}: the imported fill does not post through postFuelFillOnReceipt`);

  // 5. adoptable both ways
  if (!/settlement_no: hit\.settlement_no/.test(walk)) p.push(`${ENGINE}: an adopted settlement receipt is not named with its settlement`);
  if (!/SHAPE_ADOPTION_CARDS = new Set\(\[[^\]]*"wex"[^\]]*\]\)/.test(adopt)) p.push(`${ADOPT}: SHAPE_ADOPTION_CARDS does not include "wex"`);
  const shape = fnBody(adopt, "export async function findReceivedCardFillByShape(");
  if (!shape) p.push(`${ADOPT}: findReceivedCardFillByShape is missing`);
  else {
    if (!/f\.source <> 'manual'/.test(shape)) p.push(`${ADOPT}: the shape match does not require a RECEIVED fill (source <> 'manual')`);
    if (!/ct\.code = upper\(\$2\)/.test(shape)) p.push(`${ADOPT}: the shape match does not require the line's card`);
    if (!/r\.load_id === input\.loadId && r\.posted && !r\.on_settlement/.test(shape)) p.push(`${ADOPT}: the shape match adopts a fill that is on another load / not posted / already settled`);
  }
  const shapeCall = creator.indexOf("await findReceivedCardFillByShape(client, {");
  const creatorInsert = creator.indexOf("INSERT INTO fuel.fuel_transactions (", shapeCall < 0 ? 0 : shapeCall);
  if (shapeCall < 0 || creatorInsert < 0) p.push(`${CREATOR}: the Creator post does not ask findReceivedCardFillByShape before it inserts a fuel row`);
  if (!/const reused = priorReused \?\? adoptedReceipt \?\? shapeAdopted;/.test(creator)) p.push(`${CREATOR}: the shape-adopted fill is not reused (a second row would be written)`);
  if (!/"card_fill_already_received"/.test(creator)) p.push(`${CREATOR}: a received WEX fill sitting elsewhere is not refused by name`);
  if (!/findReceivedCardFillByShape\(client as never, \{/.test(preflight)) p.push(`${PREFLIGHT}: the preflight does not ask the same shape rule as the post`);

  // 6. read as printed; the generic import refuses a provider statement
  const wexRoute = routes.slice(routes.indexOf('"/api/v1/fuel/wex/statement-import"'));
  if (routes.indexOf('"/api/v1/fuel/wex/statement-import"') < 0) p.push(`${ROUTES}: POST /api/v1/fuel/wex/statement-import is missing`);
  else {
    if (!/csvText: true/.test(wexRoute)) p.push(`${ROUTES}: the WEX route does not read the .csv as printed (csvText)`);
    if (!/importWexStatement\(client as never, \{/.test(wexRoute)) p.push(`${ROUTES}: the WEX route does not run importWexStatement`);
    if (!/const dryRun = query\.data\.dry_run !== "false";/.test(wexRoute)) p.push(`${ROUTES}: the WEX route does not default to a dry run`);
  }
  const generic = routes.slice(routes.indexOf('"/api/v1/fuel/transactions/import"'), routes.indexOf('"/api/v1/fuel/dreamline/statement-import"'));
  const refuse = generic.indexOf("if (isProviderStatementShape(rawRows))");
  const map = generic.indexOf("const parsed = mapFuelCardRows(rawRows);");
  if (refuse < 0 || map < 0 || refuse > map) p.push(`${ROUTES}: the generic fleet import does not refuse a provider-statement file before mapping it`);

  if (!files[DB_TEST]) p.push(`${DB_TEST}: the real-Postgres proof is missing`);
  return p;
}

function readAll() {
  const out = {};
  for (const f of FILES) {
    try {
      out[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
    } catch {
      out[f] = "";
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) {
    console.error(`${LABEL} --selftest: the real tree is not clean:\n  ${base.join("\n  ")}`);
    process.exit(1);
  }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const plants = [
    ["WEX rail paid from 2510's role", plant(ENGINE, 'payable_role: "fuel_card_payable_wex"', 'payable_role: "fuel_card_payable_dreamline"')],
    ["WEX rail shares the Dreamline marker", plant(ENGINE, 'marker_prefix: "wex_inv"', 'marker_prefix: "dreamline_efs"')],
    ["WEX rail fuzzy any-truck", plant(ENGINE, 'any_truck_scope: "any_truck_exact"', 'any_truck_scope: "any_truck"')],
    ["exact-only stop removed", plant(ENGINE, 'if (scope === "any_truck_exact") return null;', "")],
    ["payable by account number", plant(ENGINE, "const payableId = await resolveRoleAccountOptional(client as never, companyId, rail.payable_role)", 'const payableId = await companyAccountId(client, companyId, "2510")')],
    ["cross-rail receipt adopted", plant(ENGINE, 'if (hit.rail === "other_rail") { record(line, "cross_rail"', 'if (false) { record(line, "cross_rail"')],
    ["re-run imports again", plant(ENGINE, "if (lineIsLive(hash) || adoptedMarkers.has(marker))", "if (adoptedMarkers.has(marker))")],
    ["hash not keyed on the rail", plant(ENGINE, "hash: dreamlineLineHash(line, seq, rail)", "hash: dreamlineLineHash(line, seq)")],
    ["insert without conflict guard", plant(ENGINE, "ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING\n       RETURNING id::text`,\n      [\n        companyId, line.transaction_at", "RETURNING id::text`,\n      [\n        companyId, line.transaction_at")],
    ["fill without card type", plant(ENGINE, "cardType.id, line.product", "null, line.product")],
    ["adoption drops the settlement", plant(ENGINE, "settlement_no: hit.settlement_no", "settlement_no: null as never")],
    ["shape adoption off for WEX", plant(ADOPT, 'new Set(["wex"])', "new Set<string>([])")],
    ["shape adopts a manual row", plant(ADOPT, "WHERE f.operating_company_id = $1::uuid AND f.voided_at IS NULL AND f.source <> 'manual'", "WHERE f.operating_company_id = $1::uuid AND f.voided_at IS NULL")],
    ["shape adopts another load's fill", plant(ADOPT, "r.load_id === input.loadId && r.posted && !r.on_settlement", "r.posted")],
    ["Creator writes a second row", plant(CREATOR, "const reused = priorReused ?? adoptedReceipt ?? shapeAdopted;", "const reused = priorReused ?? adoptedReceipt;")],
    ["Creator silent on a received fill elsewhere", plant(CREATOR, '"card_fill_already_received"', '"x"')],
    ["preflight skips the shape rule", plant(PREFLIGHT, "findReceivedCardFillByShape(client as never, {", "noShape(client as never, {")],
    ["route coerces the csv", plant(ROUTES, "{ cellDates: true, csvText: true }", "{ cellDates: true }")],
    ["route posts by default", plant(ROUTES, 'const dryRun = query.data.dry_run !== "false";\n    await assertCompanyMembership(authUser.uuid, companyId);\n\n    const filePart = await req.file();\n    if (!filePart) return reply.code(400).send({ error: "file_required" });\n    const name', 'const dryRun = query.data.dry_run === "true";\n    await assertCompanyMembership(authUser.uuid, companyId);\n\n    const filePart = await req.file();\n    if (!filePart) return reply.code(400).send({ error: "file_required" });\n    const name')],
    ["receipt at the charge refused", plant(ENGINE, "if (Math.abs(diff) <= 1) return false;", "")],
    ["generic import takes a statement", plant(ROUTES, "if (isProviderStatementShape(rawRows)) {\n      return reply.code(400)", "if (false) {\n      return reply.code(400)")],
  ];
  let ok = 0;
  for (const [name, files] of plants) {
    const caught = check(files).length > 0;
    const changed = Object.keys(files).some((k) => files[k] !== real[k]);
    const pass = caught && changed;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${changed ? "" : " (plant did not apply)"}`);
    if (pass) ok += 1;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}

const problems = check(readAll());
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length}:`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — WEX statement import is idempotent per (WEX invoice, item), posts on receipt Cr 2520 through the one poster, adopts settlement receipts and is adopted by the Creator by shape`);
