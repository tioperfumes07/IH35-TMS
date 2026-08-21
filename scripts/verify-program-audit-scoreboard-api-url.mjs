#!/usr/bin/env node
/**
 * GUARD: Program Audit Scoreboard contract (PR #4141).
 *
 * Locks:
 * 1) No bare fetch("/api/...") — must use resolveApiUrl
 * 2) No dangerouslySetInnerHTML / __html call sites
 * 3) Guard items use `text` (markdown), never `html`
 * 4) frontend build does NOT run gen:program-scoreboard (CI dirty-tree / security-audit)
 * 5) FE-TSC-RED-ON-TIP-MAIN-4780 — every TOP-LEVEL key of PROGRAM_SCOREBOARD is declared on the
 *    ProgramScoreboard interface, in the same file.
 *
 * (5) exists because #4780 added `live_scenario_probe` to the data object and not to the interface. That is
 * a TS2353 on tip-main — `npx tsc -b` was RED and the commit DEPLOYED TO PROD, because `build-typecheck`
 * never ran during the Actions outage. Every FE lane then inherited an error it could not tell apart from
 * its own; I filtered it out of every typecheck I ran that night, which is exactly how a real error gets
 * missed. The key is generator-written (scripts/scoreboard-from-live.mjs), so the data and its type drift
 * apart silently unless something ties them together. This is that tie.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx";
const DATA = "apps/frontend/src/pages/program/programScoreboard.data.ts";
const FE_PKG = "apps/frontend/package.json";
const LABEL = "verify-program-audit-scoreboard-api-url";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Top-level keys of the PROGRAM_SCOREBOARD object literal, and the property names declared on the
 * ProgramScoreboard interface. Both are read out of the same file, so this cannot pass vacuously if either
 * block is renamed — a missing block is reported, not skipped.
 */
export function scoreboardTypeDrift(dataSrc) {
  const problems = [];

  const ifaceMatch = dataSrc.match(/export interface ProgramScoreboard \{([\s\S]*?)\n\}/);
  if (!ifaceMatch) return ["programScoreboard.data.ts: ProgramScoreboard interface not found — refusing to pass vacuously."];
  // Collect property names at brace-depth 0 of the interface body. A line-anchored regex is WRONG here:
  // this interface packs several properties onto one line ("modules: ModuleRow[]; prod: ProdMetric[]; ..."),
  // so anchoring caught only the first and reported chainMoney/chainReverse/guard as undeclared — the guard
  // failing on correct code. Depth-tracking also stops nested shapes (meta: { generatedAt: ... }) from
  // masking a genuinely missing top-level key.
  const declared = new Set();
  {
    const body = ifaceMatch[1];
    let depth = 0;
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ":" && depth === 0) {
        const before = body.slice(0, i).match(/([a-zA-Z_][a-zA-Z0-9_]*)\??\s*$/);
        if (before) declared.add(before[1]);
      }
    }
  }

  const objMatch = dataSrc.match(/export const PROGRAM_SCOREBOARD: ProgramScoreboard = \{([\s\S]*)\n\};/);
  if (!objMatch) return ["programScoreboard.data.ts: PROGRAM_SCOREBOARD object not found — refusing to pass vacuously."];
  // Top level only: keys at exactly two-space indent inside the literal.
  const present = new Set([...objMatch[1].matchAll(/^  "([^"]+)":/gm)].map((m) => m[1]));
  if (present.size === 0) return ["programScoreboard.data.ts: PROGRAM_SCOREBOARD has no top-level keys — refusing to pass vacuously."];

  for (const key of present) {
    if (!declared.has(key)) {
      problems.push(
        `programScoreboard.data.ts: PROGRAM_SCOREBOARD has top-level key "${key}" but the ProgramScoreboard ` +
          `interface does not declare it. That is a TS2353 and it reddens tsc for every FE lane ` +
          `(FE-TSC-RED-ON-TIP-MAIN-4780).`,
      );
    }
  }
  return problems;
}

export function assertScoreboardContract(sources) {
  const page = sources?.[PAGE] ?? read(PAGE);
  const data = sources?.[DATA] ?? read(DATA);
  const pkg = sources?.[FE_PKG] ?? read(FE_PKG);
  const problems = [];

  if (!/from ["'].*api\/client["']/.test(page) || !/resolveApiUrl/.test(page)) {
    problems.push(`${PAGE}: must import resolveApiUrl from api/client`);
  }
  if (!/fetch\(\s*resolveApiUrl\(\s*["']\/api\/v1\/program\/audit-scoreboard["']\s*\)/.test(page)) {
    problems.push(
      `${PAGE}: audit-scoreboard fetch must use resolveApiUrl("/api/v1/program/audit-scoreboard")`
    );
  }
  if (/fetch\(\s*["']\/api\/v1\/program\/audit-scoreboard["']/.test(page)) {
    problems.push(`${PAGE}: bare fetch("/api/v1/program/audit-scoreboard") is forbidden`);
  }
  if (/dangerouslySetInnerHTML\s*=/.test(page) || /__html\s*:/.test(page)) {
    problems.push(`${PAGE}: dangerouslySetInnerHTML / __html call sites are forbidden — use fmt()`);
  }
  if (/\bg\.html\b/.test(page)) {
    problems.push(`${PAGE}: must read g.text, not g.html`);
  }
  if (!/fmt\(\s*g\.text\s*\)/.test(page)) {
    problems.push(`${PAGE}: must render guard copy via fmt(g.text)`);
  }
  if (/interface GuardItem/.test(data) && /html:\s*string/.test(data)) {
    problems.push(`${DATA}: GuardItem must use text: string, not html`);
  }
  if (/"html"\s*:/.test(data)) {
    problems.push(`${DATA}: guard entries must use "text", never "html"`);
  }
  let build;
  try {
    build = JSON.parse(pkg).scripts?.build ?? "";
  } catch {
    problems.push(`${FE_PKG}: unreadable`);
    return problems;
  }
  if (/gen:program-scoreboard/.test(build)) {
    problems.push(
      `${FE_PKG}: build must not run gen:program-scoreboard (dirties tree → security-audit checkout fails)`
    );
  }
  // §7 palette + datetime false-positive locks (pre-push verify-static on #4141).
  if (/#2563eb|#7c3aed/.test(page)) {
    problems.push(`${PAGE}: §7 forbids blue/purple accent hex (#2563eb / #7c3aed) — use navy/slate tokens`);
  }
  if (/\{sb\.meta\.prodReadAt\}/.test(page)) {
    problems.push(
      `${PAGE}: do not render {sb.meta.prodReadAt} — alias to a non-*At local (datetime guard false positive)`
    );
  }
  if (/fetch\(\s*[`'"]\/api\//.test(page)) {
    problems.push(`${PAGE}: comment/code must not contain fetch("/api/…") literal (raw-fetch guard)`);
  }

  const routeRel = "apps/backend/src/program/audit-scoreboard.routes.ts";
  const route = sources?.[routeRel] ?? (fs.existsSync(path.join(ROOT, routeRel)) ? read(routeRel) : "");
  if (route && !/rateLimit\s*:\s*\{\s*max\s*:/.test(route)) {
    problems.push(`${routeRel}: GET audit-scoreboard must set config.rateLimit (CodeQL missing-rate-limiting)`);
  }
  if (route && !/\/api\/v1\/program\/module-matrix/.test(route)) {
    problems.push(`${routeRel}: MATRIX-LIVE-RAD must register GET /api/v1/program/module-matrix`);
  }
  if (route && /\/api\/v1\/program\/module-matrix/.test(route) && !/buildModuleMatrix/.test(route)) {
    problems.push(`${routeRel}: module-matrix route must call buildModuleMatrix`);
  }

  const matrixPageRel = "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx";
  const matrixPage = sources?.[matrixPageRel] ?? (fs.existsSync(path.join(ROOT, matrixPageRel)) ? read(matrixPageRel) : "");
  const requiredMapsRel = "apps/frontend/src/pages/program/moduleMatrixRequiredMaps.ts";
  const requiredMaps =
    sources?.[requiredMapsRel] ?? (fs.existsSync(path.join(ROOT, requiredMapsRel)) ? read(requiredMapsRel) : "");
  if (matrixPage) {
    if (!/resolveApiUrl\(\s*[`'"]\/api\/v1\/program\/module-matrix/.test(matrixPage)) {
      problems.push(
        `${matrixPageRel}: must fetch live Audited/Done via resolveApiUrl("/api/v1/program/module-matrix…")`,
      );
    }
    if (/const\s+SAMPLE_AD\b/.test(matrixPage)) {
      problems.push(`${matrixPageRel}: SAMPLE_AD theater is forbidden once MATRIX-LIVE-RAD ships`);
    }
    if (!/module-matrix-unavailable-banner/.test(matrixPage)) {
      problems.push(`${matrixPageRel}: must keep the explicit unavailable banner when API fails`);
    }
    if (/showSampleBanner|module-matrix-sample-banner|SAMPLE banner/.test(matrixPage)) {
      problems.push(`${matrixPageRel}: unavailable feed state must not be labeled SAMPLE`);
    }
    if (!/REQUIRED_BY_MODULE/.test(matrixPage) || !/moduleMatrixRequiredMaps/.test(matrixPage)) {
      problems.push(`${matrixPageRel}: must consume REQUIRED_BY_MODULE from moduleMatrixRequiredMaps`);
    }
    if (
      !/safety\.required\.json/.test(requiredMaps) ||
      !/maintenance\.required\.json/.test(requiredMaps) ||
      !/insurance\.required\.json/.test(requiredMaps) ||
      !/legal\.required\.json/.test(requiredMaps) ||
      !/accounting\.required\.json/.test(requiredMaps) ||
      !/banking\.required\.json/.test(requiredMaps) ||
      !/dispatch\.required\.json/.test(requiredMaps) ||
      !/fuel\.required\.json/.test(requiredMaps) ||
      !/drivers\.required\.json/.test(requiredMaps) ||
      !/fleet\.required\.json/.test(requiredMaps) ||
      !/customers\.required\.json/.test(requiredMaps) ||
      !/vendors\.required\.json/.test(requiredMaps) ||
      !/settlements\.required\.json/.test(requiredMaps) ||
      !/lists\.required\.json/.test(requiredMaps) ||
      !/factoring\.required\.json/.test(requiredMaps) ||
      !/reports\.required\.json/.test(requiredMaps) ||
      !/inventory\.required\.json/.test(requiredMaps) ||
      !/compliance\.required\.json/.test(requiredMaps) ||
      !/cash-flow\.required\.json/.test(requiredMaps) ||
      !/home\.required\.json/.test(requiredMaps) ||
      !/program\.required\.json/.test(requiredMaps) ||
      !/tasks\.required\.json/.test(requiredMaps) ||
      !/form_425\.required\.json/.test(requiredMaps) ||
      !/finance\.required\.json/.test(requiredMaps) ||
      !/docs\.required\.json/.test(requiredMaps) ||
      !/system\.required\.json/.test(requiredMaps) ||
      !/users\.required\.json/.test(requiredMaps) ||
      !/help\.required\.json/.test(requiredMaps) ||
      !/driver-hub\.required\.json/.test(requiredMaps)
    ) {
      problems.push(
        `${requiredMapsRel}: must import all live Required maps through fleet/customers/vendors/lists/factoring/reports/inventory/compliance/cash-flow/home/program/tasks/form_425/finance/docs/system/users/help/driver-hub/settlements`,
      );
    }
    if (
      !/module-matrix-module-rail/.test(matrixPage) ||
      (!/module-matrix-pill-safety/.test(matrixPage) &&
        !/module-matrix-pill-\$\{id\}/.test(matrixPage) &&
        !/module-matrix-pill-\$\{m\.id\}/.test(matrixPage)) ||
      (!/module-matrix-pill-insurance/.test(matrixPage) &&
        !/LIVE_MODULES/.test(matrixPage) &&
        !/module-matrix-pill-\$\{m\.id\}/.test(matrixPage))
    ) {
      problems.push(
        `${matrixPageRel}: must expose clickable Safety + Insurance pills on module rail (MATRIX-REQ-SAFETY / MATRIX-REQ-INSURANCE)`,
      );
    }
    if (!/picker_law|qbo_chrome|connectivity|reverse_link/.test(matrixPage)) {
      problems.push(
        `${matrixPageRel}: chrome/wiring columns (picker/QBO/connectivity/reverse) must be named on the board`,
      );
    }
    if (
      !/module-matrix-built-cells-metric/.test(matrixPage) ||
      !/module-matrix-leaf-built-cells/.test(matrixPage)
    ) {
      const boxesRel = "apps/frontend/src/pages/program/moduleMatrixBoxes.tsx";
      const boxesPage =
        sources?.[boxesRel] ?? (fs.existsSync(path.join(ROOT, boxesRel)) ? read(boxesRel) : "");
      const builtMetricOk =
        /module-matrix-built-cells-metric/.test(matrixPage) ||
        /module-matrix-built-cells-metric/.test(boxesPage);
      if (!builtMetricOk || !/module-matrix-leaf-built-cells/.test(matrixPage)) {
        problems.push(
          `${matrixPageRel}: individual module board must show Built cells count + per-leaf Built column (parity with system rollup)`,
        );
      }
    }
    // All-modules system rollup = module-board column set × A·B·L % per cell.
    {
      const sysRel = "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx";
      const boxesRel = "apps/frontend/src/pages/program/moduleMatrixBoxes.tsx";
      const svcRel = "apps/backend/src/program/module-matrix.service.ts";
      const sysPage =
        sources?.[sysRel] ?? (fs.existsSync(path.join(ROOT, sysRel)) ? read(sysRel) : "");
      const boxesPage =
        sources?.[boxesRel] ?? (fs.existsSync(path.join(ROOT, boxesRel)) ? read(boxesRel) : "");
      const svc =
        sources?.[svcRel] ?? (fs.existsSync(path.join(ROOT, svcRel)) ? read(svcRel) : "");
      if (!sysPage) {
        problems.push(`${sysRel}: system rollup view missing`);
      } else {
        if (!/MatrixBoxTracker/.test(sysPage) && !/module-matrix-box-tracker/.test(sysPage)) {
          problems.push(`${sysRel}: All modules must use the same 4-box tracker as module boards`);
        }
        if (!/system-column-board/.test(sysPage) || !/MatrixCell4|AblCell4|cell4/.test(sysPage)) {
          problems.push(
            `${sysRel}: All modules must render union columns like module boards with the same 4-box ✓/●/✕ cells`,
          );
        }
        if (!/PRIORITY_10_MODULE_IDS|priority 10|Priority 10/.test(sysPage)) {
          problems.push(`${sysRel}: All modules must list priority-10 modules first, then the remainder`);
        }
        if (!/module-matrix-system-section-priority-10/.test(sysPage)) {
          problems.push(`${sysRel}: missing Priority 10 section marker (module-matrix-system-section-priority-10)`);
        }
        if (!/module-matrix-system-legend/.test(sysPage) && !/Required · not audited/.test(sysPage)) {
          problems.push(`${sysRel}: must show the same 4-box legend as module boards`);
        }
        if (!/scope=system/.test(sysPage)) {
          problems.push(`${sysRel}: must fetch module-matrix?scope=system`);
        }
      }
      if (boxesPage) {
        if (!/fill · wire-only/.test(boxesPage) || !/live · certified/.test(boxesPage)) {
          problems.push(`${boxesRel}: Box 3/4 tiles must show both percentages side by side`);
        }
        if (!/DualPct/.test(boxesPage)) {
          problems.push(`${boxesRel}: DualPct helper required for Box 3/4 dual percentages`);
        }
        if (
          !/export function honestProgressPct\(count: number, total: number\)/.test(boxesPage) ||
          !/if \(count >= total\) return 100;/.test(boxesPage) ||
          !/Math\.floor\(\(count \/ total\) \* 100\)/.test(boxesPage)
        ) {
          problems.push(
            `${boxesRel}: incomplete exact counts must floor below 100 via honestProgressPct; only count >= total may return 100`,
          );
        }
        if (
          !/fill:\s*honestProgressPct\(counts\.built, counts\.required\)/.test(boxesPage) ||
          !/const pct = honestProgressPct\(t\.count, t\.of\)/.test(boxesPage)
        ) {
          problems.push(
            `${boxesRel}: Box tracker fill and tile percentages must use honestProgressPct beside exact counts`,
          );
        }
        if (/Math\.round\(\(t\.count \/ t\.of\) \* 100\)/.test(boxesPage)) {
          problems.push(`${boxesRel}: rounded tile percentages can paint an incomplete exact count as 100%`);
        }
      }
      if (svc && !/columnAbl/.test(svc)) {
        problems.push(`${svcRel}: buildSystemModuleMatrix must emit columnAbl (A·B·L per column)`);
      }
      if (svc && !/boxAbl/.test(svc)) {
        problems.push(`${svcRel}: system rollup must compute boxAbl / column Abl %`);
      }
    }
  }

  for (const mod of [
    "maintenance",
    "safety",
    "insurance",
    "legal",
    "accounting",
    "banking",
    "dispatch",
    "settlements",
    "fuel",
    "drivers",
    "fleet",
    "customers",
    "vendors",
    "lists",
    "factoring",
    "reports",
    "inventory",
    "compliance",
    "cash-flow",
    "home",
    "program",
    "tasks",
    "form_425",
    "finance",
    "docs",
    "system",
    "users",
    "help",
    "driver-hub",
  ]) {
    const mapRel = `docs/specs/scoreboard/modules/${mod}.required.json`;
    const mapPath = path.join(ROOT, mapRel);
    if (!fs.existsSync(mapPath)) {
      problems.push(`${mapRel}: Required map missing`);
      continue;
    }
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      const ids = new Set((map.columns ?? []).map((c) => c.id));
      for (const need of ["picker_law", "qbo_chrome", "connectivity", "reverse_link"]) {
        if (!ids.has(need)) {
          problems.push(`${mapRel}: must include chrome/wiring column ${need}`);
        }
      }
      if (!Array.isArray(map.leaves) || map.leaves.length < 1) {
        problems.push(`${mapRel}: must list leaves`);
      }
      // MATRIX-REQ-DISPATCH-DEPTH — stub 6-leaf map is mediocre / FAIL. Must mirror real nav.
      if (mod === "dispatch") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 40) {
          problems.push(
            `${mapRel}: Dispatch Required map must have ≥40 leaves (home views + queues + planners + drawer tabs) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "home.overview",
          "home.kanban",
          "home.list",
          "home.round_trips",
          "secondary.book_load",
          "queues.at_risk",
          "queues.detention",
          "queues.border",
          "queues.trip_pairing",
          "planning.driver",
          "planning.truck",
          "planning.loads",
          "planning.calendar",
          "docs.pod",
          "docs.ocr",
          "load.detail",
          "load.drawer.factoring",
          "load.drawer.settlement",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Dispatch leaf ${need} (DispatchSubnav / home views / drawer)`);
          }
        }
      }
      // MATRIX-REQ-FLEET — stub map is FAIL. Must mirror /fleet roster + profiles + modals.
      if (mod === "fleet") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 55) {
          problems.push(
            `${mapRel}: Fleet Required map must have ≥55 leaves (roster + unit/trailer profiles + edit modals + unit detail) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "home.roster",
          "home.create_unit",
          "home.create_trailer",
          "roster.bulk.status",
          "unit.profile.identity",
          "unit.profile.driver_assign",
          "unit.profile.financial_pl",
          "unit.edit.identity",
          "unit.detail.finance_linkage",
          "trailer.profile.identity",
          "trailer.status_change",
          "trailer.edit",
          "transfers.in_progress",
          "map.redirect",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Fleet leaf ${need} (FleetHomePage / profiles / modals)`);
          }
        }
      }
      // MATRIX-REQ-CUSTOMERS — stub map is FAIL. Must mirror Customers list + detail tabs + create surfaces.
      if (mod === "customers") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 18) {
          problems.push(
            `${mapRel}: Customers Required map must have ≥18 leaves (list segments + master-detail tabs + /customers/:id detail) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "home.roster",
          "list.create",
          "list.segment.preferred",
          "list.segment.factored",
          "md.transaction_list",
          "md.coi_requests",
          "detail.profile",
          "detail.billing",
          "detail.billing.record_payment",
          "detail.loads",
          "detail.contacts.create",
          "detail.lanes.create",
          "detail.portal_users",
          "detail.contracts",
          "detail.fmcsa_verify",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Customers leaf ${need} (Customers.tsx / CustomerDetail.tsx)`);
          }
        }
      }
      // MATRIX-REQ-VENDORS — stub map is FAIL. Must mirror Vendors list + VendorDetail tabs/create surfaces.
      if (mod === "vendors") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 30) {
          problems.push(
            `${mapRel}: Vendors Required map must have ≥30 leaves (list segments + master-detail tabs + /vendors/:id detail) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "home.roster",
          "list.create",
          "list.segment.by_category",
          "list.sync",
          "md.transaction_list",
          "md.header.new_transaction",
          "detail.profile",
          "detail.profile.vendor_type_picker",
          "detail.profile.default_expense_account",
          "detail.ap",
          "detail.ap.record_bill_payment",
          "detail.ap.bills",
          "detail.ap.expenses",
          "detail.safer_verify",
          "detail.w9_1099",
          "detail.documents",
          "detail.tasks",
          "detail.inactivate",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Vendors leaf ${need} (Vendors.tsx / VendorDetail.tsx)`);
          }
        }
      }
      // MATRIX-REQ-LISTS — stub map is FAIL. Must mirror DOMAIN_CONFIG live catalogs + hub surfaces.
      if (mod === "lists") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 40) {
          problems.push(
            `${mapRel}: Lists Required map must have ≥40 leaves (hub + domain hubs + catalog list/create surfaces) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "hub.home",
          "hub.names_search",
          "hub.domain.accounting",
          "hub.domain.dispatch",
          "hub.domain.drivers",
          "catalog.accounting.chart_of_accounts.list",
          "catalog.accounting.chart_of_accounts.create",
          "catalog.dispatch.load_types.list",
          "catalog.drivers.pay_rate_templates.create",
          "catalog.maintenance.parts.list",
          "catalog.safety.internal_fine_reasons.list",
          "catalog.reference.us_states.list",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Lists leaf ${need} (AllCatalogsMap / manifest /lists/*)`);
          }
        }
      }
      // MATRIX-REQ-FACTORING — stub map is FAIL. Must mirror real /factoring + cross-module hops.
      if (mod === "factoring") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 12) {
          problems.push(
            `${mapRel}: Factoring Required map must have ≥12 leaves (home tabs + batches + accounting/banking/dispatch hops) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "home.summary",
          "home.reserve_tracker",
          "home.recourse_pipeline",
          "home.chargebacks_fees",
          "home.statements_settings",
          "home.faro_imports",
          "accounting.list",
          "accounting.detail",
          "accounting.factor_recon",
          "dispatch.queue",
          "submit.queue",
          "batches.create",
          "banking.entry",
          "factors.admin",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Factoring leaf ${need} (FactoringHome / manifest / sidebar flyouts)`);
          }
        }
      }
      // MATRIX-REQ-REPORTS — stub map is FAIL. Must mirror /reports* manifest + sub-nav + runners.
      if (mod === "reports") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 45) {
          problems.push(
            `${mapRel}: Reports Required map must have ≥45 leaves (home + hub + dedicated routes + categories + audit + runners) — got ${(map.leaves ?? []).length}`,
          );
        }
        if (map.entity_default !== "USMCA") {
          problems.push(`${mapRel}: entity_default must be USMCA for Reports matrix board`);
        }
        for (const need of [
          "home.reports",
          "home.hub",
          "subnav.run_report",
          "report.trial_balance",
          "report.profit_loss",
          "report.ar_aging",
          "report.settlement_summary",
          "report.lane_profitability",
          "report.fuel_reconciliation",
          "report.cancellations",
          "report.deadhead",
          "report.scheduled",
          "cat.accounting",
          "audit.activity_by_user",
          "runner.dispatch_board",
          "filter.financial",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Reports leaf ${need} (ReportsSubNav / manifest /reports*)`);
          }
        }
      }

      // MATRIX-REQ-INVENTORY — stub map is FAIL. Must mirror /inventory parts · assignments · purchases.
      if (mod === "inventory") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 20) {
          problems.push(
            `${mapRel}: Inventory Required map must have ≥20 leaves (module tabs + parts/create/edit + assignments trail + purchases honest empty) — got ${(map.leaves ?? []).length}`,
          );
        }
        for (const need of [
          "nav.parts_tab",
          "nav.assignments_tab",
          "nav.purchases_tab",
          "parts.roster",
          "parts.create",
          "parts.create.vendor_picker",
          "parts.edit",
          "parts.column.vendor_link",
          "assignments.trail",
          "assignments.wo_link",
          "assignments.unit_link",
          "assignments.vendor_link",
          "assignments.honest_empty",
          "purchases.honest_empty",
          "purchases.crosslink_parts",
          "purchases.crosslink_assignments",
        ]) {
          if (!leafIds.has(need)) {
            problems.push(`${mapRel}: missing Inventory leaf ${need} (InventoryModuleTabs / manifest /inventory*)`);
          }
        }
      }


      // MATRIX-REQ-COMPLIANCE
      if (mod === "compliance") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 15) {
          problems.push(`${mapRel}: Compliance Required map must have ≥15 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of [
          "tab.filings", "tab.overview", "tab.hos_tracker", "tab.hos_viewer", "tab.violations",
          "tab.hos_history", "tab.required_docs", "property_tax.list", "form2290", "hop.safety_hos",
        ]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Compliance leaf ${need}`);
        }
      }


      // MATRIX-REQ-CASH-FLOW
      if (mod === "cash-flow") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: Cash-flow Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of [
          "home", "tab.daily_prediction", "tab.actual_vs_projected", "tab.manual_daily_projections",
          "hop.banking", "hop.reports.cash_flow_statement",
        ]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Cash-flow leaf ${need}`);
        }
      }


      // MATRIX-REQ-HOME
      if (mod === "home") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 15) {
          problems.push(`${mapRel}: Home Required map must have ≥15 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of [
          "route.home", "role.owner", "role.dispatcher", "role.accountant", "surface.kpi_cards",
          "jump.dispatch", "jump.accounting", "jump.banking", "hop.program",
        ]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Home leaf ${need}`);
        }
      }


      // MATRIX-REQ-PROGRAM
      if (mod === "program") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: Program Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["nav.scenario", "nav.matrix", "nav.legacy", "nav.tracker", "nav.modules", "nav.final"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Program leaf ${need}`);
        }
      }


      // MATRIX-REQ-TASKS
      if (mod === "tasks") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: Tasks Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["nav.board", "nav.mine", "nav.calendar", "nav.chat", "nav.report", "board.create"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Tasks leaf ${need}`);
        }
      }


      // MATRIX-REQ-FORM-425C
      if (mod === "form_425") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: Form 425C Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["home", "tab.profile", "tab.qb", "tab.form", "tab.merge", "tab.history", "exhibits", "law.virtual_banks_excluded"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Form 425C leaf ${need}`);
        }
      }


      // MATRIX-REQ-FINANCE
      if (mod === "finance") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 12) {
          problems.push(`${mapRel}: Finance Required map must have ≥12 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["hub", "nav.overview", "nav.statements", "statements.pl", "statements.bs", "nav.loan_wizard", "hop.accounting"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Finance leaf ${need}`);
        }
      }


      // MATRIX-REQ-DOCS
      if (mod === "docs") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: Docs Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["home", "tab.all", "tab.driver", "tab.customer", "upload", "table.entity_link"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Docs leaf ${need}`);
        }
      }


      // MATRIX-REQ-SYSTEM
      if (mod === "system") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 8) {
          problems.push(`${mapRel}: System Required map must have ≥8 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["home", "tab.overview", "tab.qbo_recon", "tab.qbo_sync", "tab.program", "tab.software", "tab.claude_coder", "law.no_tms_qbo_writeback"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing System leaf ${need}`);
        }
      }


      // MATRIX-REQ-USERS
      if (mod === "users") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 5) {
          problems.push(`${mapRel}: Users Required map must have ≥5 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["list", "detail", "create", "role_change"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Users leaf ${need}`);
        }
      }
      // MATRIX-REQ-HELP
      if (mod === "help") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 6) {
          problems.push(`${mapRel}: Help Required map must have ≥6 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["center", "overview", "runbooks", "article", "search"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Help leaf ${need}`);
        }
      }


      // MATRIX-REQ-DRIVER-HUB
      if (mod === "driver-hub") {
        const leafIds = new Set((map.leaves ?? []).map((l) => l.id));
        if ((map.leaves ?? []).length < 6) {
          problems.push(`${mapRel}: Driver-hub Required map must have ≥6 leaves — got ${(map.leaves ?? []).length}`);
        }
        for (const need of ["home", "tab.overview", "tab.scheduler", "tab.leave_requests", "reporting"]) {
          if (!leafIds.has(need)) problems.push(`${mapRel}: missing Driver-hub leaf ${need}`);
        }
      }

    } catch (e) {
      problems.push(`${mapRel}: invalid JSON (${e instanceof Error ? e.message : e})`);
    }
  }

  const matrixSvcRel = "apps/backend/src/program/module-matrix.service.ts";
  const matrixSvc =
    sources?.[matrixSvcRel] ?? (fs.existsSync(path.join(ROOT, matrixSvcRel)) ? read(matrixSvcRel) : "");
  if (matrixSvc) {
    if (!/PROBE_DONE_MAP/.test(matrixSvc) || !/hop\.invoice/.test(matrixSvc) || !/scenario\.ap/.test(matrixSvc)) {
      problems.push(
        `${matrixSvcRel}: MATRIX-WIRE — Done must map live_scenario_probe hops (hop.invoice / scenario.ap) via PROBE_DONE_MAP`,
      );
    }
    if (/buildColumnAuditIndex/.test(matrixSvc)) {
      problems.push(
        `${matrixSvcRel}: forbidden module-wide keyword Audited flood (buildColumnAuditIndex) — use leaf×column only`,
      );
    }
    if (!/block-reconciliation-data\.json/.test(matrixSvc) || !/tipSha|rev-parse/.test(matrixSvc)) {
      problems.push(`${matrixSvcRel}: must surface git tip + recon as-of in matrix meta`);
    }
  }
  if (matrixPage && !/REQUEST-TIME FEED|Audited ≠|leaf×column/.test(matrixPage) && !/REQUEST-TIME FEED/.test(matrixPage)) {
    problems.push(
      `${matrixPageRel}: banner must not overclaim LIVE verify — use REQUEST-TIME FEED honesty`,
    );
  }

  if (
    route &&
    !/module=maintenance\|safety\|insurance\|legal\|accounting\|banking\|dispatch\|settlements\|fuel\|drivers\|fleet\|customers\|vendors\|lists\|factoring\|reports\|inventory\|compliance\|cash-flow\|home\|program\|tasks\|form_425\|finance\|docs\|system\|users\|help\|driver-hub|SUPPORTED.*customers|SUPPORTED.*vendors|SUPPORTED.*fleet|SUPPORTED.*lists|SUPPORTED.*factoring|SUPPORTED.*reports|SUPPORTED.*inventory|SUPPORTED.*compliance|SUPPORTED.*cash-flow|SUPPORTED.*home|SUPPORTED.*program|SUPPORTED.*tasks|SUPPORTED.*form_425|SUPPORTED.*finance|SUPPORTED.*docs|SUPPORTED.*system|SUPPORTED.*users|SUPPORTED.*help|SUPPORTED.*driver-hub|dispatch/.test(
      route,
    )
  ) {
    problems.push(
      `${routeRel}: module-matrix route must allow module=maintenance|safety|insurance|legal|accounting|banking|dispatch|settlements|fuel|drivers|fleet|customers|vendors|lists|factoring|reports|inventory|compliance|cash-flow|home|program|tasks|form_425|finance|docs|system|users|help|driver-hub`,
    );
  }

  const emitRel = "scripts/audit-coverage-scoreboard.mjs";
  const emit = sources?.[emitRel] ?? read(emitRel);
  if (/generatedAt:\s*new Date\(\)\.toISOString\(\)/.test(emit)) {
    problems.push(
      `${emitRel}: generatedAt must not use wall clock — derive from ledger git log %cI (byte-stable emit)`
    );
  }
  if (!/ledgerGitOr\s*\(\s*["']%cI["']/.test(emit) || !/ledgerGitOr\s*\(\s*["']%h["']/.test(emit)) {
    problems.push(
      `${emitRel}: emit meta must call ledgerGitOr("%cI") and ledgerGitOr("%h") for generatedAt/sourceSha`
    );
  }
  if (!/AUDIT-COVERAGE-LIVE\.md/.test(emit)) {
    problems.push(`${emitRel}: ledger path AUDIT-COVERAGE-LIVE.md must drive deterministic meta`);
  }

  // Last synced + recent activity (SCOREBOARD-LASTSYNCED-AND-RECENT-PRS).
  if (!/Last synced/.test(page) || !/data-testid="program-scoreboard-last-synced"/.test(page)) {
    problems.push(`${PAGE}: header must surface Last synced with data-testid program-scoreboard-last-synced`);
  }
  if (!/formatLedgerCt|lastSyncedCt/.test(page)) {
    problems.push(`${PAGE}: Last synced must derive from ledger generatedAt / lastSyncedCt (not wall clock)`);
  }
  if (/Last synced[\s\S]{0,80}new Date\(\)/.test(page) || /Date\.now\(\)/.test(page)) {
    problems.push(`${PAGE}: Last synced must not use wall-clock Date.now()/new Date() as the source`);
  }
  if (!/data-testid="program-scoreboard-recent-activity"/.test(page)) {
    problems.push(`${PAGE}: must render Recent activity panel (last 10 PRs)`);
  }
  if (!/program-scoreboard-recent-source|recentActivitySource/.test(page)) {
    problems.push(`${PAGE}: must surface recentActivitySource so stale ledger cannot pass as live`);
  }
  if (!/program-scoreboard-recent-stale-warning/.test(page)) {
    problems.push(`${PAGE}: must warn when recentActivitySource is ledger_committed`);
  }
  if (/"recentActivity"\s*:/.test(data) || /recentActivity:\s*\[/.test(data)) {
    problems.push(
      `${DATA}: recentActivity must NOT live in the typecheck-gated seed — serve it live from the API`
    );
  }
  if (route) {
    // Require the exact const assignment (anchored capture) — CodeQL rejects bare URL includes()
    // and unanchored host regexes as incomplete sanitization / missing anchors.
    const pullsConst = route.match(
      /const\s+GITHUB_PULLS_URL\s*=\s*"(https:\/\/api\.github\.com\/repos\/tioperfumes07\/IH35-TMS\/pulls\?[^"]*)"/
    );
    if (!pullsConst) {
      problems.push(`${routeRel}: recentActivity must define GITHUB_PULLS_URL to the GitHub pulls API`);
    }
    if (!/loadRecentActivityFromGitHub|GITHUB_PULLS_URL/.test(route)) {
      problems.push(`${routeRel}: must expose loadRecentActivityFromGitHub (live heartbeat)`);
    }
    // PROG-PRFEED-STALE-LEDGER — committed recentActivity must never short-circuit live sources.
    if (
      /readRecentActivityFromLedger[\s\S]{0,400}if\s*\(\s*ledger\.length\s*>\s*0\s*\)[\s\S]{0,200}return\s+ledger/.test(
        route,
      ) &&
      !/readRecentActivityFromGitLog/.test(route)
    ) {
      problems.push(
        `${routeRel}: must not prefer committed ledger recentActivity over live git log / GitHub (PROG-PRFEED-STALE-LEDGER)`,
      );
    }
    if (!/readRecentActivityFromGitLog/.test(route)) {
      problems.push(
        `${routeRel}: must compute recentActivity from request-time git log (not only a committed JSON snapshot)`,
      );
    }
    if (!/recentActivitySource/.test(route)) {
      problems.push(`${routeRel}: must stamp meta.recentActivitySource (git_log|github|ledger_committed)`);
    }
    if (
      /block-reconciliation-data\.json/.test(route) &&
      !/const\s+GITHUB_PULLS_URL\s*=/.test(route)
    ) {
      problems.push(`${routeRel}: must not rely only on stale recon for recentActivity`);
    }
    const cacheMs = (name) => {
      const match = route.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`));
      return match ? Number(match[1].replace(/_/g, "")) : null;
    };
    const recentCacheMs = cacheMs("RECENT_CACHE_MS");
    const scoreboardCacheMs = cacheMs("SCOREBOARD_CACHE_MS");
    if (recentCacheMs == null || recentCacheMs <= 0 || recentCacheMs > 60_000) {
      problems.push(`${routeRel}: must short-cache recentActivity (~60s)`);
    }
    if (scoreboardCacheMs == null || scoreboardCacheMs <= 0 || scoreboardCacheMs > 60_000) {
      problems.push(`${routeRel}: must short-cache scoreboard payload (~60s) like recentActivity`);
    }
    if (!/buildProgramScoreboardLive|loadScoreboardPayload/.test(route)) {
      problems.push(`${routeRel}: must compute scoreboard from ledger live (buildProgramScoreboardLive / loadScoreboardPayload)`);
    }
    if (!/ledger_live/.test(route) || !/committed_fallback/.test(route)) {
      problems.push(`${routeRel}: must label source ledger_live with committed_fallback`);
    }
    if (!/AUDIT-COVERAGE-LIVE\.md/.test(route)) {
      problems.push(`${routeRel}: live scoreboard must read AUDIT-COVERAGE-LIVE.md`);
    }
    // Primary must not be "only read the committed JSON" — allow fallback after live attempt.
    if (
      /readFile\(\s*SCOREBOARD_JSON/.test(route) &&
      !/buildProgramScoreboardLive|loadScoreboardPayload/.test(route)
    ) {
      problems.push(`${routeRel}: committed JSON must not be the only path — compute from ledger first`);
    }
    if (!/formatCt/.test(route) || !/lastSyncedCt/.test(route)) {
      problems.push(`${routeRel}: must compute lastSyncedCt via formatCt(meta.generatedAt)`);
    }
    if (!/GITHUB_LEDGER_COMMITS_URL|loadLedgerCommitMetaFromGitHub/.test(route)) {
      problems.push(
        `${routeRel}: must resolve ledger generatedAt/sourceSha via GitHub commits API (shallow deploy clones lie)`,
      );
    }
    // Shallow clones: must prefer GH ledger meta over local git log (not only on 1970 fallback).
    if (
      /gen\.startsWith\("1970-01-01"\)/.test(route) &&
      !/Prefer GitHub ledger-commit meta ALWAYS|shallow/.test(route)
    ) {
      problems.push(
        `${routeRel}: must not gate GitHub ledger meta on 1970-only — shallow clones return HEAD as ledger sha`,
      );
    }
    if (!/TRACKER_BOT_TOKEN|GITHUB_TOKEN|GH_TOKEN/.test(route)) {
      problems.push(`${routeRel}: must prefer authenticated GitHub token (TRACKER_BOT_TOKEN/GITHUB_TOKEN/GH_TOKEN)`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const matrixPageRel = "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx";
  const requiredMapsRel = "apps/frontend/src/pages/program/moduleMatrixRequiredMaps.ts";
  const live = {
    [PAGE]: read(PAGE),
    [DATA]: read(DATA),
    [FE_PKG]: read(FE_PKG),
    [matrixPageRel]: read(matrixPageRel),
    [requiredMapsRel]: read(requiredMapsRel),
    ["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"]: read("apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"),
    ["apps/backend/src/program/audit-scoreboard.routes.ts"]: read("apps/backend/src/program/audit-scoreboard.routes.ts"),
  };
  const failures = [];
  const expect = (name, mutated, needle) => {
    const problems = assertScoreboardContract(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };
  expect(
    "required-map-omission",
    {
      ...live,
      [requiredMapsRel]: live[requiredMapsRel].replace(
        'import settlementsRequired from "@scoreboard/modules/settlements.required.json";',
        "/* planted missing settlements Required map */",
      ),
    },
    "must import all live Required maps",
  );
  expect(
    "bare-fetch",
    {
      ...live,
      [PAGE]: live[PAGE].replace(
        /fetch\(\s*resolveApiUrl\(\s*["']\/api\/v1\/program\/audit-scoreboard["']\s*\)/,
        'fetch("/api/v1/program/audit-scoreboard"'
      ),
    },
    "bare fetch"
  );
  expect(
    "innerhtml-returns",
    {
      ...live,
      [PAGE]: live[PAGE].replace("fmt(g.text)", "dangerouslySetInnerHTML={{ __html: g.text }}"),
    },
    "dangerouslySetInnerHTML"
  );
  expect(
    "gen-in-build",
    {
      ...live,
      [FE_PKG]: live[FE_PKG].replace(
        '"build": "',
        '"build": "npm run gen:program-scoreboard --prefix ../.. && '
      ),
    },
    "must not run gen:program-scoreboard"
  );
  expect(
    "sample-labeled-unavailable",
    {
      ...live,
      [matrixPageRel]: live[matrixPageRel].replace(
        "module-matrix-unavailable-banner",
        "module-matrix-sample-banner",
      ),
    },
    "must not be labeled SAMPLE",
  );
  expect(
    "recent-cache-too-long",
    {
      ...live,
      ["apps/backend/src/program/audit-scoreboard.routes.ts"]: live["apps/backend/src/program/audit-scoreboard.routes.ts"].replace(
        "const RECENT_CACHE_MS = 3_000",
        "const RECENT_CACHE_MS = 120_000",
      ),
    },
    "must short-cache recentActivity",
  );
  expect(
    "scoreboard-cache-too-long",
    {
      ...live,
      ["apps/backend/src/program/audit-scoreboard.routes.ts"]: live["apps/backend/src/program/audit-scoreboard.routes.ts"].replace(
        "const SCOREBOARD_CACHE_MS = 3_000",
        "const SCOREBOARD_CACHE_MS = 120_000",
      ),
    },
    "must short-cache scoreboard payload",
  );
  expect(
    "incomplete-progress-rounded-to-100",
    {
      ...live,
      ["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"]: live["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"].replace(
        "return Math.floor((count / total) * 100);",
        "return Math.round((count / total) * 100);",
      ),
    },
    "incomplete exact counts must floor below 100",
  );
  expect(
    "built-fill-bypasses-honest-percent",
    {
      ...live,
      ["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"]: live["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"].replace(
        "fill: honestProgressPct(counts.built, counts.required)",
        "fill: Math.round((counts.built / counts.required) * 100)",
      ),
    },
    "Box tracker fill and tile percentages must use honestProgressPct",
  );
  expect(
    "tile-percent-rounded-to-100",
    {
      ...live,
      ["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"]: live["apps/frontend/src/pages/program/moduleMatrixBoxes.tsx"].replace(
        "const pct = honestProgressPct(t.count, t.of);",
        "const pct = Math.round((t.count / t.of) * 100);",
      ),
    },
    "Box tracker fill and tile percentages must use honestProgressPct",
  );
  const liveProblems = assertScoreboardContract(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live clean`);
  process.exit(0);
}

const problems = [...assertScoreboardContract(), ...scoreboardTypeDrift(read(DATA))];
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — resolveApiUrl · no innerHTML · GuardItem.text · build without gen`);
