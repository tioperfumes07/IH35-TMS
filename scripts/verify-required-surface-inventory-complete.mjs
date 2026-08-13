#!/usr/bin/env node
/**
 * REQUIRED-MAP-INCOMPLETE-SURFACES — ratcheting inventory completeness.
 *
 * Fails if a product FE surface (Modal/Drawer/Panel/Wizard/Sheet/Dialog/Flyout/
 * Popover, plus ParityDrawer host pages) is not represented as a leaf in the
 * owning module's docs/specs/scoreboard/modules/<mod>.required.json.
 *
 * Also asserts §B9 link columns exist in columns.shared.json (claim, work_order,
 * accident, policy, settlement, legal_matter, invoice, bank).
 *
 * Usage:
 *   node scripts/verify-required-surface-inventory-complete.mjs
 *   node scripts/verify-required-surface-inventory-complete.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FE = path.join(ROOT, "apps/frontend/src");
const MOD_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");

const REQUIRED_NEW_COLS = [
  "claim",
  "work_order",
  "accident",
  "policy",
  "settlement",
  "legal_matter",
  "invoice",
  "bank",
];

const EXEMPT_STEMS = new Set([
  "ModalCloseButton",
  "ConfirmModal",
  "InvoiceTypeModalBase",
  "StepWizard",
]);

const CLASS_GLOBS = [
  ["modal", /Modal\.tsx$/],
  ["drawer", /Drawer\.tsx$/],
  ["panel", /Panel\.tsx$/],
  ["wizard", /Wizard\.tsx$/],
  ["sheet", /Sheet\.tsx$/],
  ["dialog", /Dialog\.tsx$/],
  ["flyout", /Flyout\.tsx$/],
  ["popover", /Popover\.tsx$/],
];

/** Same path→module heuristics as the inventory expander (keep in sync). */
const PATH_MODULE = [
  [/pages\/dispatch|components\/dispatch|border-crossing|LoadReassign|CancelLoad|PreDispatch|BookLoad|pages\/loads|AbandonmentReport/i, "dispatch"],
  [/pages\/safety|components\/safety|EscrowForfeit|FineConvert|IntegrityAlert|CompanyViolation|AnomalyDetail|AccidentReport/i, "safety"],
  [/pages\/accounting|components\/ap\/|components\/accounting|components\/expenses|PaymentApply|CustomerAdjustment|ExpenseCreate|BillPayment|VendorBill|PrepaidExpense|RecurringBill|NewAccountDrawer|NewClassDrawer|NewServiceDrawer|RecordExpense|VoidReason|ManualJE/i, "accounting"],
  [/pages\/banking|components\/banking|MatchDrawer|CategorizeDrawer|ReconMatch/i, "banking"],
  [/pages\/maintenance|RoadService|TriageModal|components\/maintenance|pages\/work-orders/i, "maintenance"],
  [/pages\/factoring|components\/factoring|BatchWizard|DeactivateFactor/i, "factoring"],
  [/pages\/legal|LeaseToOwn|SendContract|TruckLease|UnifiedContract|components\/legal/i, "legal"],
  [/pages\/lists|CatalogExcel|ItemEditor|AccountingCatalogProfile|InlineCreate|CatalogQuickCreate|NewCustomerDrawer|NewVendorDrawer|components\/catalogs|components\/lists|components\/bulk|components\/allocation|components\/forms|components\/shared|components\/dialogs/i, "lists"],
  [/pages\/drivers|components\/drivers|components\/driver-profile|OnboardingWizard|SendMessage|SuspendConfirm|TerminateConfirm/i, "drivers"],
  [/pages\/customers|components\/customers/i, "customers"],
  [/pages\/vendors|components\/vendors|VendorCreate|VendorLinkage|components\/qbo\/VendorLinkage/i, "vendors"],
  [/pages\/insurance|components\/insurance|PolicyCreate|ClaimCreate/i, "insurance"],
  [/pages\/fuel/i, "fuel"],
  [/pages\/fleet|components\/fleet|components\/vehicle-profile|components\/trailer-profile|EquipmentTransfer/i, "fleet"],
  [/pages\/cash-advances|pages\/liabilities|driver-finance|MarkDisbursed|AdvanceDetail|LiabilityDetail|SendAck/i, "settlements"],
  [/pages\/finance|LoanWizard|LoanApplication/i, "finance"],
  [/pages\/cash-flow/i, "cash-flow"],
  [/pages\/inventory/i, "inventory"],
  [/pages\/compliance|components\/compliance/i, "compliance"],
  [/pages\/docs|components\/documents|EditMetadata|PreviewModal|SoftDelete|VersionHistory/i, "docs"],
  [/pages\/reports|components\/reports/i, "reports"],
  [/pages\/program/i, "program"],
  [/pages\/tasks|components\/tasks/i, "tasks"],
  [/pages\/system|pages\/admin|integrations\/edi|EdiSetup/i, "system"],
  [/pages\/users/i, "users"],
  [/pages\/help|pages\/onboarding\//i, "help"],
  [/pages\/home|pages\/Home|components\/home/i, "home"],
  [/form_425|425c|Form425/i, "form_425"],
  [/driver-hub|DriverHub|pages\/driver\//i, "driver-hub"],
];

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      walkTsx(p, out);
    } else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.") && !ent.name.includes(".stories.")) {
      out.push(p);
    }
  }
  return out;
}

function guessModule(rel) {
  for (const [re, mod] of PATH_MODULE) {
    if (re.test(rel)) return mod;
  }
  return null;
}

function leafId(module, kind, stem) {
  const base = stem.replace(/(Modal|Drawer|Panel|Wizard|Sheet|Dialog|Flyout|Popover)$/, "");
  const slug = base
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${module}.${kind}.${slug}`;
}

function loadRequiredBlob() {
  const byMod = new Map();
  let blob = "";
  for (const f of fs.readdirSync(MOD_DIR).filter((x) => x.endsWith(".required.json"))) {
    const raw = fs.readFileSync(path.join(MOD_DIR, f), "utf8");
    blob += raw.toLowerCase();
    const doc = JSON.parse(raw);
    byMod.set(f.replace(".required.json", ""), doc);
  }
  return { byMod, blob };
}

function inventorySurfaces() {
  const files = walkTsx(FE);
  const rows = [];
  const seen = new Set();
  for (const abs of files) {
    const rel = path.relative(FE, abs).split(path.sep).join("/");
    if (rel.startsWith("components/ui/") || rel.startsWith("components/layout/")) continue;
    const base = path.basename(abs);
    const stem = base.replace(/\.tsx$/, "");
    if (EXEMPT_STEMS.has(stem)) continue;
    if (/WizardStep\d/.test(stem)) continue;

    let kind = null;
    for (const [k, re] of CLASS_GLOBS) {
      if (re.test(base)) {
        kind = k;
        break;
      }
    }
    if (!kind) continue;
    const mod = guessModule(rel);
    if (!mod) continue;
    const id = leafId(mod, kind, stem);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, mod, kind, stem, rel });
  }
  return rows;
}

function assertSharedColumns() {
  const shared = JSON.parse(fs.readFileSync(SHARED, "utf8"));
  const ids = new Set((shared.columns || []).map((c) => c.id));
  const missing = REQUIRED_NEW_COLS.filter((c) => !ids.has(c));
  return missing;
}

function isCovered(row, blob, byMod) {
  if (blob.includes(row.id.toLowerCase())) return true;
  const doc = byMod.get(row.mod);
  if (!doc) return false;
  const slug = row.id.split(".").pop();
  for (const leaf of doc.leaves || []) {
    if (leaf.id === row.id) return true;
    if (leaf.surface_path && leaf.surface_path.replace(/\\/g, "/") === row.rel) return true;
    const hay = `${leaf.id} ${leaf.sub || ""} ${leaf.surface_path || ""}`.toLowerCase();
    if (slug && slug.length > 6 && hay.includes(slug.replace(/_/g, ""))) return true;
    if (row.stem.length > 8 && hay.includes(row.stem.toLowerCase())) return true;
  }
  return false;
}

function run() {
  const errors = [];
  const missingCols = assertSharedColumns();
  if (missingCols.length) {
    errors.push(`columns.shared.json missing §B9 link columns: ${missingCols.join(", ")}`);
  }

  const { byMod, blob } = loadRequiredBlob();
  const rows = inventorySurfaces();
  const uncovered = [];
  for (const row of rows) {
    if (!isCovered(row, blob, byMod)) uncovered.push(row);
  }
  if (uncovered.length) {
    const sample = uncovered
      .slice(0, 25)
      .map((r) => `${r.id} ← ${r.rel}`)
      .join("\n  ");
    errors.push(
      `${uncovered.length}/${rows.length} inventoried surfaces lack a Required leaf (sample):\n  ${sample}`,
    );
  }

  // Every module map must declare the new columns (headers visible on board).
  for (const [mod, doc] of byMod) {
    const colIds = new Set((doc.columns || []).map((c) => c.id));
    const miss = REQUIRED_NEW_COLS.filter((c) => !colIds.has(c));
    if (miss.length) {
      errors.push(`${mod}.required.json missing columns: ${miss.join(", ")}`);
    }
  }

  // Owner 2026-08-12 — Search + range + gear must be Required leaves (CLS-LIST-TOOLBAR).
  const TOOLBAR_LEAF_IDS = [
    "chrome.toolbar_search",
    "chrome.toolbar_range",
    "chrome.toolbar_gear",
  ];
  for (const [mod, doc] of byMod) {
    const leafIds = new Set((doc.leaves || []).map((l) => l.id));
    const missTb = TOOLBAR_LEAF_IDS.filter((id) => !leafIds.has(id));
    if (missTb.length) {
      errors.push(`${mod}.required.json missing toolbar control leaves: ${missTb.join(", ")}`);
    }
  }

  if (errors.length) {
    console.error("verify-required-surface-inventory-complete FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(
    `verify-required-surface-inventory-complete OK — ${rows.length} surfaces covered; §B9 columns + toolbar triad on ${byMod.size} modules`,
  );
}

function selftest() {
  const sharedPath = SHARED;
  const bak = fs.readFileSync(sharedPath, "utf8");
  let failed = false;
  try {
    const doc = JSON.parse(bak);
    doc.columns = (doc.columns || []).filter((c) => c.id !== "claim");
    fs.writeFileSync(sharedPath, JSON.stringify(doc, null, 2) + "\n");
    const r = spawnSyncCheck();
    if (r === 0) {
      console.error("selftest FAIL — expected red after removing claim column");
      failed = true;
    } else {
      console.log("selftest OK — red when claim column removed");
    }
  } finally {
    fs.writeFileSync(sharedPath, bak);
  }
  if (failed) process.exit(1);
  // green on restore
  run();
}

function spawnSyncCheck() {
  try {
    run();
    return 0;
  } catch {
    return 1;
  } finally {
    /* run() exits process on fail — intercept via subprocess in selftest */
  }
}

// selftest must use child process because run() process.exit(1)
import { spawnSync } from "node:child_process";

function selftestChild() {
  const sharedPath = SHARED;
  const bak = fs.readFileSync(sharedPath, "utf8");
  const doc = JSON.parse(bak);
  doc.columns = (doc.columns || []).filter((c) => c.id !== "claim");
  fs.writeFileSync(sharedPath, JSON.stringify(doc, null, 2) + "\n");
  const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  fs.writeFileSync(sharedPath, bak);
  if (red.status === 0) {
    console.error("selftest FAIL — expected nonzero after removing claim");
    process.exit(1);
  }
  console.log("selftest OK — mutation red (removed claim column)");
  const green = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (green.status !== 0) {
    console.error(green.stderr || green.stdout);
    console.error("selftest FAIL — expected green after restore");
    process.exit(1);
  }
  console.log("selftest OK — green on restore");
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftestChild();
} else {
  run();
}
