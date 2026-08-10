/**
 * MATRIX-LIVE-RAD — project Required / Audited / Done for /program/matrix.
 *
 * Required: docs/specs/scoreboard/modules/<module>.required.json
 * Audited: leaf-scoped ledger / GUARD / wave-queue / module-completion (NOT module-wide keyword flood)
 * Done: live_scenario_probe (module-scoped hops) + PROD-VERIFIED ledger + Neon-backed completion PASS
 *
 * % = done ÷ required. Unsure → unaudited. Never invent Done.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";

const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();

const SCOREBOARD_SCRIPT = path.join(REPO_ROOT, "scripts/audit-coverage-scoreboard.mjs");
const PROGRAM_SCOREBOARD_JSON = path.join(REPO_ROOT, "docs/audit/program-scoreboard.json");
const LEDGER_MD = path.join(REPO_ROOT, "docs/audit/AUDIT-COVERAGE-LIVE.md");
const GUARD_MD = path.join(REPO_ROOT, "docs/audit/GUARD-WORKORDERS.md");
const WAVE_QUEUE_JSON = path.join(REPO_ROOT, "docs/audit/wave-queue.json");
const RECON_JSON = path.join(REPO_ROOT, "docs/trackers/block-reconciliation-data.json");
const MATRIX_CACHE_MS = 60_000;

export type MatrixCellState = "live" | "built" | "audited" | "unaudited" | "na" | "done";

export type MatrixCell = {
  /** @deprecated use live — kept for API compat; live === done */
  state: MatrixCellState;
  audited: boolean;
  built: boolean;
  live: boolean;
  /** @deprecated alias for live */
  done: boolean;
  auditedReason?: string;
  builtReason?: string;
  liveReason?: string;
  /** @deprecated use builtReason/liveReason */
  doneReason?: string;
};

export type RequiredColumn = { id: string; group: string; label: string };
export type RequiredLeaf = {
  id: string;
  tab: string;
  sub?: string;
  route_hint: string;
  required: string[];
};
export type RequiredMap = {
  module: string;
  entity_default: string;
  columns: RequiredColumn[];
  leaves: RequiredLeaf[];
};

type LedgerRow = {
  num: number;
  module: string;
  layer: string;
  entity: string;
  verdict: string;
  evidence: string;
  status: string;
};

type CompletionItem = {
  id: string;
  title?: string;
  status?: string;
  evidence?: string;
  layers?: string[];
  prod_verified?: boolean;
};

type ProbeSlice = { key: string; holds: boolean; evidence?: string };

const COLUMN_KEYWORDS: Record<string, RegExp> = {
  driver: /\bdrivers?\b/i,
  customer: /\bcustomers?\b/i,
  vendor: /\bvendors?\b/i,
  unit: /\bunits?\b|\bvehicle\b|\btruck\b/i,
  trailer: /\btrailers?\b/i,
  load: /\bloads?\b/i,
  ap_bill: /\bbills?\b|\bap\b|accounts?\s*payable|linked_work_order|bill_payments?/i,
  expense: /\bexpenses?\b|purchase/i,
  gl_je: /\bgl\b|\bjes?\b|journal|posting|coa_roles|chart\s*of\s*accounts|\bcoa\b/i,
  inventory: /\binventory\b|\bparts\b/i,
  liability: /\bliabilit|\bescrow\b|\bfine\b|\bdeduction\b|factoring/i,
  picker_law: /\bpicker\b|\bentitypicker\b|\+\s*add\s*new\b|combobox|creator\s*law|v2\b|VERIFY-2/i,
  qbo_chrome: /\bqbo\b|paritydrawer|box[\s_-]?in[\s_-]?box|calendar|due\s*auto|\+\s*create\b|v1\b|VERIFY-1/i,
  connectivity: /\bconnectivit|\bwiring\b|\bnav→|\broute\b|\bcanonical\b|v3\b|dead[\s_-]?click|VERIFY-3|sync_runs|inbound_mirror/i,
  reverse_link: /\breverse\b|\bboth[\s_-]?way\b|\blinkage\b|entitylink|v4\b|graph\b|VERIFY-4|DOD-C/i,
  "scenario.maintenance": /scenario\.maintenance|\bwork[\s_-]?orders?\b|\bwos?\b|\bmaint\b/i,
  "scenario.insurance": /scenario\.insurance|\binsurance\b|\bclaims?\b/i,
};

/**
 * live_scenario_probe keys → which leaves/columns they prove Done for.
 * MATRIX-WIRE-LIVE-PROBES — accounting/banking/dispatch probes were ignored when only
 * scenario.maintenance|insurance could green Box 3 (all boards stuck at 0%).
 */
const PROBE_DONE_MAP: Record<
  string,
  Array<{ modules: string[]; leafRe: RegExp; cols: string[] }>
> = {
  "scenario.maintenance": [
    { modules: ["maintenance"], leafRe: /./, cols: ["scenario.maintenance"] },
  ],
  "scenario.insurance": [
    { modules: ["insurance"], leafRe: /./, cols: ["scenario.insurance"] },
  ],
  "hop.invoice": [
    {
      modules: ["accounting"],
      leafRe: /^invoices\.|^payments\.|^collections|^customers/,
      cols: ["connectivity", "customer", "gl_je", "qbo_chrome"],
    },
  ],
  "hop.gl": [
    {
      modules: ["accounting"],
      leafRe: /^(je\.|register|transactions|coa|coa_roles|audit_trail|home)/,
      cols: ["gl_je", "connectivity"],
    },
  ],
  "scenario.coa": [
    {
      modules: ["accounting"],
      leafRe: /^coa/,
      cols: ["gl_je", "connectivity", "picker_law"],
    },
  ],
  "scenario.ap": [
    {
      modules: ["accounting"],
      leafRe: /^(bills\.|ap\.|bill_payments|vendors|expenses\.)/,
      cols: ["ap_bill", "vendor", "expense", "connectivity"],
    },
  ],
  "hop.revenue": [
    {
      modules: ["accounting"],
      leafRe: /^(invoices\.|payments\.|factoring)/,
      cols: ["gl_je", "customer", "connectivity"],
    },
  ],
  "scenario.banking": [
    {
      modules: ["banking"],
      leafRe: /./,
      cols: ["connectivity", "gl_je", "expense"],
    },
  ],
  "hop.bank": [
    {
      modules: ["banking"],
      leafRe: /./,
      cols: ["connectivity", "customer"],
    },
  ],
  "hop.book": [
    {
      modules: ["dispatch"],
      leafRe: /book_load|reserve|docs\.ocr|planning\.reserve/,
      cols: ["load", "customer", "connectivity", "picker_law", "qbo_chrome"],
    },
  ],
  "hop.dispatch": [
    {
      modules: ["dispatch"],
      leafRe: /^(home\.|queues\.|planning\.|secondary\.assignments|load\.)/,
      cols: ["load", "driver", "unit", "connectivity", "reverse_link"],
    },
  ],
  "scenario.settlement": [
    {
      modules: ["settlements"],
      leafRe: /./,
      cols: ["driver", "liability", "gl_je", "connectivity"],
    },
  ],
  "scenario.escrow": [
    {
      modules: ["settlements", "accounting", "drivers"],
      leafRe: /escrow/,
      cols: ["liability", "driver", "connectivity"],
    },
  ],
  "scenario.driver_onboarding": [
    { modules: ["drivers"], leafRe: /./, cols: ["driver", "connectivity", "picker_law"] },
  ],
  "scenario.customer": [
    { modules: ["accounting", "dispatch"], leafRe: /customer/, cols: ["customer", "connectivity"] },
  ],
};

let cache: { atMs: number; module: string; payload: ModuleMatrixPayload } | null = null;

export type ModuleMatrixPayload = {
  module: string;
  entity_default: string;
  sample: false;
  generatedAt: string;
  meta: {
    requiredSource: string;
    auditedSources: string[];
    doneSources: string[];
    honesty: string;
    tipSha?: string;
    probeProgress?: number | null;
    reconAsOf?: string | null;
    feedNote?: string;
  };
  columns: RequiredColumn[];
  leaves: Array<{
    id: string;
    tab: string;
    sub?: string;
    route_hint: string;
    required: string[];
    cells: Record<string, MatrixCell>;
  }>;
  metrics: {
    leafCount: number;
    colCount: number;
    requiredCells: number;
    liveCells: number;
    builtCells: number;
    /** @deprecated use liveCells */
    doneCells: number;
    auditedCells: number;
    unauditedCells: number;
    buildQueue: number;
    /** Live % (Box 4) — module certification bar */
    modulePct: number;
    /** @deprecated alias for modulePct */
    livePct: number;
    builtPct: number;
    auditedPct: number;
  };
};

function readJson<T>(p: string): T | null {
  try {
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadRequiredMap(moduleId: string): RequiredMap {
  const rel = `docs/specs/scoreboard/modules/${moduleId}.required.json`;
  const full = path.join(REPO_ROOT, rel);
  const map = readJson<RequiredMap>(full);
  if (!map || !Array.isArray(map.columns) || !Array.isArray(map.leaves)) {
    throw new Error(`Missing or invalid required map: ${rel}`);
  }
  return map;
}

function tipSha(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function reconAsOf(): string | null {
  const j = readJson<{ generated_at?: string; as_of?: string; snapshot_at?: string }>(RECON_JSON);
  return j?.generated_at ?? j?.as_of ?? j?.snapshot_at ?? null;
}

function moduleHay(row: LedgerRow): string {
  return `${row.module} ${row.verdict} ${row.evidence} ${row.status}`;
}

function moduleTouchRe(moduleId: string): RegExp {
  if (moduleId === "safety") {
    return /\bsafety\b|\baccident|\bdvir\b|\bhos\b|\bfine\b|\bescrow\b|\bcargo[\s_-]?claim|\bdamage[\s_-]?report/i;
  }
  if (moduleId === "insurance") {
    return /\binsurance\b|\bpolic(y|ies)\b|\bclaims?\b|\blawsuits?\b|\bcoverage[\s_-]?gap/i;
  }
  if (moduleId === "legal") {
    return /\blegal\b|\bmatters?\b|\bcontracts?\b|\battorney|\btemplates?\b/i;
  }
  if (moduleId === "accounting") {
    return /\baccounting\b|\bbills?\b|\bexpenses?\b|\binvoices?\b|\bjournal|\bcoa\b|\bgl\b|\bfactoring\b|\bescrow\b/i;
  }
  if (moduleId === "banking") {
    return /\bbanking\b|\bbank[\s_-]?txn|\breconcil|\bplaid\b|\bundeposited|\bmatch[\s_-]?categor/i;
  }
  if (moduleId === "dispatch") {
    return /\bdispatch\b|\bloads?\b|\bbook[\s_-]?load|\bassignments?\b/i;
  }
  if (moduleId === "settlements") {
    return /\bsettlements?\b|\bdriver[\s_-]?finance\b|\bcash[\s_-]?advance|\bescrow\b/i;
  }
  if (moduleId === "fuel") {
    return /\bfuel\b|\brelay\b|\bloves\b|\bexpense[\s_-]?mapping/i;
  }
  if (moduleId === "drivers") {
    return /\bdrivers?\b|\bcdl\b|\bpay[\s_-]?rate|\bdeductions?\b|\bapplicants?\b/i;
  }
  if (moduleId === "fleet") {
    return /\bfleet\b|\bunits?\b|\btrailers?\b|\bequipment\b|\bvehicle\b|\btruck\b|\bsamsara\b/i;
  }
  if (moduleId === "customers") {
    return /\bcustomers?\b|\bbroker\b|\bshipper\b|\bfmcsa\b|\bcredit[\s_-]?limit|\bfactoring[\s_-]?config|\bar[\s_-]?aging|\bportal[\s_-]?user/i;
  }
  if (moduleId === "vendors") {
    return /\bvendors?\b|\b1099\b|\bw-9\b|\bbill[\s_-]?pay|\bap\b|\baccounts?\s*payable|\bsafer\b|\bvendor[\s_-]?credit|\bvendor[\s_-]?type/i;
  }
  if (moduleId === "lists") {
    return /\blists?\b|\bcatalogs?\b|\bcatalog[\s_-]?hub|\breference[\s_-]?catalog|\boem[\s_-]?parts|\bnames[\s_-]?master|\bchart[\s_-]?of[\s_-]?accounts|\bposting[\s_-]?template|\bdispatch[\s_-]?flag|\bvoid[\s_-]?cancel/i;
  }
  if (moduleId === "factoring") {
    return /\bfactoring\b|\bfaro\b|\bfactor[\s_-]?recon|\brecourse\b|\bchargeback|\breserve[\s_-]?movement|\badvance|\bbatch\b|\bpacket|\bletter[\s_-]?of[\s_-]?release/i;
  }
  if (moduleId === "reports") {
    return /\breports?\b|\btrial[\s_-]?balance|\bprofit[\s_-]?loss|\bbalance[\s_-]?sheet|\bar[\s_-]?aging|\bap[\s_-]?aging|\bifta\b|\blane[\s_-]?profit|\bdeadhead|\bgeofence[\s_-]?dwell|\bscheduled[\s_-]?report|\bcancellations?\b/i;
  }
  if (moduleId === "inventory") {
    return /\binventory\b|\bparts?[\s_-]?stock|\bpurchases?\b|\bassignments?\b/i;
  }
  if (moduleId === "compliance") {
    return /\bcompliance\b|\bhos\b|\b2290\b|\bproperty[\s_-]?tax|\bfilings?\b/i;
  }
  if (moduleId === "cash-flow") {
    return /\bcash[\s_-]?flow\b|\bforecast\b|\bprojected\b|\bdaily[\s_-]?prediction/i;
  }
  if (moduleId === "home") {
    return /\bhome\b|\bowner[\s_-]?home|\bquick[\s_-]?jump|\bkpi\b|\battention[\s_-]?list/i;
  }
  if (moduleId === "program") {
    return /\bprogram\b|\bmodule[\s_-]?matrix|\bscenario[\s_-]?tracker|\baudit[\s_-]?scoreboard/i;
  }
  if (moduleId === "tasks") {
    return /\btasks?\b|\btask[\s_-]?board|\bdaily[\s_-]?tasks?/i;
  }
  if (moduleId === "form_425") {
    return /\b425c\b|\bform[\s_-]?425|\bexhibits?\b|\bdip\b/i;
  }
  if (moduleId === "finance") {
    return /\bfinance\b|\bamortization\b|\bbreak[\s_-]?even|\bloan[\s_-]?wizard|\bprojections?\b/i;
  }
  if (moduleId === "docs") {
    return /\bdocs?\b|\bdocuments?\b|\bfile[\s_-]?links?\b|\bupload\b/i;
  }
  if (moduleId === "system") {
    return /\bsystem\b|\bqbo[\s_-]?recon|\bqbo[\s_-]?sync|\bclaude[\s_-]?coder/i;
  }
  if (moduleId === "users") {
    return /\busers?\b|\binvite\b|\brole[\s_-]?change|\bidentity\b/i;
  }
  if (moduleId === "help") {
    return /\bhelp\b|\brunbooks?\b|\bguides?\b/i;
  }
  if (moduleId === "driver-hub") {
    return /\bdriver[\s_-]?hub\b|\bdriver[\s_-]?scheduler|\bleave[\s_-]?requests?/i;
  }
  return /maintenance|\bwork[\s_-]?order|\bwos?\b|\bmaint\b/i;
}

function rowTouchesModule(row: LedgerRow, moduleId: string): boolean {
  return new RegExp(`^${moduleId}\\b`, "i").test(row.module.trim());
}

function columnTouches(colId: string, text: string): boolean {
  const re = COLUMN_KEYWORDS[colId];
  if (!re) return false;
  return re.test(text);
}

function isAuditSignalVerdict(verdict: string, status: string): boolean {
  const blob = `${verdict} ${status}`.replace(/\*\*/g, "");
  if (/^SUPERSEDED\b/i.test(status) || /^SUPERSEDED\b/i.test(verdict)) return false;
  return /\b(FAIL|OPEN|FIXED|CODE-VERIFIED|PASS|UNVERIFIED|UNVERIFIABLE|PROD-VERIFIED)\b/i.test(blob);
}

function isProdVerifiedBlob(text: string): boolean {
  return /\bPROD-VERIFIED\b/i.test(text) || /\bprod_verified\s*[:=]\s*true\b/i.test(text);
}

function evidenceIsLiveNeon(text: string): boolean {
  return (
    /\bNeon\b/i.test(text) ||
    /\blucia\b/i.test(text) ||
    /\bLIVE\s+PROOF\b/i.test(text) ||
    /\bLIVE\s+20\d{2}/i.test(text) ||
    /\bhealthz\b/i.test(text)
  );
}

async function loadLedgerRows(): Promise<LedgerRow[]> {
  try {
    const mod = (await import(pathToFileURL(SCOREBOARD_SCRIPT).href)) as {
      parseFindings: (md: string) => LedgerRow[];
    };
    const md = readFileSync(LEDGER_MD, "utf8");
    return mod.parseFindings(md);
  } catch {
    return [];
  }
}

function loadGuardHits(moduleId: string): string[] {
  try {
    const md = readFileSync(GUARD_MD, "utf8");
    const touch = moduleTouchRe(moduleId);
    const hits: string[] = [];
    for (const line of md.split("\n")) {
      if (!/\bOPEN\b/i.test(line) && !/\bFIXED\b/i.test(line) && !/\bDONE\b/i.test(line)) continue;
      if (!touch.test(line)) continue;
      hits.push(line);
    }
    return hits;
  } catch {
    return [];
  }
}

function loadWaveHits(moduleId: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(WAVE_QUEUE_JSON, "utf8")) as {
      waves?: Array<Record<string, unknown>>;
    };
    const modRe = new RegExp(moduleId === "maintenance" ? "maint|maintenance" : moduleId, "i");
    const hits: string[] = [];
    for (const w of parsed.waves ?? []) {
      const modules = Array.isArray(w.modules) ? w.modules.map((m) => String(m)) : [];
      if (!modules.some((m) => modRe.test(m))) continue;
      hits.push(`${w.id ?? ""} ${w.status ?? ""} ${modules.join(" ")} ${JSON.stringify(w.instances ?? [])}`);
    }
    return hits;
  } catch {
    return [];
  }
}

function loadCompletion(moduleId: string): { items: CompletionItem[]; complete: boolean } {
  const p = path.join(REPO_ROOT, `docs/module-completion/${moduleId}.json`);
  const j = readJson<{ items?: CompletionItem[]; complete?: boolean }>(p);
  return { items: Array.isArray(j?.items) ? j!.items! : [], complete: Boolean(j?.complete) };
}

type ModuleProbe = {
  key: string;
  holds: boolean;
  evidence: string;
  source: string;
  progress: number | null;
};

function loadModuleProbes(moduleId: string): { slices: ModuleProbe[]; progress: number | null } {
  const out: ModuleProbe[] = [];
  let progress: number | null = null;
  const board = readJson<{
    live_scenario_probe?: {
      modules?: Record<string, { slices?: ProbeSlice[]; progress?: number }>;
    };
  }>(PROGRAM_SCOREBOARD_JSON);
  const modules = board?.live_scenario_probe?.modules ?? {};

  const alias: Record<string, string[]> = {
    accounting: ["accounting"],
    banking: ["banking"],
    dispatch: ["dispatch"],
    settlements: ["driver-finance", "settlements"],
    drivers: ["drivers"],
    maintenance: ["maintenance"],
    insurance: ["insurance"],
    fuel: ["fuel"],
    safety: ["safety"],
    legal: ["legal"],
    customers: ["customers"],
    vendors: ["vendors"],
  };
  const keys = alias[moduleId] ?? [moduleId];
  for (const k of keys) {
    const block = modules[k];
    if (!block) continue;
    if (typeof block.progress === "number") progress = block.progress;
    for (const slice of block.slices ?? []) {
      if (!slice?.key) continue;
      out.push({
        key: slice.key,
        holds: Boolean(slice.holds),
        evidence: String(slice.evidence ?? ""),
        source: `program-scoreboard live_scenario_probe.modules.${k}`,
        progress,
      });
    }
  }

  for (const mod of ["maintenance", "insurance", moduleId]) {
    const j = readJson<{ live_scenario_probe?: { slices?: ProbeSlice[] } }>(
      path.join(REPO_ROOT, `docs/module-completion/${mod}.json`),
    );
    for (const slice of j?.live_scenario_probe?.slices ?? []) {
      if (!slice?.key) continue;
      if (out.some((s) => s.key === slice.key && s.holds === Boolean(slice.holds))) continue;
      out.push({
        key: slice.key,
        holds: Boolean(slice.holds),
        evidence: String(slice.evidence ?? ""),
        source: `docs/module-completion/${mod}.json live_scenario_probe`,
        progress,
      });
    }
  }
  return { slices: out, progress };
}

/** Leaf ↔ module-completion item — must hit accounting bills/expenses/JE, not only maint/safety. */
function leafMatchesItem(leaf: RequiredLeaf, item: CompletionItem): boolean {
  const title = `${item.id ?? ""} ${item.title ?? ""} ${item.evidence ?? ""}`;
  const route = leaf.route_hint.replace(/\/$/, "") || "/";
  if (route !== "/" && title.includes(route)) return true;
  if (leaf.id && title.toLowerCase().includes(leaf.id.toLowerCase())) return true;

  const id = leaf.id;
  if (id.startsWith("bills.") || id.startsWith("ap.") || id.startsWith("bill_payments")) {
    return /\bbills?\b|\bap\b|bill_payment|accounts?\s*payable/i.test(title);
  }
  if (id.startsWith("expenses.")) return /\bexpenses?\b|purchase/i.test(title);
  if (id.startsWith("invoices.") || id === "payments.receive" || id === "collections") {
    return /\binvoices?\b|\bar\b|receive\s*payment|collections?/i.test(title);
  }
  if (id.startsWith("je.") || id === "register" || id === "transactions" || id === "audit_trail") {
    return /\bjournal|\bjes?\b|\bgl\b|register|posting/i.test(title);
  }
  if (id.startsWith("coa")) return /\bcoa\b|chart\s*of\s*accounts|account\s*role/i.test(title);
  if (id === "vendors") return /\bvendors?\b/i.test(title);
  if (id === "customers") return /\bcustomers?\b/i.test(title);
  if (id === "escrow" || id === "factoring.list" || id === "pre_settlements") {
    return /\bescrow\b|\bfactoring\b|pre[\s_-]?settlement/i.test(title);
  }
  if (
    id.startsWith("home.") ||
    id.startsWith("batches.") ||
    id.startsWith("factors.") ||
    id.startsWith("accounting.") ||
    id === "submit.queue" ||
    id === "banking.entry" ||
    id === "dispatch.queue" ||
    id === "reserves.dashboard" ||
    id === "faro.import"
  ) {
    return /\bfactoring\b|\bfaro\b|\bfactor|\brecourse|\breserve|\badvance|\bbatch|\bpacket/i.test(title);
  }
  if (id === "period_close" || id === "month_close") return /\bperiod|month[\s_-]?close|close\b/i.test(title);
  if (id === "reports") return /\breports?\b|p&l|balance\s*sheet|trial\s*balance/i.test(title);
  if (id === "home") return /\baccounting\b|home|surf|structural/i.test(title);

  // maintenance / safety / others (existing)
  if (id.startsWith("wo.") && /work-?orders?/i.test(title)) return true;
  if (id.startsWith("pm.") && /pm[\s_-]?schedule|pm[\s_-]?auto/i.test(title)) return true;
  if (id.includes("parts") && /parts/i.test(title)) return true;
  if (id.includes("vendor") && /vendors?/i.test(title)) return true;
  if (id.includes("tire") && /tire/i.test(title)) return true;
  if (id.includes("defect") && /defect/i.test(title)) return true;
  if (id.includes("dvir") && /dvir/i.test(title)) return true;
  if (id.includes("inspection") && /inspection/i.test(title)) return true;
  if (id.includes("warranty") && /warranty/i.test(title)) return true;
  if (id.includes("fault") && /fault/i.test(title)) return true;
  if (id.startsWith("accidents.") && /accident/i.test(title)) return true;
  if (id.includes("hos") && /\bhos\b/i.test(title)) return true;
  if (id.includes("fine") && /fine/i.test(title)) return true;
  if (id.includes("meeting") && /meeting|train/i.test(title)) return true;
  if (id.includes("driver_files") && /driver[\s_-]?file|dq\b/i.test(title)) return true;

  // banking / dispatch / fuel / drivers / insurance / legal stems
  const stem = id.split(".")[0];
  if (stem && stem.length >= 3) {
    const stemRe = new RegExp(`\\b${stem.replace(/_/g, "[\\\\s_-]?")}\\b`, "i");
    if (stemRe.test(title)) return true;
  }
  return false;
}

function itemIsAuditedStatus(status: string): boolean {
  const s = status.replace(/\*\*/g, "").trim();
  if (!s || s === "—" || /^OPEN\b/i.test(s)) return false;
  return /\b(PASS|FIXED|CODE-VERIFIED|HOLD)\b/i.test(s);
}

function columnsFromCompletionItem(item: CompletionItem): Set<string> {
  const cols = new Set<string>();
  const blob = `${item.id ?? ""} ${item.title ?? ""} ${item.evidence ?? ""} ${(item.layers ?? []).join(" ")}`;
  const layers = (item.layers ?? []).map((l) => l.toUpperCase());
  if (layers.includes("VERIFY-1") || /VERIFY-1/.test(blob)) cols.add("qbo_chrome");
  if (layers.includes("VERIFY-2") || /VERIFY-2/.test(blob)) cols.add("picker_law");
  if (layers.includes("VERIFY-3") || /VERIFY-3/.test(blob)) cols.add("connectivity");
  if (layers.includes("VERIFY-4") || /VERIFY-4|DOD-C/.test(blob)) cols.add("reverse_link");
  if (layers.includes("VERIFY-6") || /VERIFY-6|DOD-D/.test(blob)) {
    if (/\bbills?\b|\bap\b|bill_payment/i.test(blob)) cols.add("ap_bill");
    if (/\bexpenses?\b|purchase/i.test(blob)) cols.add("expense");
    if (/\bjournal|\bjes?\b|\bgl\b|posting|coa/i.test(blob)) cols.add("gl_je");
    if (/\bescrow\b|\bliabilit|factor/i.test(blob)) cols.add("liability");
    if (/\binventory\b|\bparts\b/i.test(blob)) cols.add("inventory");
  }
  for (const colId of Object.keys(COLUMN_KEYWORDS)) {
    if (columnTouches(colId, blob)) cols.add(colId);
  }
  return cols;
}

function leafTouchesText(leaf: RequiredLeaf, text: string): boolean {
  const hay = text.toLowerCase();
  if (leaf.id && hay.includes(leaf.id.toLowerCase())) return true;
  const route = leaf.route_hint.replace(/\/:[^/]+/g, "").replace(/\/$/, "");
  if (route && route !== "/" && hay.includes(route.toLowerCase())) return true;
  const routeTail = route.split("/").filter(Boolean).slice(-2).join("/");
  if (routeTail && hay.includes(routeTail.toLowerCase())) return true;
  if (leaf.sub) {
    const sub = leaf.sub.toLowerCase().replace(/^\+\s*/, "");
    if (sub.length >= 4 && hay.includes(sub)) return true;
  }
  const stem = leaf.id.split(".")[0];
  if (stem && stem.length >= 4 && new RegExp(`\\b${stem.replace(/_/g, "[\\\\s_-]?")}\\b`, "i").test(text)) {
    return true;
  }
  return false;
}

function cellState(audited: boolean, built: boolean, live: boolean): MatrixCellState {
  if (live) return "live";
  if (built) return "built";
  if (audited) return "audited";
  return "unaudited";
}

function probeDoneReason(
  moduleId: string,
  leaf: RequiredLeaf,
  colId: string,
  probes: ModuleProbe[],
): string | undefined {
  for (const slice of probes) {
    if (!slice.holds) continue;
    const rules = PROBE_DONE_MAP[slice.key];
    if (!rules) {
      // Exact column key match (scenario.maintenance on that column)
      if (slice.key === colId) {
        return `${slice.source}: ${slice.evidence || slice.key}`;
      }
      continue;
    }
    for (const rule of rules) {
      if (!rule.modules.includes(moduleId)) continue;
      if (!rule.leafRe.test(leaf.id)) continue;
      if (!rule.cols.includes(colId)) continue;
      return `${slice.source} ${slice.key}: ${slice.evidence || "holds"}`;
    }
  }
  return undefined;
}

function leafColumnAuditedReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
  leafItems: CompletionItem[],
  guardHits: string[],
  waveHits: string[],
): string | undefined {
  for (const row of ledger) {
    if (!rowTouchesModule(row, moduleId)) continue;
    if (!isAuditSignalVerdict(row.verdict, row.status)) continue;
    const hay = moduleHay(row);
    if (!leafTouchesText(leaf, hay)) continue;
    if (!columnTouches(colId, hay) && !/\bPROD-VERIFIED\b|\bFIXED\b|\bCODE-VERIFIED\b/i.test(hay)) {
      continue;
    }
    if (!columnTouches(colId, hay)) continue;
    return `ledger #${row.num} leaf-scoped ${row.verdict.slice(0, 60)}`;
  }

  for (const item of leafItems) {
    if (!itemIsAuditedStatus(String(item.status ?? ""))) continue;
    const cols = columnsFromCompletionItem(item);
    if (!cols.has(colId)) continue;
    return `module-completion ${item.id ?? "item"} leaf+column`;
  }

  for (const line of guardHits) {
    if (!leafTouchesText(leaf, line)) continue;
    if (!columnTouches(colId, line)) continue;
    return "GUARD-WORKORDERS leaf+column hit";
  }

  for (const line of waveHits) {
    if (!leafTouchesText(leaf, line)) continue;
    if (!columnTouches(colId, line)) continue;
    return `wave-queue leaf+column ${moduleId}`;
  }

  return undefined;
}

function leafColumnBuiltReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  probes: ModuleProbe[],
): string | undefined {
  return probeDoneReason(moduleId, leaf, colId, probes);
}

function leafColumnLiveReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
): string | undefined {
  for (const row of ledger) {
    if (!rowTouchesModule(row, moduleId)) continue;
    const hay = moduleHay(row);
    if (!isProdVerifiedBlob(hay)) continue;
    if (!leafTouchesText(leaf, hay)) continue;
    if (!columnTouches(colId, hay)) continue;
    return `ledger #${row.num} PROD-VERIFIED`;
  }
  return undefined;
}

/** @deprecated use leafColumnBuiltReason + leafColumnLiveReason */
function leafColumnDoneReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
  _leafItems: CompletionItem[],
  probes: ModuleProbe[],
): string | undefined {
  const live = leafColumnLiveReason(leaf, colId, moduleId, ledger);
  if (live) return live;
  return leafColumnBuiltReason(leaf, colId, moduleId, probes);
}

export async function buildModuleMatrix(
  moduleId: string,
  userUuid?: string,
): Promise<ModuleMatrixPayload> {
  const now = Date.now();
  if (cache && cache.module === moduleId && now - cache.atMs < MATRIX_CACHE_MS) {
    return cache.payload;
  }

  const required = loadRequiredMap(moduleId);
  const [ledger, completion, probePack, guardHits, waveHits] = await Promise.all([
    loadLedgerRows(),
    Promise.resolve(loadCompletion(moduleId)),
    Promise.resolve(loadModuleProbes(moduleId)),
    Promise.resolve(loadGuardHits(moduleId)),
    Promise.resolve(loadWaveHits(moduleId)),
  ]);

  let requiredCells = 0;
  let liveCells = 0;
  let builtOnlyCells = 0;
  let auditedCells = 0;
  let unauditedCells = 0;

  const leaves = required.leaves.map((leaf) => {
    const req = new Set(leaf.required);
    const leafItems = completion.items.filter((it) => leafMatchesItem(leaf, it));

    const cells: Record<string, MatrixCell> = {};
    for (const col of required.columns) {
      if (!req.has(col.id)) {
        cells[col.id] = {
          state: "na",
          audited: false,
          built: false,
          live: false,
          done: false,
        };
        continue;
      }
      requiredCells += 1;

      const builtReason = leafColumnBuiltReason(leaf, col.id, moduleId, probePack.slices);
      const liveReason = leafColumnLiveReason(leaf, col.id, moduleId, ledger);
      const built = Boolean(builtReason) || Boolean(liveReason);
      const live = Boolean(liveReason);

      let audited = live || built;
      let auditedReason: string | undefined = liveReason || builtReason;
      if (!audited) {
        auditedReason = leafColumnAuditedReason(
          leaf,
          col.id,
          moduleId,
          ledger,
          leafItems,
          guardHits,
          waveHits,
        );
        audited = Boolean(auditedReason);
      }

      const state = cellState(audited, built, live);
      if (live) liveCells += 1;
      else if (built) builtOnlyCells += 1;
      else if (audited) auditedCells += 1;
      else unauditedCells += 1;

      cells[col.id] = {
        state: live ? "live" : state,
        audited,
        built,
        live,
        done: live,
        ...(auditedReason ? { auditedReason } : {}),
        ...(builtReason ? { builtReason } : {}),
        ...(liveReason ? { liveReason } : {}),
        ...(liveReason || builtReason ? { doneReason: liveReason ?? builtReason } : {}),
      };
    }

    return {
      id: leaf.id,
      tab: leaf.tab,
      ...(leaf.sub ? { sub: leaf.sub } : {}),
      route_hint: leaf.route_hint,
      required: leaf.required,
      cells,
    };
  });

  const builtCells = builtOnlyCells + liveCells;
  const buildQueue = requiredCells - liveCells;
  const livePct = requiredCells === 0 ? 0 : Math.round((liveCells / requiredCells) * 100);
  const builtPct = requiredCells === 0 ? 0 : Math.round((builtCells / requiredCells) * 100);
  const auditedPct =
    requiredCells === 0 ? 0 : Math.round(((liveCells + builtOnlyCells + auditedCells) / requiredCells) * 100);
  const sha = tipSha();
  const recon = reconAsOf();

  const payload: ModuleMatrixPayload = {
    module: required.module,
    entity_default: required.entity_default,
    sample: false,
    generatedAt: new Date().toISOString(),
    meta: {
      requiredSource: `docs/specs/scoreboard/modules/${moduleId}.required.json`,
      auditedSources: [
        "docs/audit/AUDIT-COVERAGE-LIVE.md (leaf×column)",
        "docs/audit/GUARD-WORKORDERS.md (leaf×column)",
        "docs/audit/wave-queue.json (leaf×column)",
        `docs/module-completion/${moduleId}.json (leaf×column via layers/evidence)`,
      ],
      doneSources: [
        "Box 3 Built: request-time Neon live_scenario_probe via scripts/scoreboard-from-live.mjs",
        "Box 4 Live: AUDIT-COVERAGE-LIVE PROD-VERIFIED leaf×column only",
      ],
      honesty:
        "4-box law (2026-08-10). Audited ≠ Built ≠ Live. Built = Neon probe hold. Live = PROD-VERIFIED only. Checklist N/M never greens Built or Live.",
      tipSha: sha,
      probeProgress: probePack.progress,
      reconAsOf: recon,
      feedNote:
        probePack.probeSource === "neon_live"
          ? `Built from request-time Neon probes · Live from PROD-VERIFIED ledger · tip ${sha ?? "n/a"} · probe ${probePack.progress ?? "n/a"}%`
          : `STALE committed probe snapshot for Built — add DATABASE_DIRECT_URL for auto-sync · tip ${sha ?? "n/a"}`,
    },
    columns: required.columns,
    leaves,
    metrics: {
      leafCount: required.leaves.length,
      colCount: required.columns.length,
      requiredCells,
      liveCells,
      builtCells,
      doneCells: liveCells,
      auditedCells,
      unauditedCells,
      buildQueue,
      modulePct: livePct,
      livePct,
      builtPct,
      auditedPct,
    },
  };

  cache = { atMs: now, module: moduleId, payload };
  return payload;
}

const MATRIX_ORDER_JSON = path.join(REPO_ROOT, "docs/specs/scoreboard/matrix-module-order.json");

export type SystemModuleMatrixRow = {
  module: string;
  label: string;
  available: boolean;
  metrics: ModuleMatrixPayload["metrics"];
  probeProgress?: number | null;
  probeSource?: "neon_live" | "committed_stale";
};

export type SystemModuleMatrixPayload = {
  sample: false;
  scope: "system";
  generatedAt: string;
  modules: SystemModuleMatrixRow[];
  system: {
    moduleCount: number;
    modulesAvailable: number;
    requiredCells: number;
    liveCells: number;
    builtCells: number;
    auditedCells: number;
    unauditedCells: number;
    buildQueue: number;
    livePct: number;
    builtPct: number;
    auditedPct: number;
  };
  meta: {
    tipSha?: string;
    orderSource: string;
    honesty: string;
    probeSource?: "neon_live" | "committed_stale";
  };
};

let systemCache: { atMs: number; probeScope: string; payload: SystemModuleMatrixPayload } | null = null;

function emptyModuleMetrics(): ModuleMatrixPayload["metrics"] {
  return {
    leafCount: 0,
    colCount: 0,
    requiredCells: 0,
    liveCells: 0,
    builtCells: 0,
    doneCells: 0,
    auditedCells: 0,
    unauditedCells: 0,
    buildQueue: 0,
    modulePct: 0,
    livePct: 0,
    builtPct: 0,
    auditedPct: 0,
  };
}

function loadMatrixModuleOrder(): Array<{ id: string; label: string }> {
  const doc = readJson<{ modules?: Array<{ id: string; label: string }> }>(MATRIX_ORDER_JSON);
  return doc?.modules ?? [];
}

export async function buildSystemModuleMatrix(userUuid?: string): Promise<SystemModuleMatrixPayload> {
  const now = Date.now();
  const probeScope = userUuid ? "neon_live" : "committed_stale";
  if (systemCache && systemCache.probeScope === probeScope && now - systemCache.atMs < MATRIX_CACHE_MS) {
    return systemCache.payload;
  }

  const order = loadMatrixModuleOrder();
  const modules: SystemModuleMatrixRow[] = [];
  let requiredCells = 0;
  let liveCells = 0;
  let builtCells = 0;
  let auditedCells = 0;
  let unauditedCells = 0;
  let buildQueue = 0;
  let modulesAvailable = 0;
  let probeSource: "neon_live" | "committed_stale" = "committed_stale";

  for (const entry of order) {
    try {
      const board = await buildModuleMatrix(entry.id, userUuid);
      modulesAvailable += 1;
      if (board.meta.probeSource === "neon_live") probeSource = "neon_live";
      modules.push({
        module: entry.id,
        label: entry.label,
        available: true,
        metrics: board.metrics,
        probeProgress: board.meta.probeProgress,
        probeSource: board.meta.probeSource,
      });
      requiredCells += board.metrics.requiredCells;
      liveCells += board.metrics.liveCells;
      builtCells += board.metrics.builtCells;
      auditedCells += board.metrics.auditedCells;
      unauditedCells += board.metrics.unauditedCells;
      buildQueue += board.metrics.buildQueue;
    } catch {
      modules.push({
        module: entry.id,
        label: entry.label,
        available: false,
        metrics: emptyModuleMetrics(),
      });
    }
  }

  const livePct = requiredCells === 0 ? 0 : Math.round((liveCells / requiredCells) * 100);
  const builtPct = requiredCells === 0 ? 0 : Math.round((builtCells / requiredCells) * 100);
  const auditedPct =
    requiredCells === 0 ? 0 : Math.round(((liveCells + auditedCells + (builtCells - liveCells)) / requiredCells) * 100);

  const payload: SystemModuleMatrixPayload = {
    sample: false,
    scope: "system",
    generatedAt: new Date().toISOString(),
    modules,
    system: {
      moduleCount: order.length,
      modulesAvailable,
      requiredCells,
      liveCells,
      builtCells,
      auditedCells,
      unauditedCells,
      buildQueue,
      livePct,
      builtPct,
      auditedPct,
    },
    meta: {
      tipSha: tipSha(),
      orderSource: "docs/specs/scoreboard/matrix-module-order.json",
      honesty:
        "System rollup = sum of all module boards (sidebar order). Live % = Box 4 PROD-VERIFIED cells ÷ Required. Built % includes probe-wired cells not yet live-verified.",
      probeSource,
    },
  };

  systemCache = { atMs: now, probeScope, payload };
  return payload;
}

/** Test helper — clear request cache between assertions. */
export function clearModuleMatrixCache(): void {
  cache = null;
  systemCache = null;
}
