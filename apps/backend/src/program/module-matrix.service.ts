/**
 * MATRIX-LIVE-RAD — project Required / Audited / Done for /program/matrix.
 *
 * Required: docs/specs/scoreboard/modules/<module>.required.json
 * Audited: leaf-scoped ledger / GUARD / wave-queue / module-completion (NOT module-wide keyword flood)
 * Built (Box 3): auto from @matrix-built tags + wire-sprint-built.json when guard exists on deployed SHA.
 * Live (Box 4): PROD-VERIFIED ledger leaf×column only.
 * Probes: Audited (yellow ●) density signal only — never Built.
 *
 * % = done ÷ required. Unsure → unaudited. Never invent Done.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import {
  accumulateTierBucket,
  assertTierTallyConsistent,
  classifyMatrixCellTier,
  emptyTierBucket,
  finalizeTierMetrics,
  fullyWiredColumnMatches,
  groupLabel,
  mergeTierBuckets,
  sortGroupRollups,
  matrixPct,
  FULLY_WIRED_MATRIX_ITEMS,
  type MatrixCellTier,
  type MatrixGroupRollup,
  type MatrixTierMetrics,
} from "./matrix-metrics-tally.js";
import {
  discoverMatrixBuiltEntries,
  wireSprintBuiltReasonFromEntries,
  type WireSprintBuiltEntry,
} from "./matrix-built-auto.js";

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
const OUTBOX_CLICKED_FILES = [
  "docs/bus/OUTBOX-DEVIN.md",
  "docs/bus/OUTBOX-DEVIN-A.md",
  "docs/bus/OUTBOX-CODEX.md",
  "docs/bus/OUTBOX-CURSOR.md",
];
/** Render buildFilter ignores docs/** — Clicked must read origin/main OUTBOX at request time. */
const GITHUB_OUTBOX_CONTENTS =
  "https://api.github.com/repos/tioperfumes07/IH35-TMS/contents/";
const CLICKED_COL_IDS = new Set([
  "connectivity",
  "reverse_link",
  "picker_law",
  "qbo_chrome",
  "driver",
  "unit",
  "trailer",
  "load",
  "vendor",
  "customer",
  "gl_je",
  "expense",
  "ap_bill",
  "invoice",
  "payment",
  "settlement",
  "bank",
  "factor",
  "escrow",
  "liability",
]);
const CLICKED_EXACT_N = /LIVE PASS\s*[·|-]\s*([1-3])\s+EXACT CELLS?/i;
const MODALISH_LEAF_RE = /create|modal|drawer|wizard|popup|dialog|\bpicker\b/i;

/** Frozen READY excludes money-group cells (QBO books parked). USMCA-only Clicked. */
function isOpsReadyColumn(group: string): boolean {
  return (group || "other") !== "money";
}

function isUsmcaClickedHay(hay: string): boolean {
  const h = hay.replace(/\*\*/g, "");
  if (/\bTRANSP\b/i.test(h) && !/\bUSMCA\b/i.test(h)) return false;
  return /\bUSMCA\b/i.test(h) || /selected-usmca/i.test(h);
}
const GUARD_MD = path.join(REPO_ROOT, "docs/audit/GUARD-WORKORDERS.md");
const WAVE_QUEUE_JSON = path.join(REPO_ROOT, "docs/audit/wave-queue.json");
const RECON_JSON = path.join(REPO_ROOT, "docs/trackers/block-reconciliation-data.json");
/** 3s made every All-modules load re-parse 29 boards + GitHub OUTBOX and miss the 20s FE abort. */
const MATRIX_CACHE_MS = 120_000;

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
  /** Neon/scenario density hold — Audited ● only; must not set built=true */
  probeReason?: string;
  /** Mutually exclusive tier used for ribbon % (required cells only) */
  tier?: MatrixCellTier;
  liveReason?: string;
  /** Closed `leaf:col` / Exact cells allowlist — not keyword fan-out Box 4. */
  closed?: boolean;
  closedReason?: string;
  /** Chrome click — OUTBOX `leaf=module:leaf:col` or ledger LIVE PASS · 1–3 Exact cells. */
  clicked?: boolean;
  clickedReason?: string;
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
    probeSource?: "neon_live" | "committed_stale";
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
    metrics: MatrixTierMetrics & {
    leafCount: number;
    colCount: number;
    /** @deprecated use liveCells */
    doneCells: number;
    /** @deprecated cumulative audited path — use auditedOnlyPct + probeOnlyPct */
    auditedPct: number;
    /** @deprecated use builtOnlyPct — wire-sprint only, excludes live */
    builtPct: number;
    /** Closed `leaf:col` cells — not in exclusive tier tally. */
    closedCells?: number;
    /** Required leaves that look like create/modal/drawer/wizard/popup. */
    modalLeafCount?: number;
    /** Clicked Live cells (not Box 4). */
    clickedCells?: number;
  };
  groupRollups: MatrixGroupRollup[];
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

// ACCT-F5402: scripts/audit-coverage-scoreboard.mjs's own SIDEBAR_ITEM_IDS/MODULE_ALIASES table
// canonicalizes the Banking module's ledger `Module` column to "bank" (both "banking" and "bank"
// alias to `{ id: "bank" }`) — every AUDIT-COVERAGE-LIVE.md row for Banking, from every agent,
// literally starts with "bank" or "bank ·". This service's required.json/matrix moduleId is
// "banking" instead. Before this fix, the `^banking\b` regex below never matched a single one of
// those rows, so the entire Banking module's live evidence was invisible to Box4 Live% — measured
// live 2026-08-17: banking showed livePct=0 despite real PROD-VERIFIED ledger rows dating back to
// 2026-08-02 (rows 431/442/618/661/1077/1078 etc.). Fixed by accepting the ledger's own canonical
// alias as an additional match candidate — additive, widens the matcher, narrows nothing.
const LEDGER_MODULE_ALIASES: Record<string, string[]> = {
  banking: ["bank"],
};

function rowTouchesModule(row: LedgerRow, moduleId: string): boolean {
  const candidates = [moduleId, ...(LEDGER_MODULE_ALIASES[moduleId] ?? [])];
  const trimmed = row.module.trim();
  return candidates.some((id) => new RegExp(`^${id}\\b`, "i").test(trimmed));
}

function columnTouches(colId: string, text: string): boolean {
  const re = COLUMN_KEYWORDS[colId];
  if (!re) return false;
  return re.test(text);
}

/**
 * LIVE-TIER-CREDIT-FROM-SUPERSEDED-ROW: a row can be SUPERSEDED/FAIL as its own verdict while its
 * evidence narrative still mentions "PROD-VERIFIED" in passing (citing a DIFFERENT sub-row's proof,
 * e.g. row #598 = FAIL/SUPERSEDED but its evidence text cites "rows 619/633 PROD-VERIFIED"). That
 * substring must never grant tier credit for row #598 itself — the row is not live evidence, it's a
 * stale citation of proof that lives elsewhere. Shared by both the Audited-tier and Live-tier matchers
 * so neither can be tricked into crediting a superseded row.
 */
function isSupersededRow(row: Pick<LedgerRow, "status" | "verdict">): boolean {
  return /^SUPERSEDED\b/i.test(row.status) || /^SUPERSEDED\b/i.test(row.verdict);
}

function isAuditSignalVerdict(verdict: string, status: string): boolean {
  const blob = `${verdict} ${status}`.replace(/\*\*/g, "");
  if (isSupersededRow({ verdict, status })) return false;
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

let ledgerCache: { atMs: number; rows: LedgerRow[] } | null = null;

async function loadLedgerRows(): Promise<LedgerRow[]> {
  const now = Date.now();
  if (ledgerCache && now - ledgerCache.atMs < MATRIX_CACHE_MS) {
    return ledgerCache.rows;
  }
  // LV-MATRIX-LEDGER-PARSE-SWALLOW-ZEROS-BOX4 — never return [] on parse failure.
  // Empty ledger made Box 4 show "0 of N LIVE" while Box 3 stayed 100% Built from disk
  // @matrix-built tags (looked like Live vanished). Fail closed so /program/matrix errors
  // loudly until AUDIT-COVERAGE-LIVE.md parseFindings succeeds (no duplicate # / bad pipes).
  const mod = (await import(pathToFileURL(SCOREBOARD_SCRIPT).href)) as {
    parseFindings: (md: string) => LedgerRow[];
  };
  const md = readFileSync(LEDGER_MD, "utf8");
  const rows = mod.parseFindings(md);
  ledgerCache = { atMs: now, rows };
  return rows;
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

type ModuleProbePack = {
  slices: ModuleProbe[];
  progress: number | null;
  probeSource: "neon_live" | "committed_stale";
};

function loadModuleProbes(moduleId: string): ModuleProbePack {
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
  return { slices: out, progress, probeSource: "committed_stale" };
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

/**
 * SCOREBOARD-LEDGER-LEAF-MATCH-OVERBROAD: this used to fall back to `leaf.id.split(".")[0]` (the
 * leaf's stem) when none of the specific signals below matched. For the overwhelming majority of
 * leaves that stem IS the module id (e.g. "accounting.panel.detail" -> "accounting"), so the
 * fallback regex degenerated into "does this ledger row's text mention the module name at all" —
 * true for nearly every row in that module. Any PROD-VERIFIED row anywhere in a module (e.g. the
 * expense->GL-chain row #639) could therefore grant Live-tier credit to EVERY leaf in that module
 * needing a loosely-matched column, regardless of whether that row said anything about that leaf.
 * Measured live 2026-08-15: removing this fallback drops system-wide liveCells 906->147 (accounting
 * 158->6) — the true, leaf-specific Live count. This is the same "leafRe:.*" / word-blanket match
 * class HONEST-BUILT-LAUNCH-LAW (2026-08-14) already banned for the Built tier's @matrix-built tags
 * (see isLeafSpecific() above) — this closes the equivalent hole on the ledger-based Audited/Live
 * path, which fed both leafColumnAuditedReason and leafColumnLiveReason via this shared function.
 * No stand-in fallback is needed: a cell that loses its (false) Live/Audited credit here simply
 * reclassifies down to Built (verified above it never reads a plain 0/NA) as long as a real
 * @matrix-built tag or module-completion item still covers it — it does not go unaudited.
 */
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
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Box 4 Live leaf match — HONEST numbers only.
 * Fuzzy stem/sub/route-tail matching (leafTouchesText) inflated Live (~906/3446 from ~26
 * PROD-VERIFIED rows). Live requires the ledger row to name this leaf explicitly
 * (backticks, Leaves: list, leaf_id=, or full route_hint path). Audited Box 2 may still
 * use leafTouchesText. Keep in lockstep with scripts/verify-matrix-live-leaf-explicit.mjs.
 */
export function leafExplicitlyNamedInLiveEvidence(leaf: RequiredLeaf, text: string): boolean {
  const id = leaf.id?.trim();
  if (!id) return false;
  const hay = text;
  if (hay.includes(`\`${id}\``)) return true;
  // Leaves/cells closed form: `card_overage:connectivity` names leaf card_overage.
  if (new RegExp(`\`${escapeRegExp(id)}:[a-z0-9_,.\\-]+\``, "i").test(hay)) return true;
  const idToken = new RegExp(
    `(?:^|[\\s·,;/\\|\\(\\[\\{"'])${escapeRegExp(id)}(?:$|[\\s·,;/\\|\\)\\]\\}"'\\.\`])`,
  );
  if (/\bLeaves?(?:\/cells)?\s*:/i.test(hay) && idToken.test(hay)) return true;
  if (
    new RegExp(
      `\\bleaf(?:_id|Id|\\s*id)?\\s*[:=]\\s*\`?${escapeRegExp(id)}\`?(?:\\b|$)`,
      "i",
    ).test(hay)
  ) {
    return true;
  }
  const route = leaf.route_hint.replace(/\/:[^/]+/g, "").replace(/\/$/, "");
  if (route && route.length >= 6) {
    if (hay.includes(`\`${route}\``)) return true;
    if (new RegExp(`(?:https?:\\/\\/[^\\s\`"]+)?${escapeRegExp(route)}(?:[?#\\s\`"']|$)`).test(hay)) {
      return true;
    }
  }
  return false;
}

/**
 * An evidence row that declares a closed column claim is making an auditable allowlist.
 * Recognized forms (LV-MATRIX-LEAVES-CELLS-ALLOWLIST-BYPASS):
 * - `Exact cell:` / `Exact cells:` / `Exact cells claimed …:` → bare `` `col` `` tokens
 * - `Leaves:` / `Leaves/cells:` → `` `leaf:col` `` / `` `leaf:col1,col2` `` (leaf-scoped)
 *
 * Narrative words elsewhere (including intentional non-claims like "no `driver`") must not
 * broaden Live credit when a closed declaration is present.
 */
export function explicitlyNamedLiveColumns(text: string, leafId?: string): Set<string> | null {
  const hay = String(text ?? "");
  const cols = new Set<string>();
  let closed = false;

  // Exact cell(s) — optional prose between "cells" and ":" (e.g. "Exact cells claimed only where exercised:")
  const exactMatch = hay.match(/\bExact cells?(?:\s+[^=\n|:]*?)?\s*:\s*([^\n|]*?)(?:\.\s|$)/i);
  if (exactMatch?.[1] !== undefined) {
    closed = true;
    for (const match of exactMatch[1].matchAll(/`([a-z][a-z0-9_.-]*)`/gi)) {
      cols.add(match[1].toLowerCase());
    }
  }

  // Leaves / Leaves/cells — `leaf:col` or `leaf:col1,col2` (and bare `leaf` does not declare columns)
  if (/\bLeaves?(?:\/cells)?\s*:/i.test(hay)) {
    const leafScoped = Array.from(
      hay.matchAll(/`([a-z][a-z0-9_.-]*)(?::([a-z0-9_.,\-]+))?`/gi),
    );
    if (leafScoped.some((m) => m[2])) {
      closed = true;
      const want = leafId?.trim().toLowerCase();
      for (const match of leafScoped) {
        const namedLeaf = match[1].toLowerCase();
        const colPart = match[2];
        if (!colPart) continue;
        if (want && namedLeaf !== want) continue;
        for (const col of colPart.split(",")) {
          const c = col.trim().toLowerCase();
          if (c) cols.add(c);
        }
      }
    }
  }

  if (!closed) return null;
  return cols;
}

/**
 * LV-MATRIX-LATER-FAIL-DOES-NOT-SUPERSEDE-OLD-LIVE — a newer FAIL/OPEN row for the same
 * leaf×column invalidates older PROD-VERIFIED Live credit for that cell.
 */
export function leafColumnHasLaterContradictingFail(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
  afterNum: number,
): boolean {
  const col = colId.toLowerCase();
  for (const row of ledger) {
    if (row.num <= afterNum) continue;
    if (!rowTouchesModule(row, moduleId)) continue;
    if (isSupersededRow(row)) continue;
    const hay = moduleHay(row);
    const blob = `${row.verdict} ${row.status} ${hay}`.replace(/\*\*/g, "");
    if (!/\bFAIL\b/i.test(blob)) continue;
    if (!leafExplicitlyNamedInLiveEvidence(leaf, hay)) continue;
    const declared = explicitlyNamedLiveColumns(hay, leaf.id);
    if (declared) {
      if (declared.has(col)) return true;
      continue;
    }
    if (hay.includes(`\`${colId}\``) || hay.includes(`\`${col}\``) || columnTouches(colId, hay)) {
      return true;
    }
  }
  return false;
}

function cellState(audited: boolean, built: boolean, live: boolean): MatrixCellState {
  if (live) return "live";
  if (built) return "built";
  if (audited) return "audited";
  return "unaudited";
}

type WireSprintBuiltEntryLegacy = WireSprintBuiltEntry;

function loadWireSprintBuilt(): WireSprintBuiltEntryLegacy[] {
  return discoverMatrixBuiltEntries(REPO_ROOT);
}

/** Wave-A shipped writers green Box 3 Built when guard file exists on disk (auto + legacy feed). */
function wireSprintBuiltReason(leaf: RequiredLeaf, colId: string, moduleId: string): string | undefined {
  const entries = loadWireSprintBuilt();
  return wireSprintBuiltReasonFromEntries(entries, leaf.id, colId, moduleId, REPO_ROOT);
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

/** Box 3 Built — wire-sprint guard shipped only. Scenario probes never green Built (owner 2026-08-11). */
function leafColumnBuiltReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
): string | undefined {
  return wireSprintBuiltReason(leaf, colId, moduleId);
}

function leafColumnLiveReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
): string | undefined {
  for (const row of ledger) {
    if (!rowTouchesModule(row, moduleId)) continue;
    if (isSupersededRow(row)) continue;
    const hay = moduleHay(row);
    if (!isProdVerifiedBlob(hay)) continue;
    // Explicit leaf only — never stem/sub fan-out (LV-MATRIX-LIVE-KEYWORD-FANOUT).
    if (!leafExplicitlyNamedInLiveEvidence(leaf, hay)) continue;
    const declaredColumns = explicitlyNamedLiveColumns(hay, leaf.id);
    if (declaredColumns && !declaredColumns.has(colId.toLowerCase())) continue;
    if (!declaredColumns && !columnTouches(colId, hay) && !hay.includes(`\`${colId}\``) && !new RegExp(`\\b${escapeRegExp(colId)}\\b`).test(hay)) {
      continue;
    }
    // Newer FAIL for same leaf×column wins over stale Live (LV-MATRIX-LATER-FAIL-DOES-NOT-SUPERSEDE-OLD-LIVE).
    if (leafColumnHasLaterContradictingFail(leaf, colId, moduleId, ledger, row.num)) continue;
    return `ledger #${row.num} PROD-VERIFIED`;
  }
  return undefined;
}

/** Item 12 / Closed column — only explicit `leaf:col` or Exact cells allowlist. */
function leafColumnClosedAllowlistReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
): string | undefined {
  for (const row of ledger) {
    if (!rowTouchesModule(row, moduleId)) continue;
    if (isSupersededRow(row)) continue;
    const hay = moduleHay(row);
    if (!isProdVerifiedBlob(hay)) continue;
    if (!leafExplicitlyNamedInLiveEvidence(leaf, hay)) continue;
    const declaredColumns = explicitlyNamedLiveColumns(hay, leaf.id);
    if (!declaredColumns || !declaredColumns.has(colId.toLowerCase())) continue;
    if (leafColumnHasLaterContradictingFail(leaf, colId, moduleId, ledger, row.num)) continue;
    return `ledger #${row.num} closed \`leaf:col\``;
  }
  return undefined;
}

function isModalishLeaf(leaf: RequiredLeaf): boolean {
  return MODALISH_LEAF_RE.test(`${leaf.id} ${leaf.tab} ${leaf.sub ?? ""} ${leaf.route_hint}`);
}

let clickedOutboxCache: { atMs: number; keys: Set<string> } | null = null;

function githubAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ih35-tms-matrix-clicked",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  for (const raw of [process.env.TRACKER_BOT_TOKEN, process.env.GITHUB_TOKEN, process.env.GH_TOKEN]) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) {
      headers.Authorization = `Bearer ${t}`;
      break;
    }
  }
  return headers;
}

/** Parse credited Clicked keys from one OUTBOX file. Exported for lockstep guards. */
export function parseOutboxClickedKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    if (!/LIVE PASS/i.test(line)) continue;
    if (!isUsmcaClickedHay(line)) continue;
    for (const m of line.matchAll(/leaf=([a-z0-9_-]+):([a-z0-9_.-]+):([a-z0-9_.-]+)/gi)) {
      keys.add(`${m[1]}:${m[2]}:${m[3]}`.toLowerCase());
    }
    const mod = line.match(/\bmodule=([a-z0-9_-]+)/i);
    const leaf = line.match(/\bleaf=([a-z0-9_.-]+)/i);
    if (!mod || !leaf || leaf[1].includes(":")) continue;
    const token = leaf[1];
    const parts = token.split(".");
    const last = parts[parts.length - 1]?.toLowerCase() ?? "";
    const cells = (line.match(/\bcells=([^|]+)/i)?.[1] ?? "").toLowerCase();
    const cols = new Set<string>();
    let leafId = token;
    if (CLICKED_COL_IDS.has(last) && parts.length >= 2) {
      leafId = parts.slice(0, -1).join(".");
      cols.add(last);
    } else {
      if (/reverse/.test(cells) || /reverse/.test(token)) cols.add("reverse_link");
      if (/picker/.test(cells) || /picker/.test(token)) cols.add("picker_law");
      if (/qbo_chrome/.test(cells) || /qbo_chrome/.test(token)) cols.add("qbo_chrome");
      if (/entitylink|connectivity/.test(cells)) cols.add("connectivity");
      if (cols.size === 0) cols.add("connectivity");
    }
    for (const col of cols) {
      keys.add(`${mod[1]}:${leafId}:${col}`.toLowerCase());
    }
  }
  return keys;
}

async function loadOutboxTextFromGithub(rel: string): Promise<string | null> {
  const rawUrl = `https://raw.githubusercontent.com/tioperfumes07/IH35-TMS/main/${rel}`;
  const acRaw = new AbortController();
  const tRaw = setTimeout(() => acRaw.abort(), 8000);
  try {
    const rawRes = await fetch(rawUrl, { signal: acRaw.signal, headers: { "User-Agent": "ih35-tms-matrix-clicked" } });
    if (rawRes.ok) return await rawRes.text();
  } catch {
    /* contents API fallback */
  } finally {
    clearTimeout(tRaw);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const url = `${GITHUB_OUTBOX_CONTENTS}${rel}?ref=main`;
    const res = await fetch(url, { headers: githubAuthHeaders(), signal: ac.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { encoding?: string; content?: string };
    if (body.encoding === "base64" && typeof body.content === "string") {
      return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadOutboxClickedKeys(): Promise<Set<string>> {
  const now = Date.now();
  if (clickedOutboxCache && now - clickedOutboxCache.atMs < MATRIX_CACHE_MS) {
    return clickedOutboxCache.keys;
  }
  const keys = new Set<string>();
  for (const rel of OUTBOX_CLICKED_FILES) {
    const full = path.join(REPO_ROOT, rel);
    if (existsSync(full)) {
      for (const k of parseOutboxClickedKeys(readFileSync(full, "utf8"))) keys.add(k);
    }
  }
  const remote = await Promise.all(OUTBOX_CLICKED_FILES.map((rel) => loadOutboxTextFromGithub(rel)));
  for (const text of remote) {
    if (!text) continue;
    for (const k of parseOutboxClickedKeys(text)) keys.add(k);
  }
  clickedOutboxCache = { atMs: now, keys };
  return keys;
}

/** Clicked ≠ Named. Fan-out rows with 4+ Exact cells do not credit Clicked. */
function leafColumnClickedReason(
  leaf: RequiredLeaf,
  colId: string,
  moduleId: string,
  ledger: LedgerRow[],
  outboxKeys: Set<string>,
): string | undefined {
  const k = `${moduleId}:${leaf.id}:${colId}`.toLowerCase();
  if (outboxKeys.has(k)) return `OUTBOX LIVE PASS ${k}`;
  for (const row of ledger) {
    if (!rowTouchesModule(row, moduleId)) continue;
    if (isSupersededRow(row)) continue;
    const hay = moduleHay(row);
    if (!isProdVerifiedBlob(hay)) continue;
    if (!isUsmcaClickedHay(hay)) continue;
    if (!CLICKED_EXACT_N.test(hay)) continue;
    if (!leafExplicitlyNamedInLiveEvidence(leaf, hay)) continue;
    const declaredColumns = explicitlyNamedLiveColumns(hay, leaf.id);
    if (!declaredColumns || !declaredColumns.has(colId.toLowerCase())) continue;
    if (leafColumnHasLaterContradictingFail(leaf, colId, moduleId, ledger, row.num)) continue;
    return `ledger #${row.num} LIVE PASS 1–3 Exact`;
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
  return leafColumnBuiltReason(leaf, colId, moduleId);
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
  const [ledger, completion, probePack, guardHits, waveHits, outboxClicked] = await Promise.all([
    loadLedgerRows(),
    Promise.resolve(loadCompletion(moduleId)),
    Promise.resolve(loadModuleProbes(moduleId)),
    Promise.resolve(loadGuardHits(moduleId)),
    Promise.resolve(loadWaveHits(moduleId)),
    loadOutboxClickedKeys(),
  ]);

  const moduleBucket = emptyTierBucket();
  const groupBuckets = new Map<string, ReturnType<typeof emptyTierBucket>>();
  const colGroup = new Map(required.columns.map((c) => [c.id, c.group || "other"]));

  const bumpTier = (colId: string, tier: MatrixCellTier) => {
    accumulateTierBucket(moduleBucket, tier);
    if (tier === "na") return;
    const g = colGroup.get(colId) ?? "other";
    if (!groupBuckets.has(g)) groupBuckets.set(g, emptyTierBucket());
    accumulateTierBucket(groupBuckets.get(g)!, tier);
  };

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
          tier: "na",
        };
        continue;
      }

      const builtReason = leafColumnBuiltReason(leaf, col.id, moduleId);
      const liveReason = leafColumnLiveReason(leaf, col.id, moduleId, ledger);
      const closedReason = leafColumnClosedAllowlistReason(leaf, col.id, moduleId, ledger);
      const clickedReason = leafColumnClickedReason(leaf, col.id, moduleId, ledger, outboxClicked);
      const probeReason = probeDoneReason(moduleId, leaf, col.id, probePack.slices);
      const built = Boolean(builtReason) || Boolean(liveReason);
      const live = Boolean(liveReason);
      const closed = Boolean(closedReason);
      const clicked = Boolean(clickedReason);

      let audited = live || built;
      let auditedReason: string | undefined = liveReason || builtReason;
      if (!audited && probeReason) {
        audited = true;
        auditedReason = `probe-hold (Audited only, not Built): ${probeReason}`;
      }
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
      const tier = classifyMatrixCellTier({ required: true, live, built, probeReason, audited });
      bumpTier(col.id, tier);

      cells[col.id] = {
        state: live ? "live" : state,
        audited,
        built,
        live,
        done: live,
        tier,
        ...(auditedReason ? { auditedReason } : {}),
        ...(builtReason ? { builtReason } : {}),
        ...(probeReason ? { probeReason } : {}),
        ...(liveReason ? { liveReason } : {}),
        ...(closed ? { closed: true } : {}),
        ...(closedReason ? { closedReason } : {}),
        ...(clicked ? { clicked: true } : {}),
        ...(clickedReason ? { clickedReason } : {}),
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

  moduleBucket.requiredCells =
    moduleBucket.liveCells +
    moduleBucket.builtOnlyCells +
    moduleBucket.probeOnlyCells +
    moduleBucket.auditedOnlyCells +
    moduleBucket.unauditedCells;
  assertTierTallyConsistent(moduleBucket, moduleId);
  const tierMetrics = finalizeTierMetrics(moduleBucket);
  const groupRollups: MatrixGroupRollup[] = sortGroupRollups(
    [...groupBuckets.entries()].map(([group, bucket]) => {
      bucket.requiredCells = bucket.requiredCells || 0;
      assertTierTallyConsistent(bucket, `${moduleId}:${group}`);
      return { group, label: groupLabel(group), ...finalizeTierMetrics(bucket) };
    }),
  );

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
        "Box 3 Built: AUTO — @matrix-built on scripts/verify-*.mjs + wire-sprint-built.json; guard must exist on deployed SHA",
        "Box 4 Live: AUDIT-COVERAGE-LIVE PROD-VERIFIED with explicit leaf id (no stem/keyword fan-out)",
        "Probe density: live_scenario_probe → Audited ● only (never Built)",
      ],
      honesty:
        "Option A ribbon (2026-08-11). Mutually exclusive tiers: Audited · Probe · Built (wire-sprint) · Live (certified). Sum = Required.",
      tipSha: sha,
      probeProgress: probePack.progress,
      probeSource: probePack.probeSource,
      reconAsOf: recon,
      feedNote:
        probePack.probeSource === "neon_live"
          ? `Built = wire-sprint guards only · Probes → Audited ● · Live = PROD-VERIFIED · tip ${sha ?? "n/a"} · probe density ${probePack.progress ?? "n/a"}%`
          : `Built = wire-sprint guards only (NOT stale probes) · probe snapshot ${probePack.probeSource ?? "n/a"} → Audited ● only · tip ${sha ?? "n/a"}`,
    },
    columns: required.columns,
    leaves,
    groupRollups,
    metrics: {
      leafCount: required.leaves.length,
      colCount: required.columns.length,
      ...tierMetrics,
      doneCells: tierMetrics.liveCells,
      auditedPct: matrixPct(tierMetrics.auditedOnlyCells + tierMetrics.probeOnlyCells, tierMetrics.requiredCells),
      builtPct: tierMetrics.builtOnlyPct,
      closedCells: leaves.reduce((n, lf) => {
        let c = 0;
        for (const col of required.columns) {
          if (lf.cells[col.id]?.closed) c += 1;
        }
        return n + c;
      }, 0),
      modalLeafCount: required.leaves.filter((lf) => isModalishLeaf(lf)).length,
      clickedCells: leaves.reduce((n, lf) => {
        let c = 0;
        for (const col of required.columns) {
          if (lf.cells[col.id]?.clicked) c += 1;
        }
        return n + c;
      }, 0),
    },
  };

  cache = { atMs: now, module: moduleId, payload };
  return payload;
}

const MATRIX_ORDER_JSON = path.join(REPO_ROOT, "docs/specs/scoreboard/matrix-module-order.json");

/** Per-column (or module-total) Box 2/3/4 cumulative fill % — same math as module board tracker. */
export type MatrixAblPct = {
  requiredCells: number;
  /** Box 2 fill: audited+probe+built+live ÷ required */
  auditedPct: number;
  /** Box 3 fill: built+live ÷ required */
  builtPct: number;
  /** Box 4: live ÷ required */
  livePct: number;
};

export type SystemMatrixColumn = {
  id: string;
  label: string;
  group: string;
};

export type SystemModuleMatrixRow = {
  module: string;
  label: string;
  available: boolean;
  metrics: ModuleMatrixPayload["metrics"];
  /** Module-total Box 2 / 3 / 4 % (cumulative fill). */
  boxAbl: MatrixAblPct;
  /** Same A/B/L % per matrix column (union columns; missing = required 0). */
  columnAbl: Record<string, MatrixAblPct>;
  /** Closed `leaf:col` count (not Box 4 fan-out). */
  closedCells: number;
  leafCount: number;
  modalLeafCount: number;
  clickedCells: number;
  frozenOps: number;
  opsClicked: number;
  missOpsClicked: number;
  readyAbl: MatrixAblPct;
  /** Fully-Wired 1–12 4-box rollups (1–11 from Built on mapped cols; 12 from Clicked). */
  fwAbl: Record<string, MatrixAblPct>;
  groupRollups?: MatrixGroupRollup[];
  probeProgress?: number | null;
  probeSource?: "neon_live" | "committed_stale";
};

export type SystemModuleMatrixPayload = {
  sample: false;
  scope: "system";
  generatedAt: string;
  /** Union of all module Required-map columns — same groups as module boards (LINK/MONEY/CHROME/WIRE/PROC). */
  columns: SystemMatrixColumn[];
  modules: SystemModuleMatrixRow[];
  /** Software-total A/B/L % per column (sum across modules). */
  columnAbl: Record<string, MatrixAblPct>;
  /** Summed column-group rollups — same groups as each module board. */
  groupRollups: MatrixGroupRollup[];
  system: MatrixTierMetrics & {
    moduleCount: number;
    modulesAvailable: number;
    /** Box 2 cumulative fill % */
    auditedPct: number;
    /** Box 3 cumulative fill % */
    builtPct: number;
    boxAbl: MatrixAblPct;
    closedCells: number;
    leafCount: number;
    modalLeafCount: number;
    clickedCells: number;
    frozenOps: number;
    opsClicked: number;
    missOpsClicked: number;
    readyAbl: MatrixAblPct;
    fwAbl: Record<string, MatrixAblPct>;
  };
  meta: {
    tipSha?: string;
    orderSource: string;
    honesty: string;
    probeSource?: "neon_live" | "committed_stale";
  };
};

function emptyAbl(): MatrixAblPct {
  return { requiredCells: 0, auditedPct: 0, builtPct: 0, livePct: 0 };
}

function ablFromCounts(required: number, auditedCum: number, builtCum: number, live: number): MatrixAblPct {
  return {
    requiredCells: required,
    auditedPct: matrixPct(auditedCum, required),
    builtPct: matrixPct(builtCum, required),
    livePct: matrixPct(live, required),
  };
}

/** Cumulative Box 2/3/4 % from a projected module board (leaf×column cells). */
function ablMetricsFromBoard(board: ModuleMatrixPayload): {
  boxAbl: MatrixAblPct;
  columnAbl: Record<string, MatrixAblPct>;
  columns: SystemMatrixColumn[];
  columnCounts: Record<string, { req: number; aud: number; bu: number; li: number }>;
  boxCounts: { req: number; aud: number; bu: number; li: number };
  closedCells: number;
  clickedCells: number;
  frozenOps: number;
  opsClicked: number;
  missOpsClicked: number;
  readyAbl: MatrixAblPct;
  fwAbl: Record<string, MatrixAblPct>;
  fwCounts: Record<string, { req: number; aud: number; bu: number; li: number }>;
} {
  type C = { req: number; aud: number; bu: number; li: number; cl: number };
  const byCol = new Map<string, C>();
  let mReq = 0;
  let mAud = 0;
  let mBu = 0;
  let mLi = 0;
  let mClosed = 0;
  let mClicked = 0;
  let opsReq = 0;
  let opsBu = 0;
  let opsClicked = 0;
  const columns: SystemMatrixColumn[] = board.columns.map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group || "other",
  }));
  for (const col of board.columns) {
    byCol.set(col.id, { req: 0, aud: 0, bu: 0, li: 0, cl: 0 });
  }
  for (const leaf of board.leaves) {
    for (const col of board.columns) {
      const cell = leaf.cells?.[col.id];
      if (!cell || cell.tier === "na") continue;
      const bucket = byCol.get(col.id)!;
      bucket.req += 1;
      mReq += 1;
      if (cell.closed) {
        bucket.cl += 1;
        mClosed += 1;
      }
      if (cell.clicked) mClicked += 1;
      const live = Boolean(cell.live);
      const built = Boolean(cell.built) || live;
      const audited = Boolean(cell.audited) || built || cell.tier === "probe";
      if (live) {
        bucket.li += 1;
        bucket.bu += 1;
        bucket.aud += 1;
        mLi += 1;
        mBu += 1;
        mAud += 1;
      } else if (built) {
        bucket.bu += 1;
        bucket.aud += 1;
        mBu += 1;
        mAud += 1;
      } else if (audited) {
        bucket.aud += 1;
        mAud += 1;
      }
      if (isOpsReadyColumn(col.group || "other")) {
        opsReq += 1;
        if (built) opsBu += 1;
        if (cell.clicked) opsClicked += 1;
      }
    }
  }
  const columnAbl: Record<string, MatrixAblPct> = {};
  const columnCounts: Record<string, { req: number; aud: number; bu: number; li: number }> = {};
  for (const [id, c] of byCol.entries()) {
    columnCounts[id] = { req: c.req, aud: c.aud, bu: c.bu, li: c.li };
    columnAbl[id] = ablFromCounts(c.req, c.aud, c.bu, c.li);
  }

  const fwAbl: Record<string, MatrixAblPct> = {};
  const fwCounts: Record<string, { req: number; aud: number; bu: number; li: number }> = {};
  for (const spec of FULLY_WIRED_MATRIX_ITEMS) {
    if (spec.closedAllowlist) {
      fwCounts[spec.id] = { req: mReq, aud: mClicked, bu: 0, li: mClicked };
      fwAbl[spec.id] = ablFromCounts(mReq, mClicked, 0, mClicked);
      continue;
    }
    let req = 0;
    let aud = 0;
    let bu = 0;
    for (const col of board.columns) {
      const group = col.group || "other";
      if (!fullyWiredColumnMatches(spec, col.id, group)) continue;
      const c = byCol.get(col.id);
      if (!c || c.req <= 0) continue;
      req += c.req;
      aud += c.aud;
      bu += c.bu;
    }
    fwCounts[spec.id] = { req, aud, bu, li: 0 };
    fwAbl[spec.id] = ablFromCounts(req, aud, bu, 0);
  }

  return {
    boxAbl: ablFromCounts(mReq, mAud, mBu, mLi),
    columnAbl,
    columns,
    columnCounts,
    boxCounts: { req: mReq, aud: mAud, bu: mBu, li: mLi },
    closedCells: mClosed,
    clickedCells: mClicked,
    frozenOps: opsReq,
    opsClicked,
    missOpsClicked: Math.max(0, opsReq - opsClicked),
    readyAbl: ablFromCounts(
      opsReq,
      opsClicked,
      opsBu,
      opsReq > 0 && opsClicked === opsReq && opsBu === opsReq ? opsReq : 0,
    ),
    fwAbl,
    fwCounts,
  };
}

function addCounts(
  into: { req: number; aud: number; bu: number; li: number },
  from: { req: number; aud: number; bu: number; li: number },
): void {
  into.req += from.req;
  into.aud += from.aud;
  into.bu += from.bu;
  into.li += from.li;
}

let systemCache: { atMs: number; probeScope: string; payload: SystemModuleMatrixPayload } | null = null;

function emptyModuleMetrics(): ModuleMatrixPayload["metrics"] {
  const base = finalizeTierMetrics(emptyTierBucket());
  return {
    leafCount: 0,
    colCount: 0,
    ...base,
    doneCells: 0,
    auditedPct: 0,
    builtPct: 0,
    closedCells: 0,
    modalLeafCount: 0,
    clickedCells: 0,
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

  // Warm ledger + Clicked OUTBOX once — GitHub raw, not 29× Contents API inside the 20s FE abort.
  await loadLedgerRows();
  await loadOutboxClickedKeys();

  const order = loadMatrixModuleOrder();
  const modules: SystemModuleMatrixRow[] = [];
  const systemBucket = emptyTierBucket();
  const groupBuckets = new Map<string, ReturnType<typeof emptyTierBucket>>();
  const colMeta = new Map<string, SystemMatrixColumn>();
  const systemColCounts = new Map<string, { req: number; aud: number; bu: number; li: number }>();
  let modulesAvailable = 0;
  let probeSource: "neon_live" | "committed_stale" = "committed_stale";
  let sysAblCounts = { req: 0, aud: 0, bu: 0, li: 0 };
  let sysClosed = 0;
  let sysClicked = 0;
  let sysLeaves = 0;
  let sysModals = 0;
  let sysFrozenOps = 0;
  let sysOpsClicked = 0;
  const sysFwCounts = new Map<string, { req: number; aud: number; bu: number; li: number }>();
  for (const spec of FULLY_WIRED_MATRIX_ITEMS) {
    sysFwCounts.set(spec.id, { req: 0, aud: 0, bu: 0, li: 0 });
  }

  for (const entry of order) {
    try {
      const board = await buildModuleMatrix(entry.id, userUuid);
      modulesAvailable += 1;
      if (board.meta.probeSource === "neon_live") probeSource = "neon_live";
      const abl = ablMetricsFromBoard(board);
      for (const c of abl.columns) {
        if (!colMeta.has(c.id)) colMeta.set(c.id, c);
        if (!systemColCounts.has(c.id)) systemColCounts.set(c.id, { req: 0, aud: 0, bu: 0, li: 0 });
      }
      for (const [colId, counts] of Object.entries(abl.columnCounts)) {
        addCounts(systemColCounts.get(colId)!, counts);
      }
      addCounts(sysAblCounts, abl.boxCounts);
      sysClosed += abl.closedCells;
      sysClicked += abl.clickedCells;
      sysLeaves += Number(board.metrics.leafCount) || 0;
      sysModals += Number(board.metrics.modalLeafCount) || 0;
      sysFrozenOps += abl.frozenOps;
      sysOpsClicked += abl.opsClicked;
      for (const spec of FULLY_WIRED_MATRIX_ITEMS) {
        const from = abl.fwCounts[spec.id];
        if (!from) continue;
        addCounts(sysFwCounts.get(spec.id)!, from);
      }
      modules.push({
        module: entry.id,
        label: entry.label,
        available: true,
        metrics: board.metrics,
        boxAbl: abl.boxAbl,
        columnAbl: abl.columnAbl,
        closedCells: abl.closedCells,
        leafCount: board.metrics.leafCount,
        modalLeafCount: board.metrics.modalLeafCount ?? 0,
        clickedCells: board.metrics.clickedCells ?? abl.clickedCells,
        frozenOps: abl.frozenOps,
        opsClicked: abl.opsClicked,
        missOpsClicked: abl.missOpsClicked,
        readyAbl: abl.readyAbl,
        fwAbl: abl.fwAbl,
        groupRollups: board.groupRollups,
        probeProgress: board.meta.probeProgress,
        probeSource: board.meta.probeSource,
      });
      mergeTierBuckets(systemBucket, {
        requiredCells: Number(board.metrics.requiredCells) || 0,
        liveCells: Number(board.metrics.liveCells) || 0,
        builtOnlyCells: Number(board.metrics.builtOnlyCells) || 0,
        probeOnlyCells: Number(board.metrics.probeOnlyCells) || 0,
        auditedOnlyCells: Number(board.metrics.auditedOnlyCells) || 0,
        unauditedCells: Number(board.metrics.unauditedCells) || 0,
      });
      for (const g of board.groupRollups ?? []) {
        if (!groupBuckets.has(g.group)) groupBuckets.set(g.group, emptyTierBucket());
        mergeTierBuckets(groupBuckets.get(g.group)!, {
          requiredCells: Number(g.requiredCells) || 0,
          liveCells: Number(g.liveCells) || 0,
          builtOnlyCells: Number(g.builtOnlyCells) || 0,
          probeOnlyCells: Number(g.probeOnlyCells) || 0,
          auditedOnlyCells: Number(g.auditedOnlyCells) || 0,
          unauditedCells: Number(g.unauditedCells) || 0,
        });
      }
    } catch {
      modules.push({
        module: entry.id,
        label: entry.label,
        available: false,
        metrics: emptyModuleMetrics(),
        boxAbl: emptyAbl(),
        columnAbl: {},
        closedCells: 0,
        leafCount: 0,
        modalLeafCount: 0,
        clickedCells: 0,
        frozenOps: 0,
        opsClicked: 0,
        missOpsClicked: 0,
        readyAbl: emptyAbl(),
        fwAbl: {},
        groupRollups: [],
      });
    }
  }

  // Never 503 the whole rollup on a tally drift — recompute required from exclusive tiers.
  systemBucket.requiredCells =
    systemBucket.liveCells +
    systemBucket.builtOnlyCells +
    systemBucket.probeOnlyCells +
    systemBucket.auditedOnlyCells +
    systemBucket.unauditedCells;
  try {
    assertTierTallyConsistent(systemBucket, "system");
  } catch {
    /* requiredCells already reset to exclusive-tier sum */
  }
  const systemMetrics = finalizeTierMetrics(systemBucket);
  const groupRollups: MatrixGroupRollup[] = sortGroupRollups(
    [...groupBuckets.entries()].map(([group, bucket]) => {
      bucket.requiredCells =
        bucket.liveCells +
        bucket.builtOnlyCells +
        bucket.probeOnlyCells +
        bucket.auditedOnlyCells +
        bucket.unauditedCells;
      return { group, label: groupLabel(group), ...finalizeTierMetrics(bucket) };
    }),
  );

  const GROUP_ORDER = ["linkage", "money", "chrome", "wiring", "process", "other"];
  const columns = [...colMeta.values()].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
    return a.id.localeCompare(b.id);
  });
  const columnAbl: Record<string, MatrixAblPct> = {};
  for (const [id, c] of systemColCounts.entries()) {
    columnAbl[id] = ablFromCounts(c.req, c.aud, c.bu, c.li);
  }
  const boxAbl = ablFromCounts(sysAblCounts.req, sysAblCounts.aud, sysAblCounts.bu, sysAblCounts.li);
  const fwAbl: Record<string, MatrixAblPct> = {};
  for (const spec of FULLY_WIRED_MATRIX_ITEMS) {
    const c = sysFwCounts.get(spec.id)!;
    fwAbl[spec.id] = ablFromCounts(c.req, c.aud, c.bu, c.li);
  }

  const payload: SystemModuleMatrixPayload = {
    sample: false,
    scope: "system",
    generatedAt: new Date().toISOString(),
    columns,
    modules,
    columnAbl,
    groupRollups,
    system: {
      moduleCount: order.length,
      modulesAvailable,
      ...systemMetrics,
      auditedPct: boxAbl.auditedPct,
      builtPct: boxAbl.builtPct,
      boxAbl,
      closedCells: sysClosed,
      leafCount: sysLeaves,
      modalLeafCount: sysModals,
      clickedCells: sysClicked,
      frozenOps: sysFrozenOps,
      opsClicked: sysOpsClicked,
      missOpsClicked: Math.max(0, sysFrozenOps - sysOpsClicked),
      readyAbl: ablFromCounts(
        sysFrozenOps,
        sysOpsClicked,
        sysOpsClicked,
        sysFrozenOps > 0 && sysOpsClicked === sysFrozenOps ? sysFrozenOps : 0,
      ),
      fwAbl,
    },
    meta: {
      tipSha: tipSha(),
      orderSource: "docs/specs/scoreboard/matrix-module-order.json",
      honesty:
        "Clicked reads origin/main OUTBOX (GitHub) because Render ignores docs/**. USMCA LIVE PASS. Prefer leaf=module:leafId:col; also credits module= + leaf= + cells=. Box 4 is not launch. TRANSP clicks do not count.",
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
  ledgerCache = null;
  clickedOutboxCache = null;
}
