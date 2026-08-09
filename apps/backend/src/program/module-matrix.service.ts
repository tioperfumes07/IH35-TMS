/**
 * MATRIX-LIVE-RAD — project Required / Audited / Done for /program/matrix.
 *
 * Required: docs/specs/scoreboard/modules/<module>.required.json (committed applicability).
 * Audited: AUDIT-COVERAGE-LIVE + GUARD-WORKORDERS + wave-queue + module-completion (honest heuristics).
 * Done: live_scenario_probe / scenario registry holds only — never invent green.
 *
 * If unsure → unaudited (red). Never fake Done.
 */

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
const MATRIX_CACHE_MS = 60_000;

export type MatrixCellState = "done" | "audited" | "unaudited" | "na";

export type MatrixCell = {
  state: MatrixCellState;
  audited: boolean;
  done: boolean;
  auditedReason?: string;
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
};

type ProbeSlice = { key: string; holds: boolean; evidence?: string };

const COLUMN_KEYWORDS: Record<string, RegExp> = {
  driver: /\bdrivers?\b/i,
  customer: /\bcustomers?\b/i,
  vendor: /\bvendors?\b/i,
  unit: /\bunits?\b|\bvehicle\b|\btruck\b/i,
  trailer: /\btrailers?\b/i,
  load: /\bloads?\b/i,
  ap_bill: /\bbills?\b|\bap\b|accounts?\s*payable|linked_work_order/i,
  expense: /\bexpenses?\b/i,
  gl_je: /\bgl\b|\bjes?\b|journal|posting|coa_roles/i,
  inventory: /\binventory\b|\bparts\b/i,
  liability: /\bliabilit|\bescrow\b|\bfine\b|\bdeduction\b/i,
  picker_law: /\bpicker\b|\bentitypicker\b|\+\s*add\s*new\b|combobox|creator\s*law|v2\b/i,
  qbo_chrome: /\bqbo\b|paritydrawer|box[\s_-]?in[\s_-]?box|calendar|due\s*auto|\+\s*create\b|v1\b/i,
  connectivity: /\bconnectivit|\bwiring\b|\bnav→|\broute\b|\bcanonical\b|v3\b|dead[\s_-]?click/i,
  reverse_link: /\breverse\b|\bboth[\s_-]?way\b|\blinkage\b|entitylink|v4\b|graph\b/i,
  "scenario.maintenance": /scenario\.maintenance|\bwork[\s_-]?orders?\b|\bwos?\b|\bmaint\b/i,
  "scenario.insurance": /scenario\.insurance|\binsurance\b|\bclaims?\b/i,
};

/** Columns that can turn Done green from live_scenario_probe slices (same keys). */
const DONE_PROBE_COLUMNS = new Set(["scenario.maintenance", "scenario.insurance"]);

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
    doneCells: number;
    auditedCells: number;
    unauditedCells: number;
    buildQueue: number;
    modulePct: number;
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
  // maintenance (default)
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
  return /\b(FAIL|OPEN|FIXED|CODE-VERIFIED|PASS|UNVERIFIED|UNVERIFIABLE)\b/i.test(blob);
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
      if (!/\bOPEN\b/i.test(line) && !/\bFIXED\b/i.test(line)) continue;
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
    const modRe =
      moduleId === "safety" ? /safety/i : moduleId === "maintenance" ? /maint/i : new RegExp(moduleId, "i");
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

function loadProbeHolds(): Map<string, { holds: boolean; evidence: string; source: string }> {
  const out = new Map<string, { holds: boolean; evidence: string; source: string }>();
  const board = readJson<{
    live_scenario_probe?: { modules?: Record<string, { slices?: ProbeSlice[] }> };
  }>(PROGRAM_SCOREBOARD_JSON);
  const modules = board?.live_scenario_probe?.modules ?? {};
  for (const [mod, block] of Object.entries(modules)) {
    for (const slice of block.slices ?? []) {
      if (!slice?.key) continue;
      out.set(slice.key, {
        holds: Boolean(slice.holds),
        evidence: String(slice.evidence ?? ""),
        source: `program-scoreboard live_scenario_probe.modules.${mod}`,
      });
    }
  }
  for (const mod of ["maintenance", "insurance"]) {
    const j = readJson<{ live_scenario_probe?: { slices?: ProbeSlice[]; source?: string } }>(
      path.join(REPO_ROOT, `docs/module-completion/${mod}.json`),
    );
    for (const slice of j?.live_scenario_probe?.slices ?? []) {
      if (!slice?.key) continue;
      out.set(slice.key, {
        holds: Boolean(slice.holds),
        evidence: String(slice.evidence ?? ""),
        source: `docs/module-completion/${mod}.json live_scenario_probe`,
      });
    }
  }
  return out;
}

function leafMatchesItem(leaf: RequiredLeaf, item: CompletionItem): boolean {
  const title = String(item.title ?? "");
  const route = leaf.route_hint.replace(/\/$/, "") || "/";
  if (route !== "/" && title.includes(route)) return true;
  if (leaf.id.startsWith("wo.") && /work-?orders?/i.test(title)) return true;
  if (leaf.id.startsWith("pm.") && /pm[\s_-]?schedule|pm[\s_-]?auto/i.test(title)) return true;
  if (leaf.id.includes("parts") && /parts/i.test(title)) return true;
  if (leaf.id.includes("vendor") && /vendors?/i.test(title)) return true;
  if (leaf.id.includes("tire") && /tire/i.test(title)) return true;
  if (leaf.id.includes("defect") && /defect/i.test(title)) return true;
  if (leaf.id.includes("dvir") && /dvir/i.test(title)) return true;
  if (leaf.id.includes("inspection") && /inspection/i.test(title)) return true;
  if (leaf.id.includes("warranty") && /warranty/i.test(title)) return true;
  if (leaf.id.includes("fault") && /fault/i.test(title)) return true;
  if (leaf.id.includes("damage") && /damage/i.test(title)) return true;
  if (leaf.id.includes("driver_reports") && /driver-?reports?/i.test(title)) return true;
  if (leaf.id.includes("road_service") && /road[\s_-]?service/i.test(title)) return true;
  if (leaf.id.includes("in_transit") && /in[\s_-]?transit/i.test(title)) return true;
  if (leaf.id.includes("arriving") && /arriving/i.test(title)) return true;
  if (leaf.id.includes("severe") && /severe/i.test(title)) return true;
  // Safety leaves
  if (leaf.id.startsWith("accidents.") && /accident/i.test(title)) return true;
  if (leaf.id.includes("hos") && /\bhos\b/i.test(title)) return true;
  if (leaf.id.includes("fine") && /fine/i.test(title)) return true;
  if (leaf.id.includes("escrow") && /escrow/i.test(title)) return true;
  if (leaf.id.includes("cargo") && /cargo|claim/i.test(title)) return true;
  if (leaf.id.includes("damage") && /damage/i.test(title)) return true;
  if (leaf.id.includes("meeting") && /meeting|train/i.test(title)) return true;
  if (leaf.id.includes("driver_files") && /driver[\s_-]?file|dq\b/i.test(title)) return true;
  return false;
}

function itemIsAuditedStatus(status: string): boolean {
  const s = status.replace(/\*\*/g, "").trim();
  if (!s || s === "—" || /^OPEN\b/i.test(s)) return false;
  return /\b(PASS|FIXED|CODE-VERIFIED|HOLD)\b/i.test(s);
}

function buildColumnAuditIndex(
  moduleId: string,
  ledger: LedgerRow[],
  guardHits: string[],
  waveHits: string[],
): Map<string, string> {
  const reasons = new Map<string, string>();
  const scenarioKey = `scenario.${moduleId === "safety" ? "insurance" : "maintenance"}`;
  for (const colId of Object.keys(COLUMN_KEYWORDS)) {
    for (const row of ledger) {
      if (!rowTouchesModule(row, moduleId)) continue;
      if (!isAuditSignalVerdict(row.verdict, row.status)) continue;
      const hay = moduleHay(row);
      const isMod = rowTouchesModule(row, moduleId);
      const matches =
        colId === scenarioKey ? isMod || columnTouches(colId, hay) : columnTouches(colId, hay);
      if (!matches) continue;
      if (!reasons.has(colId)) {
        reasons.set(colId, `ledger #${row.num} ${row.verdict.slice(0, 80)}`);
      }
    }
    for (const line of guardHits) {
      const matches = colId === scenarioKey ? true : columnTouches(colId, line);
      if (!matches) continue;
      if (!reasons.has(colId)) reasons.set(colId, "GUARD-WORKORDERS hit");
    }
    for (const line of waveHits) {
      const matches = colId === scenarioKey ? true : columnTouches(colId, line);
      if (!matches) continue;
      if (!reasons.has(colId)) reasons.set(colId, `wave-queue ${moduleId} class`);
    }
  }
  return reasons;
}

function cellState(audited: boolean, done: boolean): MatrixCellState {
  if (done) return "done";
  if (audited) return "audited";
  return "unaudited";
}

export async function buildModuleMatrix(moduleId: string): Promise<ModuleMatrixPayload> {
  const now = Date.now();
  if (cache && cache.module === moduleId && now - cache.atMs < MATRIX_CACHE_MS) {
    return cache.payload;
  }

  const required = loadRequiredMap(moduleId);
  const [ledger, guardHits, waveHits, completion, probes] = await Promise.all([
    loadLedgerRows(),
    Promise.resolve(loadGuardHits(moduleId)),
    Promise.resolve(loadWaveHits(moduleId)),
    Promise.resolve(loadCompletion(moduleId)),
    Promise.resolve(loadProbeHolds()),
  ]);

  const columnAudit = buildColumnAuditIndex(moduleId, ledger, guardHits, waveHits);

  let requiredCells = 0;
  let doneCells = 0;
  let auditedCells = 0;
  let unauditedCells = 0;

  const leaves = required.leaves.map((leaf) => {
    const req = new Set(leaf.required);
    const leafItems = completion.items.filter((it) => leafMatchesItem(leaf, it));
    const leafAuditedByCompletion = leafItems.some((it) => itemIsAuditedStatus(String(it.status ?? "")));
    const leafOpenOnly =
      leafItems.length > 0 && leafItems.every((it) => /^OPEN\b/i.test(String(it.status ?? "").trim()));

    const cells: Record<string, MatrixCell> = {};
    for (const col of required.columns) {
      if (!req.has(col.id)) {
        cells[col.id] = { state: "na", audited: false, done: false };
        continue;
      }
      requiredCells += 1;

      let done = false;
      let doneReason: string | undefined;
      if (DONE_PROBE_COLUMNS.has(col.id)) {
        const probe = probes.get(col.id);
        if (probe?.holds) {
          done = true;
          doneReason = `${probe.source}: ${probe.evidence || "holds"}`;
        }
      }

      let audited = done;
      let auditedReason: string | undefined = done ? doneReason : undefined;

      if (!audited && columnAudit.has(col.id)) {
        audited = true;
        auditedReason = columnAudit.get(col.id);
      }

      if (!audited && leafAuditedByCompletion && !leafOpenOnly) {
        audited = true;
        auditedReason = "module-completion PASS for leaf surface";
      }

      const state = cellState(audited, done);
      if (state === "done") doneCells += 1;
      else if (state === "audited") auditedCells += 1;
      else unauditedCells += 1;

      cells[col.id] = {
        state,
        audited,
        done,
        ...(auditedReason ? { auditedReason } : {}),
        ...(doneReason ? { doneReason } : {}),
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

  const buildQueue = requiredCells - doneCells;
  const modulePct = requiredCells === 0 ? 0 : Math.round((doneCells / requiredCells) * 100);

  const payload: ModuleMatrixPayload = {
    module: required.module,
    entity_default: required.entity_default,
    sample: false,
    generatedAt: new Date().toISOString(),
    meta: {
      requiredSource: `docs/specs/scoreboard/modules/${moduleId}.required.json`,
      auditedSources: [
        "docs/audit/AUDIT-COVERAGE-LIVE.md",
        "docs/audit/GUARD-WORKORDERS.md",
        "docs/audit/wave-queue.json",
        `docs/module-completion/${moduleId}.json`,
      ],
      doneSources: [
        "docs/audit/program-scoreboard.json#live_scenario_probe",
        "docs/module-completion/*/live_scenario_probe",
      ],
      honesty:
        "Done green only when a live_scenario_probe slice holds for that column key. Unsure → unaudited red. Never fake Done.",
    },
    columns: required.columns,
    leaves,
    metrics: {
      leafCount: required.leaves.length,
      colCount: required.columns.length,
      requiredCells,
      doneCells,
      auditedCells,
      unauditedCells,
      buildQueue,
      modulePct,
    },
  };

  cache = { atMs: now, module: moduleId, payload };
  return payload;
}

/** Test helper — clear request cache between assertions. */
export function clearModuleMatrixCache(): void {
  cache = null;
}
