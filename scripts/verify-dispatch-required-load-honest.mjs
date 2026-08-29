#!/usr/bin/env node
/**
 * DISP-REQUIRED-LOAD-INFLATION — Matrix Required must not claim `load` on hop-only
 * or driver/unit-only surfaces with no load_id / kind=load drill (DoD-C).
 *
 * Evidence anchors (2026-08-12):
 * - secondary.settlements / pre_settlements / queues.factoring = Navigate hops (sub text)
 * - misc.chat DispatchChatPage — no load_id
 * - docs.equipment_transfers — EntityLink driver only
 * - banking factoring entry form — no load field
 * - drivers team_splits / safety hos_violations + geofence_alerts — no load_id
 *
 * KEEP load on: OCR→Book Load, map (focusLoadId), notify + layover (kind=load),
 * planning.loads / planning.calendar (EntityLink kind=load).
 *
 * Usage: node scripts/verify-dispatch-required-load-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-required-load-honest";
const OCR_PAGE = path.join(ROOT, "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx");
const OCR_API = path.join(ROOT, "apps/frontend/src/api/dispatch.ts");
const OCR_SERVICE = path.join(ROOT, "apps/backend/src/dispatch/ocr-processor.service.ts");
const OCR_ROUTES = path.join(ROOT, "apps/backend/src/dispatch/ocr-intake.routes.ts");

/** module → leafId → cols that must NOT appear */
const FORBIDDEN = {
  dispatch: {
    "secondary.settlements": ["load", "liability"],
    "secondary.pre_settlements": ["load", "liability"],
    "queues.factoring": ["load", "liability"],
    "queues.live_map": ["load"],
    "misc.chat": ["load"],
    "misc.geofence_history": ["load"],
    "docs.equipment_transfers": ["load"],
    "planning.driver": ["load"],
    "planning.truck": ["load"],
    "planning.templates": ["load"],
    "planning.unassigned": ["load"],
  },
  banking: {
    factoring: ["load"],
  },
  drivers: {
    team_splits: ["load"],
  },
  safety: {
    "hos_violations.list": ["load"],
    "geofence_alerts.list": ["load"],
  },
  vendors: {
    "md.transaction_list": ["load"],
    "detail.ap.bills": ["load"],
  },
};

/** Must KEEP load (canonical focus / Book Load / notify / layover drill) */
const MUST_KEEP = {
  dispatch: {
    "docs.ocr": ["load"],
    "queues.map": ["load"],
    "settings.notify": ["load"],
    "misc.layover": ["load"],
  },
};

function reqPath(mod) {
  return path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`);
}

function loadMod(mod) {
  return JSON.parse(fs.readFileSync(reqPath(mod), "utf8"));
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function offenders(doc, leafCols) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [leafId, cols] of Object.entries(leafCols)) {
    const leaf = byId[leafId];
    if (!leaf) {
      out.push(`missing leaf ${leafId}`);
      continue;
    }
    for (const col of cols) {
      if ((leaf.required || []).includes(col)) out.push(`${leafId} must NOT require ${col}`);
    }
  }
  return out;
}

function missingKeep(doc, leafCols) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [leafId, cols] of Object.entries(leafCols)) {
    const leaf = byId[leafId];
    if (!leaf) {
      out.push(`missing KEEP leaf ${leafId}`);
      continue;
    }
    for (const col of cols) {
      if (!(leaf.required || []).includes(col)) out.push(`${leafId} must KEEP require ${col}`);
    }
  }
  return out;
}

function hasScopedOcrLoadLookup(source) {
  const finalize = source.split("export async function finalizeOcrIntakeConversion")[1] ?? "";
  const lookup = finalize.match(/SELECT\s+id\s+FROM\s+mdata\.loads[\s\S]*?LIMIT\s+1/i)?.[0] ?? "";
  return /WHERE\s+id\s*=\s*\$1::uuid/i.test(lookup)
    && /AND\s+operating_company_id\s*=\s*\$2::uuid/i.test(lookup)
    && /AND\s+soft_deleted_at\s+IS\s+NULL/i.test(lookup);
}

if (process.argv.includes("--selftest")) {
  const doc = loadMod("dispatch");
  const clone = structuredClone(doc);
  const leaf = clone.leaves.find((l) => l.id === "misc.chat");
  if (!leaf) fail("selftest: misc.chat missing");
  leaf.required = [...(leaf.required || []), "load"];
  const bad = offenders(clone, FORBIDDEN.dispatch);
  if (!bad.length) fail("selftest: poison did not trip");
  const page = fs.readFileSync(OCR_PAGE, "utf8").replace('kind="load"', 'kind="customer"');
  if (/kind="load"/.test(page)) fail("selftest: OCR load-link mutation did not remove the exact drill");
  const service = fs.readFileSync(OCR_SERVICE, "utf8");
  if (!hasScopedOcrLoadLookup(service)) fail("selftest: canonical OCR load lookup is not recognized");
  const unscoped = service.replaceAll(/AND\s+operating_company_id\s*=\s*\$2::uuid/g, "");
  if (hasScopedOcrLoadLookup(unscoped)) fail("selftest: removing OCR load company scope did not trip");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];

for (const [mod, leafCols] of Object.entries(FORBIDDEN)) {
  failures.push(...offenders(loadMod(mod), leafCols).map((m) => `${mod}: ${m}`));
}
for (const [mod, leafCols] of Object.entries(MUST_KEEP)) {
  failures.push(...missingKeep(loadMod(mod), leafCols).map((m) => `${mod}: ${m}`));
}

const ocrPage = fs.readFileSync(OCR_PAGE, "utf8");
const ocrApi = fs.readFileSync(OCR_API, "utf8");
const ocrService = fs.readFileSync(OCR_SERVICE, "utf8");
const ocrRoutes = fs.readFileSync(OCR_ROUTES, "utf8");
if (!/kind="load" id=\{item\.converted_load_id\}/.test(ocrPage)) failures.push("dispatch: docs.ocr must render converted_load_id as a load drill");
if (!/onCreated=\{\(created\)/.test(ocrPage) || !/finalizeOcrIntakeConversion/.test(ocrPage)) failures.push("dispatch: docs.ocr must finalize from canonical Book Load onCreated id");
if (!/converted_load_id: string \| null/.test(ocrApi)) failures.push("dispatch API type must retain converted_load_id");
if (!/status IN \('pending_ocr', 'processing', 'ready_review', 'failed'\)[\s\S]*status = 'converted' AND converted_load_id IS NOT NULL/.test(ocrService)) failures.push("dispatch: converted OCR rows with a real load must remain visible");
const ocrPrefillSection = ocrService.split("export async function finalizeOcrIntakeConversion")[0] ?? ocrService;
if (/getOcrIntakeConvertPrefill[\s\S]*SET status = 'converted'/.test(ocrPrefillSection)) failures.push("dispatch: opening Book Load must not mark OCR converted before create");
if (!hasScopedOcrLoadLookup(ocrService)) failures.push("dispatch: OCR finalize must validate active same-company load ownership");
if (!/items\/:id\/finalize/.test(ocrRoutes)) failures.push("dispatch: OCR finalize route must be mounted");

// Anchors: hop leaves still say Hop / accounting hop in sub
const disp = loadMod("dispatch");
for (const id of ["secondary.settlements", "secondary.pre_settlements", "queues.factoring"]) {
  const leaf = disp.leaves.find((l) => l.id === id);
  if (!leaf) {
    failures.push(`dispatch missing ${id}`);
    continue;
  }
  if (!/hop/i.test(String(leaf.sub || ""))) {
    failures.push(`${id} expected hop language in sub (re-check before changing FORBIDDEN)`);
  }
}

const chat = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/chat/DispatchChatPage.tsx"), "utf8");
if (/kind=["']load["']/.test(chat) || /\bload_id\b/.test(chat)) {
  failures.push("DispatchChatPage now has load drill — remove misc.chat from FORBIDDEN and tag @matrix-built instead");
}

const xfer = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx"),
  "utf8",
);
if (/kind=["']load["']/.test(xfer)) {
  failures.push("EquipmentTransferRequests has load EntityLink — remove from FORBIDDEN");
}

const map = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/dispatch/MapView.tsx"), "utf8");
if (!/load_id/.test(map)) failures.push("MapView must keep load_id focus (MUST_KEEP queues.map)");

const notify = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx"),
  "utf8",
);
if (!/kind=["']load["']/.test(notify)) failures.push("NotifyPreferencesPage must keep kind=load (MUST_KEEP settings.notify)");

const layover = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx"),
  "utf8",
);
if (!/kind=["']load["']/.test(layover)) {
  failures.push("DriverLayoverHistory must keep kind=load (MUST_KEEP misc.layover)");
}

const geo = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/operations/GeofencesPage.tsx"), "utf8");
if (/kind=["']load["']/.test(geo)) {
  failures.push("GeofencesPage has load drill — remove queues.live_map from FORBIDDEN and tag instead");
}

const vendorDetail = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/VendorDetail.tsx"), "utf8");
if (/kind=["']load["']/.test(vendorDetail) || /\bload_id\b/.test(vendorDetail)) {
  failures.push("VendorDetail now has load drill — remove vendors FORBIDDEN leaves and tag instead");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — hop/no-FK load Required DROPs held; map+notify+ocr+layover KEEP`);
