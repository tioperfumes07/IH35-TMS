#!/usr/bin/env node
/**
 * CHROME-11 — nested +Create from a money surface must open InlineCreateDrawer / ParityDrawer
 * chrome, never a centered Modal stacked on top of an already-open money drawer.
 *
 * Covers the two nested-create backends behind ReferenceSelect (A2) plus the driver-picker
 * carve-out (VendorBillForm's "+ Create driver" inside the Bill ParityDrawer), which does not go
 * through ReferenceSelect because CreateDriverModal is the single canonical driver creator
 * (Blueprint 4.2.2.1) and must not be duplicated.
 *
 * SELFTEST (added 2026-07-22): the assertions below are pure functions of source text, so they are
 * exercised against good AND deliberately-broken fixtures. Without that, a guard's own correctness
 * is unverified — a typo'd regex would report PASS forever and the block would look protected when
 * it is not. ~500 other guards in this repo carry a --selftest; this one did not.
 *
 * Run: node scripts/verify-chrome-11-nested-create-drawer.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LABEL = "verify-chrome-11-nested-create-drawer";

const FILES = {
  referenceSelect: "apps/frontend/src/components/parity/ReferenceSelect.tsx",
  quickCreate: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
  createDriverModal: "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
  vendorBillForm: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
};

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

/**
 * All CHROME-11 assertions, as a pure function of the four sources.
 * Kept byte-identical in meaning to the original inline checks — only made testable.
 */
export function checkChrome11({ referenceSelect, quickCreate, createDriverModal, vendorBillForm }) {
  const failures = [];

  // 1) ReferenceSelect (A2) must keep routing every createKind through InlineCreateDrawer or
  //    QuickCreateEntityModal — both ParityDrawer-shell chrome — never a bare centered Modal.
  if (!referenceSelect.includes("InlineCreateDrawer")) {
    failures.push("ReferenceSelect.tsx no longer wires InlineCreateDrawer");
  }
  if (!referenceSelect.includes("QuickCreateEntityModal")) {
    failures.push("ReferenceSelect.tsx no longer wires QuickCreateEntityModal");
  }
  if (/from\s+["']\.\.\/Modal["']/.test(referenceSelect)) {
    failures.push("ReferenceSelect.tsx imports the centered Modal shell directly — regression to Modal-on-drawer");
  }
  if (!/onBack=\{onClose\}/.test(quickCreate)) {
    failures.push("QuickCreateEntityModal.tsx must expose a back affordance to its parent surface");
  }

  // 2) QuickCreateEntityModal's own outer shell must stay ParityDrawer (fixed by PR #3200) — never
  //    regress back to the centered Modal it replaced.
  if (!quickCreate.includes("ParityDrawer")) {
    failures.push("QuickCreateEntityModal.tsx no longer shells with ParityDrawer");
  }
  if (/<Modal[\s>]/.test(quickCreate)) {
    failures.push("QuickCreateEntityModal.tsx renders a centered <Modal> — Modal-on-drawer regression");
  }

  // 3) CreateDriverModal must support the shell="drawer" nested variant (ParityDrawer chrome) while
  //    keeping shell="modal" as the unchanged default for top-level entry points.
  if (!/shell\??:\s*"modal"\s*\|\s*"drawer"/.test(createDriverModal)) {
    failures.push('CreateDriverModal.tsx missing shell?: "modal" | "drawer" prop');
  }
  if (!createDriverModal.includes('shell === "drawer"')) {
    failures.push('CreateDriverModal.tsx no longer branches on shell === "drawer"');
  }
  if (!createDriverModal.includes("ParityDrawer")) {
    failures.push("CreateDriverModal.tsx no longer imports/uses ParityDrawer for the drawer shell");
  }

  // 4) VendorBillForm (Bill create ParityDrawer) — nested driver create via EntityPicker nestedInDrawer
  //    or legacy CreateDriverModal shell="drawer".
  const vendorBillNestedDriverCreate =
    /<EntityPicker[\s\S]{0,400}kind=["']driver["'][\s\S]{0,400}nestedInDrawer/.test(vendorBillForm) ||
    /<CreateDriverModal[\s\S]{0,700}?shell="drawer"/.test(vendorBillForm);
  if (!vendorBillNestedDriverCreate) {
    failures.push(
      'VendorBillForm.tsx must use EntityPicker kind="driver" nestedInDrawer or <CreateDriverModal shell="drawer" — Modal-on-drawer regression on Bill create'
    );
  }

  return failures;
}

/** A minimal source set that satisfies every assertion. */
function goodFixture() {
  return {
    referenceSelect: `import { InlineCreateDrawer } from "./InlineCreateDrawer";
import { QuickCreateEntityModal } from "../forms/shared/QuickCreateEntityModal";`,
    quickCreate: `import { ParityDrawer } from "../../parity/ParityDrawer";
export function QuickCreateEntityModal({ onClose }) { return <ParityDrawer onBack={onClose} />; }`,
    createDriverModal: `import { ParityDrawer } from "../parity/ParityDrawer";
type Props = { shell?: "modal" | "drawer" };
export function CreateDriverModal({ shell = "modal" }: Props) {
  if (shell === "drawer") return <ParityDrawer />;
  return <Modal />;
}`,
    vendorBillForm: `<EntityPicker kind="driver" nestedInDrawer operatingCompanyId={id} />`,
  };
}

function selftest() {
  const problems = [];

  const good = checkChrome11(goodFixture());
  if (good.length !== 0) problems.push(`good fixture should pass, got: ${good.join(" | ")}`);

  // Each planted regression must be caught. If a regex is typo'd, the corresponding case fails here
  // instead of silently reporting PASS against real source forever.
  const cases = [
    // NOTE: replace ALL occurrences — the identifier appears both as the imported name and inside
    // the module path, so a single-occurrence replace leaves the string present and the assertion
    // still passes. (The selftest caught exactly that when this case was first written.)
    ["referenceSelect", (f) => { f.referenceSelect = f.referenceSelect.replaceAll("InlineCreateDrawer", "SomethingElse"); }, "InlineCreateDrawer"],
    ["referenceSelect", (f) => { f.referenceSelect += `\nimport { Modal } from "../Modal";`; }, "centered Modal shell directly"],
    ["quickCreate", (f) => { f.quickCreate = f.quickCreate.replace(/ParityDrawer/g, "Modal"); }, "no longer shells with ParityDrawer"],
    ["quickCreate", (f) => { f.quickCreate += "\n<Modal />"; }, "renders a centered <Modal>"],
    ["quickCreate", (f) => { f.quickCreate = f.quickCreate.replace("onBack={onClose}", ""); }, "back affordance"],
    ["createDriverModal", (f) => { f.createDriverModal = f.createDriverModal.replace('shell?: "modal" | "drawer"', "shell?: string"); }, "missing shell"],
    ["createDriverModal", (f) => { f.createDriverModal = f.createDriverModal.replace('shell === "drawer"', 'shell === "sheet"'); }, "no longer branches"],
    ["vendorBillForm", (f) => { f.vendorBillForm = `<CreateDriverModal open={x} onClose={y} />`; }, "Modal-on-drawer regression on Bill create"],
    ["vendorBillForm", (f) => { f.vendorBillForm = `<EntityPicker kind="driver" value={null} />`; }, "Modal-on-drawer regression on Bill create"],
  ];

  for (const [name, mutate, expectFragment] of cases) {
    const f = goodFixture();
    mutate(f);
    const failures = checkChrome11(f);
    if (!failures.some((x) => x.includes(expectFragment))) {
      problems.push(`planted regression in ${name} ("${expectFragment}") was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  const sources = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
  const failures = checkChrome11(sources);
  if (failures.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log(`PASS ${LABEL} — nested +Create stays InlineCreateDrawer/ParityDrawer chrome`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
