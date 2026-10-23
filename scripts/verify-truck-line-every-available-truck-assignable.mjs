#!/usr/bin/env node
/**
 * LEAD 443.257-A (owner screenshots 10-22 7:01 PM CT): on Truck Line, T122 / T124 / T147 showed "No driver on
 * file" and NO "Assign a load →" — every available truck with no driver on the row was a dead end.
 *
 * Static guard over TruckLineBoard.tsx AvailableTruckTrack:
 *   R1  the assign button renders for EVERY available row (not gated on a driver), keyed by unit;
 *   R2  onAssign accepts a null driver (the wizard opens with the truck preset and the driver empty);
 *   R3  the "No driver on file" dead end is gone; the note says "no driver yet — choose in the wizard" or
 *       "usual: <Full Name>";
 *   R4  Dispatch wires the nullable driver straight into the Book wizard prefill (nothing written here).
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  board: "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
};

function trackBody(src) {
  const start = src.indexOf("function AvailableTruckTrack");
  if (start < 0) return "";
  const next = src.indexOf("\nfunction ", start + 10);
  const nextExport = src.indexOf("\nexport function ", start + 10);
  const end = [next, nextExport].filter((n) => n > 0).sort((a, b) => a - b)[0];
  return src.slice(start, end ?? undefined);
}

export function audit(s) {
  const f = [];
  const body = trackBody(s.board);
  if (!body) return ["AvailableTruckTrack not found"];
  if (/\{a\.driver_id \? \(\s*<button/.test(body)) f.push("R1: the assign button is gated on a driver — a driverless truck gets no button");
  if (!/data-testid=\{`truck-line-assign-unit-\$\{trackKey\}`\}/.test(body)) f.push("R1: the assign button is not keyed by unit");
  if (!/onAssign: \(driverId: string \| null, unitId: string \| null\) => void/.test(body)) f.push("R2: onAssign does not accept a null driver");
  if (!/onAssign\(a\.driver_id \?\? null, row\.unit_id\)/.test(body)) f.push("R2: the button does not pass the (possibly empty) driver + unit");
  if (/No driver on file/.test(body)) f.push("R3: the 'No driver on file' dead end is back");
  if (!/no driver yet — choose in the wizard/.test(body) || !/usual: \$\{/.test(body)) f.push("R3: the grey note (usual driver / choose in the wizard) is missing");
  if (!/onAssignDriver=\{\(assignDriverId, assignUnitId\) => \{\s*setBookDriverId\(assignDriverId\);\s*setBookUnitId\(assignUnitId\);\s*openBookLoadModal\(\);/.test(s.dispatch)) f.push("R4: Dispatch does not open the Book wizard with the truck + nullable driver preset");
  return f;
}

const load = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = audit(real).length;
  const plant = (key, from, to) => (real[key].includes(from) ? audit({ ...real, [key]: real[key].replace(from, to) }).length > base : null);
  const cases = [
    ["a driver-gated button FAILS", plant("board", "      <button\n        type=\"button\"\n        className=\"absolute rounded-[13px] bg-[#16A34A]", "      {a.driver_id ? (\n        <button\n        type=\"button\"\n        className=\"absolute rounded-[13px] bg-[#16A34A]")],
    ["a string-only driver FAILS", plant("board", "onAssign: (driverId: string | null, unitId: string | null) => void", "onAssign: (driverId: string, unitId: string | null) => void")],
    ["the dead-end text FAILS", plant("board", "no driver yet — choose in the wizard", "No driver on file")],
    ["Dispatch not opening the wizard FAILS", plant("dispatch", "setBookDriverId(assignDriverId);", "void assignDriverId;")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-truck-line-every-available-truck-assignable --selftest FAIL" : `verify-truck-line-every-available-truck-assignable --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(load());
if (failures.length) {
  console.error(`verify-truck-line-every-available-truck-assignable: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("verify-truck-line-every-available-truck-assignable: OK — every available truck has one Assign a load → (R1–R4)");
