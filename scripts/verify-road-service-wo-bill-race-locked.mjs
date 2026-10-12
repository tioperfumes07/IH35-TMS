#!/usr/bin/env node
/**
 * MAINT-MONEY-F6803A-ROAD-SERVICE-WO-BILL-DUPLICATE-ORPHAN-RACE
 *
 * createWorkOrderFromRoadServiceTicket() pre-read the ticket's wo_id WITHOUT locking the row, then
 * unconditionally created a WO + vendor bill and wrote the backlink with no null-only CAS and no
 * result check. Two concurrent POST /api/v1/road-service-tickets/:id/create-wo calls for the SAME
 * ticket (each its own withCompany transaction) could both see wo_id=NULL, both create a duplicate
 * WO + bill, and the second backlink UPDATE would silently win — orphaning the first WO + bill with
 * no ticket ever pointing back to them (invisible duplicate money-path records).
 *
 * Fix: SELECT ... FOR UPDATE serializes concurrent calls on the same ticket row (a second caller
 * blocks until the first commits, then re-reads with wo_id already set and returns via the
 * already_linked branch, never reaching the create path). The backlink UPDATE additionally CASes
 * on wo_id IS NULL and its rowCount is checked, as defense-in-depth against a bypassed lock.
 *
 * LEAD 443.129 (Codex AJK-02 / AJK-06 / AJK-07) — the same engine, three more rules:
 *   AJK-02  ONE routing decision by payment method (cc -> card expense, driver_advance -> advance expense, vendor_bill ->
 *           A/P bill; unknown refused by name); the bill poster runs ONLY on the vendor-invoice route and the paid routes
 *           go through the shared expense writer — never an unpaid vendor bill for something already paid.
 *   AJK-06  the ticket's hub links come from the ONE load-at-time rule (resolveFuelLoadAtTime) and are stamped on the
 *           ticket (load, company / customer trailer, driver, no-load reason) and the work order (load, driver).
 *   AJK-07  the ticket NAMES its item; no item is refused by name — no "oldest category" fallback, no keyword guess.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/maintenance/road-service/wo-integration.ts";
const ROUTES = "apps/backend/src/maintenance/road-service/tickets.routes.ts";

export function check(src) {
  const failures = [];

  const selectIdx = src.indexOf("FROM maintenance.road_service_tickets");
  const selectEnd = src.indexOf("[input.ticketId, input.operatingCompanyId]", selectIdx);
  const selectBlock = selectIdx >= 0 && selectEnd >= 0 ? src.slice(selectIdx, selectEnd) : "";
  if (!/FOR UPDATE/.test(selectBlock)) {
    failures.push(`${FILE}: ticket SELECT is missing FOR UPDATE — concurrent create-wo calls for the same ticket can both see wo_id=NULL and both create a duplicate WO+bill`);
  }

  const updateIdx = src.indexOf("UPDATE maintenance.road_service_tickets");
  const updateEnd = src.indexOf("if ((backlink.rowCount", updateIdx);
  const updateBlock = updateIdx >= 0 && updateEnd >= 0 ? src.slice(updateIdx, updateEnd) : "";
  if (!/AND wo_id IS NULL/.test(updateBlock)) {
    failures.push(`${FILE}: backlink UPDATE is missing "AND wo_id IS NULL" — not an active-row compare-and-set, a race can silently overwrite an existing link`);
  }
  if (!/backlink\.rowCount/.test(src) || !/!== 1/.test(src.slice(updateEnd, updateEnd + 300))) {
    failures.push(`${FILE}: backlink UPDATE result is not checked — a 0-row CAS failure (race slipped past the lock) would be silently swallowed instead of throwing`);
  }

  // AJK-07 — the item is named, never guessed.
  if (/ORDER BY created_at ASC\s+LIMIT 1/.test(src) || /qbo_categories[\s\S]{0,400}LIKE '%(road|repair)%'/.test(src)) {
    failures.push(`${FILE}: a category is guessed (oldest category / keyword LIKE) — the ticket must name its item (AJK-07)`);
  }
  if (!/"road_service_item_required"/.test(src) || !/resolveRoadServiceItem\(/.test(src)) {
    failures.push(`${FILE}: a ticket without an item is not refused by name (road_service_item_required) — AJK-07`);
  }
  // AJK-02 — one routing decision; the bill poster only on the vendor-invoice route; paid routes via the shared writer.
  const routeFn = src.slice(src.indexOf("export function roadServicePaymentRoute"), src.indexOf("export function roadServicePaymentRoute") + 700);
  if (!/"cc"\) return "card_expense"/.test(routeFn) || !/"driver_advance"\) return "driver_advance_expense"/.test(routeFn)
      || !/"vendor_bill"\) return "vendor_bill"/.test(routeFn) || !/road_service_payment_method_unknown/.test(routeFn)) {
    failures.push(`${FILE}: roadServicePaymentRoute no longer maps cc / driver_advance / vendor_bill and refuses the rest by name — AJK-02`);
  }
  const billCall = src.indexOf("await autoCreateBillFromWO(");
  const guardBefore = billCall >= 0 ? src.slice(Math.max(0, billCall - 200), billCall) : "";
  if (billCall < 0 || !/if \(route === "vendor_bill"\) \{\s*const bill = $/.test(guardBefore)) {
    failures.push(`${FILE}: the A/P bill is not created ONLY on the vendor-invoice route — a paid ticket would become an unpaid vendor bill (AJK-02)`);
  }
  // The HTTP route hands the engine THE shared writer (accounting/expense-writer.service.ts, 443.130 #3 — the plain module).
  const routeSrc = fs.readFileSync(path.join(root, ROUTES), "utf8");
  if (!/await input\.writeExpense\(/.test(src) || !/writeExpense: createExpenseInClientTx/.test(routeSrc)
      || !/import \{ createExpenseInClientTx \} from "\.\.\/\.\.\/accounting\/expense-writer\.service\.js"/.test(routeSrc)) {
    failures.push(`${FILE}: card / advance-paid tickets do not go through the shared expense writer (createExpenseInClientTx, handed in by ${ROUTES}) — AJK-02`);
  }
  // AJK-06 — hub links from the one load-at-time rule, stamped on ticket + work order.
  if (!/await resolveFuelLoadAtTime\(/.test(src)) {
    failures.push(`${FILE}: the ticket's load is not resolved by the ONE load-at-time rule (resolveFuelLoadAtTime) — AJK-06`);
  }
  for (const col of ["load_id = $9::uuid", "trailer_id = $10::uuid", "non_owned_trailer_id = $11::uuid", "load_exemption_reason = $12"]) {
    if (!updateBlock.includes(col)) failures.push(`${FILE}: the ticket backlink no longer stamps ${col.split(" ")[0]} — AJK-06`);
  }
  if (!/load_id: linkage\.load_id,/.test(src) || !/driver_id: linkage\.driver_id,/.test(src)) {
    failures.push(`${FILE}: the work order no longer carries the resolved load + driver — AJK-06`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: road-service-wo-bill-race-locked");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: road-service create-wo locks the ticket row before reading wo_id, and CASes + checks the backlink write");
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: reintroduce the exact pre-fix defect — no row lock.
  const offenderA = src.replace("      LIMIT 1\n      FOR UPDATE OF t\n", "      LIMIT 1\n");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (FOR UPDATE removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: remove the null-only CAS guard.
  const offenderB = src.replace(
    "        AND operating_company_id = $2::uuid\n        AND wo_id IS NULL\n    `,",
    "        AND operating_company_id = $2::uuid\n    `,"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (wo_id IS NULL CAS removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: remove the rowCount check.
  const offenderC = src.replace(
    '  if ((backlink.rowCount ?? 0) !== 1) {\n    throw new Error("road_service_ticket_wo_backlink_race");\n  }\n',
    ""
  );
  if (offenderC === src) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (rowCount check removed) was NOT caught");
    process.exit(1);
  }

  // 443.129 plants — each must be caught.
  const plants = [
    ["oldest-category fallback (AJK-07)", src.replace("export async function resolveRoadServiceItem", "async function fallback(c, id) { return c.query(`SELECT id FROM catalogs.qbo_categories WHERE operating_company_id = $1 ORDER BY created_at ASC LIMIT 1`, [id]); }\nexport async function resolveRoadServiceItem")],
    ["no-item refusal removed (AJK-07)", src.replaceAll('"road_service_item_required"', '"road_service_item_optional"')],
    ["bill on every route (AJK-02)", src.replace('if (route === "vendor_bill") {\n    const bill = await autoCreateBillFromWO(', 'if (true) {\n    const bill = await autoCreateBillFromWO(')],
    ["cc routed to a bill (AJK-02)", src.replace('"cc") return "card_expense"', '"cc") return "vendor_bill"')],
    ["paid route bypasses the shared writer (AJK-02)", src.replace("const created = await input.writeExpense(", "const created = await (async (..._a) => ({ expense_id: \"x\" }))(")],
    ["load not from the one rule (AJK-06)", src.replace("const load = await resolveFuelLoadAtTime(", "const load = await (async (..._a) => null)(")],
    ["ticket load stamp dropped (AJK-06)", src.replace("          load_id = $9::uuid,\n", "")],
  ];
  for (const [label, mutated] of plants) {
    if (mutated === src) {
      console.error(`FAIL(selftest): plant "${label}" did not change the file — pattern out of sync`);
      process.exit(1);
    }
    if (check(mutated).length === 0) {
      console.error(`FAIL(selftest): planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  }

  console.log(`PASS(selftest): all ${3 + plants.length} planted regressions correctly caught; baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
