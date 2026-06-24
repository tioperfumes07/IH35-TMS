#!/usr/bin/env node
/**
 * verify:design-parity — the drift-prevention gate (GUARD enforcement, 2026-06-23).
 *
 * Root cause it fixes: the live app kept rendering an OLDER layout than the uploaded design files
 * because "done" was measured against the prior build / the coder's memory, never re-diffed against
 * the design. This guard reads the enforcement contract (docs/design/design-parity-contract.json,
 * shipped by GUARD) and, for each screen, asserts every required token from its design file appears
 * in that screen's LIVE component source (label / header / column text). Missing tokens = RED build,
 * so a screen can't silently regress or be "built from memory" minus fields.
 *
 * Matching: tokens are compared against a normalized copy of the component source
 * (lowercased, every non-alphanumeric char stripped) — exactly the normalized form the contract's
 * required_tokens are already in. This is a generous PRESENCE check by design (it proves the field
 * label/section/column exists in the screen), not a layout/pixel check. §7 palette overrides design
 * COLOR, so color is never a token. See [[design-parity-lock]] + docs/design/DESIGN-PARITY-ENFORCEMENT.md.
 *
 * LIMITATION + BACKSTOP (GUARD, 2026-06-23): token-in-source is NECESSARY but NOT SUFFICIENT — a token can
 * exist in the file yet render nothing (early `return null`, a never-true conditional, a collapsed/unmounted
 * branch). That was the #1355 false-DONE: the HOS block + stop-card fields passed this guard but rendered
 * blank live. The fix for "does it actually render" is a DOM render-test that mounts the component and asserts
 * the design labels appear (e.g. DriverHosClocks.test.tsx mounts the HOS block with NO driver and asserts the
 * 6 clock labels are in the DOM; BookLoadStopsSection.test.tsx asserts the v6 card fields show by default).
 * Rule: when a screen graduates into ENFORCED, back it with a render-test that proves its key fields reach the
 * DOM — this guard catches "field deleted from source", the render-test catches "field present but not rendered".
 *
 * The contract is the enforcement source (tokens); this script owns the screen→component wiring below.
 *
 * Enforcement model (ratchet): a screen in ENFORCED that is missing any required token = RED build —
 * this is the no-regression lock for screens already built to their design. Screens NOT yet in ENFORCED
 * are the active build backlog: their exact missing fields are printed every run (machine-checked punch
 * list) but do not fail the build. A screen graduates into ENFORCED the moment it reaches full parity, and
 * can never silently fall back out. The goal state is ENFORCED === all 12 screens (DESIGN-PARITY-ENFORCEMENT.md).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTRACT = path.join(ROOT, "docs/design/design-parity-contract.json");
const FE = "apps/frontend/src/pages";

// Screen name (contract key) → live component file(s) that render its fields/columns.
// Concatenated and normalized before the token check. Keep in sync when a screen is re-homed.
const SCREEN_COMPONENTS = {
  "Load Book/Edit Wizard": [
    `${FE}/dispatch/components/BookLoadModalV4.tsx`,
    `${FE}/dispatch/components/BookLoadCustomerSection.tsx`,
    `${FE}/dispatch/components/BookLoadEquipmentSection.tsx`,
    `${FE}/dispatch/components/BookLoadStopsSection.tsx`,
    `${FE}/dispatch/components/BookLoadValidationSection.tsx`,
  ],
  "Create/Edit Work Order Wizard": [
    `${FE}/maintenance/components/CreateWorkOrderModal.tsx`,
    `${FE}/maintenance/components/CreateWOSectionIdentification.tsx`,
    `${FE}/maintenance/components/CreateWOSectionRenderV5Header.tsx`,
    `${FE}/maintenance/components/CreateWOSectionCostBreakdown.tsx`,
    `${FE}/maintenance/components/CreateWOSectionPaymentTiming.tsx`,
    `${FE}/maintenance/components/CreateWOSectionReconcile.tsx`,
    `${FE}/maintenance/components/CreateWOSectionValidation.tsx`,
    // Parts/labor line fields (Part # / Task, Qty/Hr, Unit/Rate, Total) render via the shared line editor;
    // the inline "+ Add vendor" mini-create (Street/Zip/Account no./Tax ID/Track 1099?/Default expense
    // account) renders via QuickCreateEntityModal — both reached from this modal.
    `apps/frontend/src/components/forms/TwoSectionLineEditor.tsx`,
    `apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx`,
    `apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx`,
  ],
  "Maintenance Shell": [
    `${FE}/maintenance/MaintenanceHome.tsx`,
    `${FE}/maintenance/FleetTablePage.tsx`,
    `${FE}/maintenance/components/WorkOrdersTable.tsx`,
  ],
  "R&M Status Board": [
    `${FE}/maintenance/components/RMBucketsGrid.tsx`,
    `${FE}/maintenance/components/RMStatStrip.tsx`,
  ],
  "Fleet Table": [
    `${FE}/maintenance/FleetTablePage.tsx`,
    "apps/frontend/src/components/FleetTable.tsx",
  ],
  "Arriving Soon": [
    `${FE}/maintenance/ArrivingSoonPage.tsx`,
    `${FE}/maintenance/components/ArrivingSoonFilterBar.tsx`,
  ],
  "In-Transit Issues": [`${FE}/maintenance/components/InTransitIssuesTable.tsx`],
  "Damage Reports": [`${FE}/maintenance/components/MaintenanceDamageRegisterTab.tsx`],
  "Road Service": [`${FE}/maintenance/RoadServiceList.tsx`],
  "Service / Location": [`${FE}/maintenance/ServiceLocationPage.tsx`],
  "Severe Repairs": [`${FE}/maintenance/components/SevereRepairOosTab.tsx`],
  "Accounts Payable": [`${FE}/accounting/AccountsPayableAgingPage.tsx`],
};

// Fields legitimately deferred because the DB column does not exist yet (DESIGN-PARITY rule #2:
// "a missing DB column is the ONLY legitimate reason to defer a field — and that triggers a gated
// migration first"). Each entry MUST name the gating migration PR. Remove the token here the moment
// the field renders. This keeps the guard honest about WHY a field is absent instead of silently passing.
const DEFERRED = {
  // WO header fields whose maintenance.work_orders column does NOT exist yet → a gated migration must land
  // first (Priority + Close date/time have no column), OR there is no live data source (Odometer/Engine-hrs
  // are Samsara-sourced and Samsara is PARKED — GUARD gate-4: data-source-pending, do NOT fabricate). The
  // #1353-live header fields (Status/Authorized-by/Repaired-by/Authorization#/Service-location/Open date+time)
  // are BUILT and render — removed from this list.
  "Create/Edit Work Order Wizard": {
    reason: "priority+close need a gated migration (no column); odometer/engine-hrs need a Samsara source (parked)",
    tokens: [
      "priority",
      "closedateoncompletion",
      "closetimeoncompletion",
      "odometersamsara",
      "enginehrssamsara",
    ],
  },
  // Damage Reports re-pointed to the FORMAL register (safety.incidents, read-only) — Report#/Unit/Date/Type/
  // Description/Status/Photos all render from real fields. "Linked WO" defers: safety.incidents has NO
  // work_order link column, so wiring it requires a gated additive migration later (no faked column).
  "Damage Reports": {
    reason: "safety.incidents has no work_order link column — gated additive migration later",
    tokens: ["linkedwo"],
  },
};

// Screens locked at full design parity — RED on any regression. Add a screen here the moment it
// reaches full parity (verified by a clean run below). NEVER remove a screen from this set.
// Goal state: every contract screen is enforced.
const ENFORCED = new Set([
  "Fleet Table",
  "Damage Reports",
  "Service / Location",
  "R&M Status Board",
  "Accounts Payable",
  "Arriving Soon",
  "Severe Repairs",
  // Promoted 2026-06-24 (Jorge's call): contract aligned to the approved/live UI labels (Display name /
  // Street / Part # / Task; Payment method removed — it belongs to CreateExpenseModal). A multi-section
  // wizard, so it is backed by the full-modal DOM render-test in STRUCTURAL_RENDER_TESTS (CreateWorkOrderModal.test.tsx).
  "Create/Edit Work Order Wizard",
]);

// STRUCTURAL GATE (GUARD upgrade, 2026-06-23): token-in-source proved insufficient — it passed while the
// §C stop LAYOUT, field LABELS and §E PLACEMENT were all wrong (the fields existed in the file but in the
// wrong section/row/order). The durable fix for "is it structurally right" is a DOM render-test that mounts
// the component and asserts each label is in its correct row/section container (within(locrow)/within(siterow),
// conditional-panel reveals, exact note text). This map declares the render-tests that carry those structural
// assertions for a screen; the guard asserts they EXIST (can't be deleted) so structural proof can't regress.
//
// RULE: a STRUCTURALLY COMPLEX screen (multi-section wizard) may NOT be added to ENFORCED unless it appears
// here with render-tests — token-pass alone must never lock such a screen (that was the false-DONE). Simple
// column-only tables are token-sufficient and need no entry. The render-tests themselves run in the CI vitest
// suite; this guard guarantees their continued presence.
const STRUCTURAL_RENDER_TESTS = {
  "Load Book/Edit Wizard": [
    "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.test.tsx",
    "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.test.tsx",
    "apps/frontend/src/components/dispatch/hos/DriverHosClocks.test.tsx",
  ],
  "Create/Edit Work Order Wizard": [
    "apps/frontend/src/pages/maintenance/components/CreateWOSectionRenderV5Header.test.tsx",
    // Full-modal DOM render-test: mounts <CreateWorkOrderModal open> and asserts the render-v5 root,
    // the A→B→C→D→E section badges IN ORDER, and each section testid (wo-vmrs-repair-detail / wo-parts-labor /
    // wo-invoice-payment / wo-documents) actually reach the DOM. Catches "render-v5 layout removed/renamed"
    // (the pre-#1426 / testid-removed regression) that token-in-source presence cannot see.
    "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.test.tsx",
  ],
  // R&M Status Board was ENFORCED with an EMPTY token list (vacuous). Now backed by real board/strip tokens
  // + this render-test which mounts RMStatStrip and asserts all 8 stat tiles reach the DOM.
  "R&M Status Board": [
    "apps/frontend/src/pages/maintenance/components/RMStatStrip.test.tsx",
  ],
};
// Screens that are structurally complex → require a STRUCTURAL_RENDER_TESTS entry before they can be ENFORCED.
const REQUIRE_STRUCTURAL_TESTS = new Set(["Load Book/Edit Wizard", "Create/Edit Work Order Wizard"]);

if (!fs.existsSync(CONTRACT)) {
  console.error(`verify:design-parity FAIL: missing contract ${path.relative(ROOT, CONTRACT)}`);
  process.exit(1);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
const failures = []; // hard RED — only ENFORCED screens contribute here
const backlog = []; // soft — active build punch list, printed but non-fatal
let enforcedPassing = 0;
let deferredCount = 0;

// A label map so the punch list shows human field names, not normalized tokens.
const labelFor = (spec, token) => {
  const i = (spec.required_tokens ?? []).indexOf(token);
  return i >= 0 && spec.required_labels?.[i] ? spec.required_labels[i] : token;
};

for (const [screen, spec] of Object.entries(contract)) {
  const components = SCREEN_COMPONENTS[screen];
  if (!components) {
    failures.push(`${screen}: no component mapping in verify-design-parity.mjs (add it to SCREEN_COMPONENTS)`);
    continue;
  }
  let source = "";
  let componentMissing = false;
  for (const comp of components) {
    const p = path.join(ROOT, comp);
    if (!fs.existsSync(p)) {
      // A moved/renamed component is a real wiring bug — always RED, regardless of enforced state.
      failures.push(`${screen}: component not found (${comp}) — update SCREEN_COMPONENTS`);
      componentMissing = true;
      continue;
    }
    source += fs.readFileSync(p, "utf8") + "\n";
  }
  if (componentMissing) continue;

  const normalized = norm(source);
  const deferred = DEFERRED[screen]?.tokens ?? [];
  const missing = [];
  for (const token of spec.required_tokens ?? []) {
    if (normalized.includes(token)) continue;
    if (deferred.includes(token)) {
      deferredCount++;
      continue;
    }
    missing.push(token);
  }

  // Structural gate: declared render-tests must exist (they carry the in-the-right-section/row assertions).
  const structuralTests = STRUCTURAL_RENDER_TESTS[screen] ?? [];
  const missingTests = structuralTests.filter((t) => !fs.existsSync(path.join(ROOT, t)));
  if (missingTests.length > 0) {
    failures.push(`${screen} [STRUCTURE]: required render-test(s) missing → ${missingTests.join(", ")} (structural proof can't regress)`);
  }
  // A structurally-complex screen can't be ENFORCED without render-tests proving its layout.
  if (ENFORCED.has(screen) && REQUIRE_STRUCTURAL_TESTS.has(screen) && structuralTests.length === 0) {
    failures.push(`${screen} [STRUCTURE]: ENFORCED but no render-tests declared — token-pass alone must not lock a multi-section wizard`);
  }

  if (ENFORCED.has(screen)) {
    if (missing.length > 0) {
      failures.push(
        `${screen} [ENFORCED — REGRESSION]: ${missing.length} design field(s) lost → ` +
          missing.map((t) => labelFor(spec, t)).join(" · ")
      );
    } else {
      enforcedPassing++;
    }
  } else if (missing.length > 0) {
    backlog.push(
      `${screen}: ${missing.length} field(s) to build → ` + missing.map((t) => labelFor(spec, t)).join(" · ")
    );
  } else {
    // Reached parity but not yet promoted — tell the coder to lock it.
    backlog.push(`${screen}: ✅ at full parity — add to ENFORCED set to lock it against regression`);
  }
}

if (backlog.length > 0) {
  console.log("verify:design-parity — DESIGN BACKLOG (machine-checked punch list, non-blocking):");
  for (const b of backlog) console.log(`  • ${b}`);
  console.log("  (build each to its docs/design/ file, then add the screen to ENFORCED)\n");
}

if (failures.length > 0) {
  console.error("verify:design-parity FAIL — an ENFORCED screen drifted from its design contract:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nAn ENFORCED screen lost a design field. Restore it — these screens are parity-locked.");
  process.exit(1);
}
console.log(
  `verify:design-parity PASS — ${enforcedPassing}/${ENFORCED.size} enforced screens locked at design parity` +
    (deferredCount ? `; ${deferredCount} field(s) deferred behind gated migrations` : "") +
    (backlog.length ? `; ${backlog.length} screen(s) in active build backlog` : "")
);
