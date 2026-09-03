#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function problems({ service, routes, modal, board, api }) {
  const out = [];
  if (!/reason_code\?: string/.test(service)) out.push("service input must carry reason_code");
  if (!/E_VEHICLE_SWAP_REASON_REQUIRED/.test(service)) out.push("unit swap must fail when its reason is absent");
  if (!/FROM catalogs\.load_cancellation_reasons/.test(service)) out.push("swap reason must validate against catalogs.load_cancellation_reasons");
  if (/catalogs\.cancellation_reasons/.test(service)) out.push("legacy catalogs.cancellation_reasons is forbidden");
  if (!/reason_code[\s\S]{0,300}INSERT INTO dispatch\.load_assignment_history|INSERT INTO dispatch\.load_assignment_history[\s\S]{0,500}reason_code/.test(service)) out.push("assignment-history event must persist reason_code");
  if (!/reason_code: z\.string\(\)/.test(routes)) out.push("route contract must accept reason_code");
  if (!/currentUnitId/.test(modal) || !/isVehicleSwap/.test(modal)) out.push("modal must distinguish reassignment from initial assignment");
  if (!/listDispatchCancellationReasons/.test(modal)) out.push("modal must read the canonical reason catalog");
  if (!/vehicle-swap-reason/.test(modal)) out.push("modal must render a vehicle-swap reason control");
  if (!/reason_code/.test(api) || !/reason_code/.test(board)) out.push("frontend API path must forward reason_code");
  return out;
}

const good = {
  service: `reason_code?: string E_VEHICLE_SWAP_REASON_REQUIRED FROM catalogs.load_cancellation_reasons INSERT INTO dispatch.load_assignment_history (reason_code)`,
  routes: `reason_code: z.string()`,
  modal: `currentUnitId isVehicleSwap listDispatchCancellationReasons vehicle-swap-reason reason_code`,
  board: `reason_code`,
  api: `reason_code`,
};

function selftest() {
  if (problems(good).length) throw new Error("good fixture failed");
  const mutations = [
    ["service", "E_VEHICLE_SWAP_REASON_REQUIRED"],
    ["service", "FROM catalogs.load_cancellation_reasons"],
    ["service", "reason_code?: string"],
    ["routes", "reason_code: z.string()"],
    ["modal", "currentUnitId"],
    ["modal", "listDispatchCancellationReasons"],
    ["modal", "vehicle-swap-reason"],
    ["board", "reason_code"],
    ["api", "reason_code"],
  ];
  for (const [file, token] of mutations) {
    const fixture = { ...good, [file]: good[file].replace(token, "") };
    if (!problems(fixture).length) throw new Error(`mutation escaped: ${file} ${token}`);
  }
  const legacy = { ...good, service: `${good.service} catalogs.cancellation_reasons` };
  if (!problems(legacy).some((p) => p.includes("legacy"))) throw new Error("legacy catalog mutation escaped");
  console.log(`verify-fleet-vehicle-swap-event: selftest PASS ${mutations.length + 1}/${mutations.length + 1}`);
}

function check() {
  const found = problems({
    service: read("apps/backend/src/dispatch/quick-assign.service.ts"),
    routes: read("apps/backend/src/dispatch/quicksave.routes.ts"),
    modal: read("apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx"),
    board: read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx"),
    api: read("apps/frontend/src/api/dispatch.ts"),
  });
  if (found.length) throw new Error(found.join("; "));
  console.log("verify-fleet-vehicle-swap-event: PASS");
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else check();
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
