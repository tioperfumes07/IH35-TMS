#!/usr/bin/env node
/**
 * GUARD: safety money surfaces use the shared drawer, real pickers and real money inputs.
 *
 * WHY THIS EXISTS (2026-07-23 audit — SAF-F10, SAF-F25)
 *
 * F10: Escrow Forfeit — an action that moves a REAL driver's money — was a centered Modal with three
 * raw inputs: a bare type="number" amount, an unvalidated free-text reason, and a text box where the
 * operator was expected to TYPE A RAW UUID for linked_liability_id. Hand-typing the uuid of the debt
 * a forfeiture offsets is how the wrong debt gets offset, and nothing in the layout signalled that
 * this was financial.
 *
 * F25: three different drawer implementations existed side by side — ParityDrawer (shared),
 * AccidentReportDrawer's bespoke <aside> + hand-rolled backdrop, and FineDetailDrawer's bespoke
 * <aside>. Each carried its own z-index, width, close affordance and escape/focus behaviour, so
 * every chrome fix had to be made three times and the copies drifted.
 *
 * The amount assertion is the sharpest one here: MoneyInput has TWO seams (cents and dollars) and
 * the forfeit payload is DOLLARS. Binding the cents seam would multiply a real forfeiture by 100,
 * which is why the guard pins the dollars props specifically rather than just "uses MoneyInput".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORFEIT = "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx";
const ACCIDENT = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const FINE = "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx";
const FILES = [FORFEIT, ACCIDENT, FINE];
const LABEL = "verify-safety-money-chrome";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertSafetyMoneyChrome(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = strip(sources?.[rel] ?? read(rel));
  const problems = [];

  // F25 — one drawer surface, not three.
  for (const rel of FILES) {
    if (!/<ParityDrawer/.test(src[rel])) {
      problems.push(`${rel}: does not use ParityDrawer — a second drawer implementation means every chrome fix has to be made twice and the copies drift.`);
    }
    if (/<aside[\s>]/.test(src[rel])) {
      problems.push(`${rel}: still renders a bespoke <aside> drawer alongside the shared one.`);
    }
  }
  if (/className="fixed inset-0 z-40 bg-black\/20"/.test(src[ACCIDENT]) || /className="fixed inset-0 z-40 bg-black\/20"/.test(src[FINE])) {
    problems.push(`a hand-rolled backdrop survives — ParityDrawer owns the backdrop, and two of them stack z-indexes.`);
  }

  // F10 — money grammar on a money action.
  if (/type="number"/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: the amount is a raw number input on a money action — it must use MoneyInput.`);
  }
  if (!/valueDollars=\{amountUsd\}/.test(src[FORFEIT]) || !/onChangeDollars=\{setAmountUsd\}/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: the amount is not bound to MoneyInput's DOLLARS seam — the forfeit payload is dollars, and binding the cents seam would multiply a real forfeiture by 100.`);
  }
  // F10 — a picker, not a typed uuid.
  if (/placeholder="Linked liability_id/.test(src[FORFEIT]) || /setLinkedLiabilityId\(e\.target\.value\)/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: the linked liability is a free-text uuid box — an operator hand-typing a uuid is how the wrong debt gets offset.`);
  }
  if (!/getLiabilitiesByDriver/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: the liability picker is not backed by the real per-driver catalog (GET /api/v1/liabilities/by-driver/:driver_id).`);
  }
  // F10 — reason required, amount bounded.
  if (!/reasonTooShort/.test(src[FORFEIT]) || !/submitDisabled/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: submit is not gated on a required reason — a forfeiture with no recorded reason is unanswerable when the driver disputes it.`);
  }
  if (!/overBalance/.test(src[FORFEIT])) {
    problems.push(`${FORFEIT}: the amount is not bounded by the driver's escrow balance — you could forfeit more escrow than exists.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertSafetyMoneyChrome(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("forfeit-back-to-centered-modal",
    { ...live, [FORFEIT]: live[FORFEIT].split("<ParityDrawer").join("<Modal").split("</ParityDrawer>").join("</Modal>") },
    "does not use ParityDrawer");
  expectCaught("bespoke-aside-returns",
    { ...live, [FINE]: live[FINE].replace('<div ref={panelRef as React.RefObject<HTMLDivElement>} data-testid="fine-detail-drawer">', '<aside data-testid="fine-detail-drawer">') },
    "still renders a bespoke <aside>");
  expectCaught("cents-seam-bound-by-mistake",
    { ...live, [FORFEIT]: live[FORFEIT].replace("valueDollars={amountUsd}", "valueCents={amountUsd}").replace("onChangeDollars={setAmountUsd}", "onChangeCents={setAmountUsd}") },
    "not bound to MoneyInput's DOLLARS seam");
  expectCaught("uuid-textbox-returns",
    { ...live, [FORFEIT]: live[FORFEIT].split("getLiabilitiesByDriver").join("noCatalog") },
    "not backed by the real per-driver catalog");
  expectCaught("reason-gate-removed",
    { ...live, [FORFEIT]: live[FORFEIT].split("reasonTooShort").join("false") },
    "not gated on a required reason");
  expectCaught("balance-bound-removed",
    { ...live, [FORFEIT]: live[FORFEIT].split("overBalance").join("false") },
    "not bounded by the driver's escrow balance");

  const liveProblems = assertSafetyMoneyChrome(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyMoneyChrome();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — one drawer surface across all three; forfeit uses MoneyInput (dollars seam), a real liability picker, a required reason and a balance bound`);
