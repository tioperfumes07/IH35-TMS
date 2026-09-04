#!/usr/bin/env node
/**
 * verify-book-load-money-and-controls.mjs
 *
 * CC-2-INSTRUCTIONS-09-02-2026.txt tasks 1-5 + guard spec ("after task 5"), tasks 6/19/20.
 * Extended 2026-09-03 (owner layout restore): Section A freight fields, no Equipment/load type,
 * MoneyInput leading-minus, accessorial amounts column total, Time window + driver pay rate h-7.
 *
 * Combobox itself may use FILTER_CONTROL_SIZE_CLASS (h-9) for toolbar filters (#20059); Book Load
 * form controls must still pass h-7 via their own className (TimeWindowDropdown / pay rate).
 */
import fs from "node:fs";

const LIB = "apps/frontend/src/components/dispatch/accessorial-editor-lib.ts";
const EDITOR = "apps/frontend/src/components/dispatch/AccessorialEditor.tsx";
const WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const EQUIPMENT = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const TIME_WINDOW = "apps/frontend/src/pages/dispatch/components/book-load-v4/TimeWindowDropdown.tsx";
const MONEY_INPUT = "apps/frontend/src/components/forms/MoneyInput.tsx";
const NUMBER_INPUT = "apps/frontend/src/components/forms/NumberInput.tsx";

function violations(lib, editor, wizard, equipment, timeWindow, moneyInput, numberInput) {
  const errors = [];
  if (lib.includes("sumAccessorialCents") && /sumAccessorialCents[\s\S]{0,180}Math\.max\(0/.test(lib)) {
    errors.push("sumAccessorialCents still clamps accessorial amounts to zero");
  }
  if (/amount_cents: Math\.max\(0, Number\(opts/.test(lib)) {
    errors.push("seedAccessorialRow still clamps negative accessorial amounts");
  }
  if (/const amount = Math\.max\(0, Number\(row\.amount_cents/.test(lib)) {
    errors.push("buildBookLoadChargeLines still drops negative accessorials");
  }
  if (!lib.includes("LINEHAUL_NEGATIVE_ERROR") || !lib.includes("linehaulFuelError")) {
    errors.push("negative linehaul/fuel must raise, not silently zero, with a named error");
  }
  if (editor.includes("amount_cents: Math.max(0, c")) {
    errors.push("AccessorialEditor still clamps typed amounts to zero");
  }
  if (!wizard.includes("Invoice total") || !wizard.includes("customerInvoiceTotal")) {
    errors.push("Book Load still labels a figure that is not the customer invoice total");
  }
  if (wizard.includes("h-[46px]")) {
    errors.push("Book Load still uses the one-off h-[46px] control height");
  }
  if (!/linehaulFuelError\(\s*["']linehaul["']/.test(wizard) || !/linehaulFuelError\(\s*["']fuel_surcharge["']/.test(wizard)) {
    errors.push("linehaulFuelError is not called for both linehaul and fuel_surcharge in the wizard");
  }
  if (!/form\.setError\(\s*["']linehaul_cents["']/.test(wizard) || !/form\.setError\(\s*["']fuel_surcharge_cents["']/.test(wizard)) {
    errors.push("linehaul/fuel surcharge negative error is not surfaced via form.setError");
  }
  if (!/<input[\s\S]*?className="[^"]*\bh-7\b[^"]*"/.test(moneyInput)) {
    errors.push("MoneyInput <input> is not h-7");
  }
  if (!/<input[\s\S]*?className="[^"]*\btabular-nums\b[^"]*"/.test(moneyInput)) {
    errors.push("MoneyInput <input> is missing tabular-nums");
  }
  if (!/<input[\s\S]*?className=\{[^}]*\bh-7\b/.test(numberInput)) {
    errors.push("NumberInput <input> is not h-7");
  }
  if (!/<input[\s\S]*?className=\{[^}]*\btabular-nums\b/.test(numberInput)) {
    errors.push("NumberInput <input> is missing tabular-nums");
  }
  if (/B4\s*\(\s*owner\s+ruling/i.test(wizard)) {
    errors.push('fabricated "B4 (owner ruling" citation is still in BookLoadModalV4');
  }
  if (!/Broker\s*\/\s*Direct/.test(wizard)) {
    errors.push("Book Load missing Broker / Direct label");
  }
  const aStart = wizard.indexOf("Customer · Invoice · Charges");
  const bStart = wizard.indexOf("Equipment · Driver · Trailer");
  if (aStart < 0 || bStart < 0 || aStart > bStart) {
    errors.push("Book Load Section A/B headers missing or reordered");
  } else {
    const sectionA = wizard.slice(aStart, bStart);
    if (!sectionA.includes("Commodity") || !sectionA.includes("Weight (lbs)") || !sectionA.includes("Broker / Direct")) {
      errors.push("Commodity, Weight, and Broker/Direct must render inside Section A");
    }
    if (sectionA.includes("Equipment / load type") || /createKind="load_type"/.test(sectionA)) {
      errors.push("Section A must not host the removed catalog load-type picker");
    }
  }
  const sectionB = bStart >= 0 ? wizard.slice(bStart, bStart + 2500) : "";
  if (/createKind="load_type"/.test(sectionB) || /Equipment\s*\/\s*load type/.test(sectionB)) {
    errors.push("Section B must not render Equipment / load type");
  }
  if (!moneyInput.includes('cleaned === "-"') || !moneyInput.includes("Incomplete typed states")) {
    errors.push("MoneyInput must allow typing a leading minus without emitting null mid-keystroke");
  }
  if (!editor.includes("accessorial-amounts-column-total")) {
    errors.push("AccessorialEditor amounts column must show a total (display bug fix)");
  }
  if (!/className="h-7 w-full max-w-\[11rem\] text-xs"/.test(timeWindow)) {
    errors.push("Time window dropdown must be h-7 and width-capped");
  }
  if (!/driver-pay-rate-per-mile[\s\S]{0,220}h-7 w-\[5\.5rem\][\s\S]{0,80}text-right[\s\S]{0,40}tabular-nums/.test(equipment)) {
    errors.push("Driver pay rate must be h-7, narrow, right-aligned, tabular-nums");
  }
  const tripBannerStart = wizard.indexOf('data-testid="trip-type-banner"');
  const tripBanner = tripBannerStart >= 0 ? wizard.slice(tripBannerStart, tripBannerStart + 1800) : "";
  if (!tripBanner || /\bflex-1\b/.test(tripBanner)) {
    errors.push("Trip Type buttons must not use flex-1 (they stretch to 376px)");
  }
  if (!/createKind="load_commodity"/.test(wizard)) {
    errors.push("Commodity must be a catalog picker with inline create");
  }
  if (!/md:col-span-2/.test(wizard)) {
    errors.push("Customer field must span 2 columns in the Section A 4-column grid");
  }
  const liveBarIdx = wizard.indexOf("<LiveLoadIdBar");
  const customerHeaderIdx = wizard.indexOf("Customer · Invoice · Charges");
  if (liveBarIdx < 0 || customerHeaderIdx < 0 || liveBarIdx < customerHeaderIdx) {
    errors.push("Load # must sit inside Section A, not over the modal header");
  }
  return errors;
}

function check(...args) {
  const errors = violations(...args);
  if (errors.length) throw new Error(errors.join("; "));
}

const lib = fs.readFileSync(LIB, "utf8");
const editor = fs.readFileSync(EDITOR, "utf8");
const wizard = fs.readFileSync(WIZARD, "utf8");
const equipment = fs.readFileSync(EQUIPMENT, "utf8");
const timeWindow = fs.readFileSync(TIME_WINDOW, "utf8");
const moneyInput = fs.readFileSync(MONEY_INPUT, "utf8");
const numberInput = fs.readFileSync(NUMBER_INPUT, "utf8");
const combo = fs.readFileSync("apps/frontend/src/components/Combobox.tsx", "utf8");
if (!combo.includes("formFieldChrome") || !combo.includes("h-7 w-full min-w-0 rounded-sm border")) {
  throw new Error("Combobox size=sm must paint the 28px bordered input itself (WIZ-34)");
}

if (process.argv.includes("--selftest")) {
  const base = [lib, editor, wizard, equipment, timeWindow, moneyInput, numberInput];
  const mutations = [
    [lib.replace("sum + Number(row.amount_cents || 0)", "sum + Math.max(0, Number(row.amount_cents || 0))"), editor, wizard, equipment, timeWindow, moneyInput, numberInput],
    [lib, editor.replace("amount_cents: c ?? 0", "amount_cents: Math.max(0, c ?? 0)"), wizard, equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard.replaceAll("Invoice total", "Section total"), equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard.replace("inline-flex h-7 shrink-0", "flex h-[46px] flex-1"), equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard.replace('linehaulFuelError("linehaul"', 'linehaulFuelErrorDISABLED("linehaul"'), equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard.replace('form.setError("linehaul_cents"', 'form.setErrorDISABLED("linehaul_cents"'), equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard, equipment, timeWindow, moneyInput.replace("h-7 w-full rounded-sm border border-gray-300 pl-4 pr-2 text-left text-xs tabular-nums", "w-full rounded-sm border border-gray-300 pl-4 pr-2 text-left text-xs"), numberInput],
    [lib, editor, wizard, equipment, timeWindow, moneyInput, numberInput.replace("tabular-nums", "")],
    [lib, editor, wizard.replace("Broker / Direct", "Customer kind"), equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard, equipment, timeWindow, moneyInput.replace("Incomplete typed states", "TYPED"), numberInput],
    [lib, editor.replace("accessorial-amounts-column-total", "accessorial-subtotal-only"), wizard, equipment, timeWindow, moneyInput, numberInput],
    [lib, editor, wizard, equipment, timeWindow.replace("h-7 w-full max-w-[11rem] text-xs", "h-8 w-full text-sm"), moneyInput, numberInput],
    [lib, editor, wizard, equipment.replace("h-7 w-[5.5rem]", "h-7 w-full"), timeWindow, moneyInput, numberInput],
  ];
  let caught = 0;
  for (const [index, args] of mutations.entries()) {
    try {
      check(...args);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  try {
    check(...base);
  } catch (error) {
    throw new Error(`selftest good files failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-book-load-money-and-controls --selftest (${caught}/${mutations.length})`);
} else {
  check(lib, editor, wizard, equipment, timeWindow, moneyInput, numberInput);
  console.log("PASS verify-book-load-money-and-controls");
}
