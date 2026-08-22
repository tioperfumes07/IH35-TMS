#!/usr/bin/env node
/**
 * verify-driver-create-save-disabled-reason.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22): the Create Driver wizard's step-4 Save button ORs together
 * five independent gates (identityStepReady, drugScreenAcknowledged, returning-driver ack, prior-
 * driver selection, returningCheckLoading) into a single `disabled` boolean, but surfaced NOTHING
 * about which one was blocking. Live-reproduced: filled every required field, reached step 4, left
 * the "Pre-employment drug screen ordered / result on file" checkbox unchecked, clicked Save --
 * zero network requests (confirmed via window.fetch instrumentation), zero console output, zero
 * visible change. An operator sees a button that looks clickable and does nothing; that reads as a
 * broken app, not a missing checkbox. Checking the box (and only that) flipped `disabled` to false
 * and Save then fired a real POST that created the driver (id returned, driver appeared in the list).
 *
 * FIX: CreateDriverModal.tsx now computes `saveDisabledReason`, a human string mirroring the exact
 * branch order of the `disabled` boolean, and surfaces it two ways: as a native tooltip via a new
 * `title` prop on SaveDropdown (forwarded to the underlying Button, matching the existing
 * `disabledReason`/`title` convention used by KpiCard and ReserveTracker elsewhere in this repo),
 * and as an inline red line below the button row on step 4 (visible without hovering, since the
 * button itself gives no visual cue that it differs from an enabled one at a glance).
 *
 * INVARIANT (static -- no database):
 *  (a) CreateDriverModal.tsx defines `saveDisabledReason` and passes it as `title` to SaveDropdown.
 *  (b) SaveDropdown.tsx accepts a `title` prop and forwards it to the primary Button when disabled.
 *  (c) CreateDriverModal.tsx renders an inline `driver-create-save-disabled-reason` element on the
 *      last wizard step when a reason is present.
 *
 * Self-test: node scripts/verify-driver-create-save-disabled-reason.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-create-save-disabled-reason";

const MODAL_FILE = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const DROPDOWN_FILE = "apps/frontend/src/components/forms/SaveDropdown.tsx";

export function checkModal(src) {
  const failures = [];
  if (!/const\s+saveDisabledReason\s*=/.test(src)) {
    failures.push(`${MODAL_FILE}: missing saveDisabledReason computation.`);
  }
  if (!/title=\{saveDisabledReason\}/.test(src)) {
    failures.push(`${MODAL_FILE}: SaveDropdown is not passed title={saveDisabledReason}.`);
  }
  if (!/data-testid="driver-create-save-disabled-reason"/.test(src)) {
    failures.push(`${MODAL_FILE}: missing the inline visible disabled-reason element.`);
  }
  return failures;
}

export function checkDropdown(src) {
  const failures = [];
  if (!/title\?:\s*string/.test(src)) {
    failures.push(`${DROPDOWN_FILE}: SaveDropdownProps no longer declares an optional title prop.`);
  }
  if (!/title=\{disabled \? title : undefined\}/.test(src)) {
    failures.push(`${DROPDOWN_FILE}: the primary Button no longer forwards title when disabled.`);
  }
  return failures;
}

function staticCheck() {
  const failures = [];
  const modalAbs = path.join(ROOT, MODAL_FILE);
  const dropdownAbs = path.join(ROOT, DROPDOWN_FILE);
  if (!fs.existsSync(modalAbs)) failures.push(`${MODAL_FILE}: file missing`);
  else failures.push(...checkModal(fs.readFileSync(modalAbs, "utf8")));
  if (!fs.existsSync(dropdownAbs)) failures.push(`${DROPDOWN_FILE}: file missing`);
  else failures.push(...checkDropdown(fs.readFileSync(dropdownAbs, "utf8")));
  return failures;
}

if (process.argv.includes("--selftest")) {
  const badModal = `const x = 1;`;
  if (checkModal(badModal).length !== 3) {
    console.error(`${LABEL} SELFTEST FAIL -- missing modal wiring not caught (expected 3, got ${checkModal(badModal).length})`);
    process.exit(1);
  }
  const goodModal = `
    const saveDisabledReason = !identityStepReady ? "x" : undefined;
    <SaveDropdown title={saveDisabledReason} />
    <p data-testid="driver-create-save-disabled-reason">{saveDisabledReason}</p>
  `;
  if (checkModal(goodModal).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct modal wiring wrongly flagged`);
    process.exit(1);
  }

  const badDropdown = `type SaveDropdownProps = { disabled?: boolean };`;
  if (checkDropdown(badDropdown).length !== 2) {
    console.error(`${LABEL} SELFTEST FAIL -- missing dropdown wiring not caught (expected 2, got ${checkDropdown(badDropdown).length})`);
    process.exit(1);
  }
  const goodDropdown = `
    type SaveDropdownProps = { disabled?: boolean; title?: string };
    <Button title={disabled ? title : undefined} />
  `;
  if (checkDropdown(goodDropdown).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct dropdown wiring wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS -- missing modal/dropdown halves caught, correct shapes accepted`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- Create Driver's Save button explains why it is disabled, both as a tooltip and as an inline visible line`);
