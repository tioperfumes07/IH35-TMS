#!/usr/bin/env node
// SET-01 part 2 GUARD (owner LOCKED MANDATE 2026-09-09) — "settlement detail still needs true
// per-line editable inputs (Add-deduction/part 1 is done)". Part 1 (the +Add button) is locked by
// verify-settlement-add-deduction-wired.mjs. This locks part 2: a SAVED deduction line can be
// edited in place, and the edit is WORM-safe (void-old + recreate through the real writers, never
// a bare UPDATE of a money row), gated to pending + manual-only + open-settlement in the service.
//
//   node scripts/verify-settlement-edit-deduction-wired.mjs
//   node scripts/verify-settlement-edit-deduction-wired.mjs --selftest
import { readFileSync } from "node:fs";

const SERVICE = "apps/backend/src/driver-finance/edit-settlement-deduction.service.ts";
const ROUTES = "apps/backend/src/driver-finance/deductions.routes.ts";
const SECTION = "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const DRAWER = "apps/frontend/src/pages/drivers/components/EditSettlementDeductionDrawer.tsx";
const LABEL = "verify-settlement-edit-deduction-wired";
const fail = (m) => { console.error(`FAIL ${LABEL}: ${m}`); process.exit(1); };

function read(rel) {
  return readFileSync(rel, "utf8");
}

export function verify(service, routes, section, page, drawer) {
  const f = [];

  // 1 — the edit service is WORM-safe: it reuses the REAL void + create writers (void-old + recreate),
  //     and it NEVER does a bare UPDATE of the money columns on the deduction row.
  if (!/export async function editSettlementDeduction/.test(service)) f.push("service-no-export");
  if (!/voidSettlementDeduction/.test(service)) f.push("service-no-void-writer");
  if (!/createSettlementDeduction/.test(service)) f.push("service-no-create-writer");
  if (/UPDATE\s+driver_finance\.driver_settlement_deductions\s+SET\s+amount_cents/i.test(service))
    f.push("service-does-bare-amount-update"); // must never mutate the money in place

  // 2 — the service fails closed on the real invariants (pending, manual-only, open settlement).
  if (!/status\s*!==\s*["']pending["']/.test(service)) f.push("service-not-pending-gated");
  if (!/source_pending_id\b/.test(service) || !/reversed_reimbursement_id\b/.test(service) ||
      !/bucket_id\b/.test(service) || !/source_bank_transaction_id\b/.test(service))
    f.push("service-not-manual-only-gated");
  if (!/settlement_not_open/.test(service)) f.push("service-not-open-settlement-gated");

  // 3 — the PATCH route exists, is role-gated, and calls the real service.
  if (!/app\.patch\(\s*["']\/api\/v1\/driver-finance\/settlement-deductions\/:id["']/.test(routes))
    f.push("route-missing");
  if (!/editSettlementDeduction\(/.test(routes)) f.push("route-not-wired-to-service");
  if (!/requireDeductionWriteRole/.test(routes)) f.push("route-not-role-gated");

  // 4 — the section offers a per-line Edit affordance wired to onEdit, gated to editable rows only.
  if (!/onEdit\?:\s*\(row: DeductionRow\)\s*=>\s*void/.test(section)) f.push("section-no-onEdit-prop");
  if (!/onClick=\{\(\)\s*=>\s*onEdit\?\.\(row\)\}/.test(section)) f.push("section-edit-not-wired");
  if (!/isOpen\s*===\s*true/.test(section) || !/!row\.is_held/.test(section) ||
      !/row\.source_deduction_id/.test(section) || !/EDITABLE_DEDUCTION_TYPES\.has/.test(section))
    f.push("section-edit-not-gated");

  // 5 — the page mounts the edit drawer, passes the real source deduction id, and refetches on save.
  //     Anchor these to the <EditSettlementDeductionDrawer …/> block (the page has other components
  //     that also refetch on save, so a page-wide regex would be ambiguous).
  const drawerBlockMatch = page.match(/<EditSettlementDeductionDrawer[\s\S]*?\/>/);
  if (!drawerBlockMatch) f.push("page-drawer-not-mounted");
  const drawerBlock = drawerBlockMatch ? drawerBlockMatch[0] : "";
  if (!/deductionId=\{editDeductionTarget\?\.source_deduction_id \?\? null\}/.test(drawerBlock))
    f.push("page-drawer-no-real-deduction-id");
  if (!/onSaved=\{\(\) => void detailQuery\.refetch\(\)\}/.test(drawerBlock)) f.push("page-drawer-does-not-refetch");
  if (!/onEdit=\{\(row\) => setEditDeductionTarget\(row\)\}/.test(page)) f.push("page-section-onEdit-not-wired");

  // 6 — the drawer calls the real PATCH client and requires a real reason (>= 10 chars).
  if (!/editSettlementDeduction\(/.test(drawer)) f.push("drawer-not-wired-to-api");
  if (!/reason\.trim\(\)\.length\s*<\s*10/.test(drawer)) f.push("drawer-no-reason-min");

  return f;
}

if (process.argv.includes("--selftest")) {
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const section = read(SECTION);
  const page = read(PAGE);
  const drawer = read(DRAWER);
  const baseline = verify(service, routes, section, page, drawer);
  if (baseline.length) fail(`baseline not green — real checks failing: ${baseline.join(", ")}`);
  const mutations = [
    [service.replace(/voidSettlementDeduction/g, "nope"), routes, section, page, drawer],
    [service.replace(/createSettlementDeduction/g, "nope"), routes, section, page, drawer],
    [service.replace(/status\s*!==\s*"pending"/, 'status !== "x"').replace(/status\s*!==\s*'pending'/, "status !== 'x'"), routes, section, page, drawer],
    [service.replace(/settlement_not_open/g, "ok"), routes, section, page, drawer],
    [service.replace(/source_bank_transaction_id\b/g, "gone"), routes, section, page, drawer],
    [service, routes.replace('app.patch("/api/v1/driver-finance/settlement-deductions/:id"', 'app.patch("/nope"'), section, page, drawer],
    [service, routes.replace(/editSettlementDeduction\(/g, "nope("), section, page, drawer],
    [service, routes, section.replace(/onClick=\{\(\) => onEdit\?\.\(row\)\}/, "onClick={undefined}"), page, drawer],
    [service, routes, section.replace(/EDITABLE_DEDUCTION_TYPES\.has/g, "noGate"), page, drawer],
    [service, routes, section, page.replace("<EditSettlementDeductionDrawer", "<Nope"), drawer],
    [service, routes, section, page.replaceAll("onSaved={() => void detailQuery.refetch()}", "onSaved={() => undefined}"), drawer],
    [service, routes, section, page, drawer.replace(/editSettlementDeduction\(/g, "nope(")],
    [service, routes, section, page, drawer.replace("reason.trim().length < 10", "false")],
  ];
  for (const [sv, r, s, p, d] of mutations) {
    if (sv === service && r === routes && s === section && p === page && d === drawer)
      fail("a selftest mutation did not change the source — the check is stale");
    if (verify(sv, r, s, p, d).length === 0) fail("a mutation still passed — a check is too weak");
  }
  console.log(`OK ${LABEL} --selftest: baseline green, ${mutations.length} mutations all caught.`);
  process.exit(0);
}

const failures = verify(read(SERVICE), read(ROUTES), read(SECTION), read(PAGE), read(DRAWER));
if (failures.length) fail(`edit-deduction wiring drifted: ${failures.join(", ")}`);
console.log(`OK ${LABEL}: a saved deduction line is editable in place via the WORM-safe void+recreate PATCH, gated pending + manual-only + open-settlement.`);
