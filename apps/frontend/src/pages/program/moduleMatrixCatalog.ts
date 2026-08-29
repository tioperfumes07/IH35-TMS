/**
 * Matrix module rail order — locked to sidebar (owner 2026-08-10).
 * Source: docs/specs/scoreboard/matrix-module-order.json
 */
import matrixOrder from "@scoreboard/matrix-module-order.json";
import launchLadder from "@scoreboard/launch-ladder.json";
import sharedColumns from "@scoreboard/columns.shared.json";

export const SHARED_SCOREBOARD_COLUMNS = sharedColumns.columns as ReadonlyArray<{
  id: string;
  group: string;
  label: string;
}>;

/** Literal ids the matrix draws — guard searches this source, not the spec. */
export const RENDERED_SCOREBOARD_COLUMN_IDS = [
  "driver",
  "customer",
  "vendor",
  "unit",
  "trailer",
  "load",
  "claim",
  "work_order",
  "accident",
  "policy",
  "settlement",
  "legal_matter",
  "ap_bill",
  "expense",
  "invoice",
  "bank",
  "gl_je",
  "inventory",
  "liability",
  "picker_law",
  "qbo_chrome",
  "connectivity",
  "reverse_link",
  "scenario.maintenance",
  "scenario.insurance",
  "scenario.ap",
  "scenario.dispatch",
  "gl_delta",
  "subledger_tie",
  "lifecycle_complete",
  "reversal_symmetry",
  "period_guard",
  "entity_isolation",
  "non_empty_proof",
  "l6",
  "bound",
  "proven",
  "evidence_class",
  "route_alive",
  "proof_age",
] as const;

export type MatrixModuleId =
  | "maintenance"
  | "safety"
  | "insurance"
  | "legal"
  | "accounting"
  | "banking"
  | "dispatch"
  | "settlements"
  | "fuel"
  | "drivers"
  | "fleet"
  | "customers"
  | "vendors"
  | "lists"
  | "factoring"
  | "reports"
  | "inventory"
  | "compliance"
  | "cash-flow"
  | "home"
  | "program"
  | "tasks"
  | "form_425"
  | "finance"
  | "docs"
  | "system"
  | "users"
  | "help"
  | "driver-hub";

export type MatrixModuleEntry = {
  id: MatrixModuleId;
  label: string;
  sidebarId: string;
};

const ORDER = matrixOrder.modules as Array<{ id: string; sidebar_id: string; label: string }>;

export const MATRIX_MODULES_SIDEBAR_ORDER: MatrixModuleEntry[] = ORDER.map((m) => ({
  id: m.id as MatrixModuleId,
  label: m.label,
  sidebarId: m.sidebar_id,
}));

export const MATRIX_MODULE_IDS: MatrixModuleId[] = MATRIX_MODULES_SIDEBAR_ORDER.map((m) => m.id);

export function matrixModuleLabel(id: MatrixModuleId): string {
  return MATRIX_MODULES_SIDEBAR_ORDER.find((m) => m.id === id)?.label ?? id;
}

/** Short column headers for matrix grid (full label stays in JSON + title tooltip). Owner 2026-08-12. */
const MATRIX_COLUMN_SHORT: Record<string, string> = {
  driver: "DRIVER",
  customer: "CUST",
  vendor: "VEND",
  unit: "UNIT",
  trailer: "TRLR",
  load: "LOAD",
  ap_bill: "AP/BILL",
  expense: "EXP",
  gl_je: "GL/JE",
  inventory: "INV",
  liability: "LIAB/ESCR",
  picker_law: "PICK+",
  qbo_chrome: "QBO",
  connectivity: "CONN",
  reverse_link: "REV LINK",
  "scenario.maintenance": "MAINT WO",
  "scenario.insurance": "INS CLM",
  "scenario.ap": "AP BILL",
  "scenario.dispatch": "DISPATCH",
  claim: "CLAIM",
  work_order: "WO",
  accident: "ACCDNT",
  policy: "POLICY",
  settlement: "SETL",
  legal_matter: "LEGAL",
  invoice: "AR/INV",
  bank: "BANK",
  fw1_place: "1 PLACE",
  fw2_canonical: "2 CANON",
  fw3_money: "3 MONEY",
  fw4_fwd: "4 FWD",
  fw5_rev: "5 REV",
  fw6_matrix: "6 MATRIX",
  fw7_surface: "7 SURF",
  fw8_chrome: "8 CHROME",
  fw9_pickers: "9 PICK+",
  fw10_rls: "10 RLS",
  fw11_guard: "11 GUARD",
  fw12_live: "12 CLICK",
  gl_delta: "C25 GLΔ",
  subledger_tie: "C26 SUB",
  lifecycle_complete: "C27 LIFE",
  reversal_symmetry: "C28 REV",
  period_guard: "C29 PER",
  entity_isolation: "C30 ENT",
  non_empty_proof: "C31 LIVE",
  l6: "V1 L6",
  bound: "V2 BOUND",
  proven: "V3 PROVEN",
  evidence_class: "V4 EVIDENCE",
  route_alive: "V5 ROUTE",
  proof_age: "V6 AGE",
};

const MATRIX_GROUP_SHORT: Record<string, string> = {
  linkage: "LINK",
  money: "MONEY",
  chrome: "CHROME",
  wiring: "WIRE",
  process: "PROC",
  economics: "ECON C25–C31",
  verifier: "PROOF V1–V6",
  fully_wired: "FULLY WIRED 1–12",
};

export function matrixColumnHeaderLabel(columnId: string, fullLabel: string): string {
  return MATRIX_COLUMN_SHORT[columnId] ?? fullLabel;
}

export function matrixGroupHeaderLabel(groupId: string): string {
  return MATRIX_GROUP_SHORT[groupId] ?? groupId;
}

export function parseMatrixModule(raw: string | null): MatrixModuleId {
  if (!raw) return "home";
  const normalized = raw.trim().toLowerCase();
  const hit = MATRIX_MODULE_IDS.find(
    (id) => id === normalized || id.replace(/_/g, "-") === normalized || id.replace(/-/g, "_") === normalized,
  );
  if (hit) return hit;
  if (normalized === "bank" || normalized === "banking") return "banking";
  if (normalized === "425c" || normalized === "form425") return "form_425";
  if (normalized === "driverhub" || normalized === "driver_hub") return "driver-hub";
  if (normalized === "cashflow" || normalized === "cash_flow") return "cash-flow";
  return "home";
}

/**
 * Owner 2026-08-21 — CERTIFY Urgent 6 first, then rest of urgent, vertically.
 * Canonical JSON: docs/specs/scoreboard/launch-ladder.json
 */
export const URGENT_6_MODULE_IDS = launchLadder.urgent_6 as readonly MatrixModuleId[];
export const REST_OF_URGENT_MODULE_IDS = launchLadder.rest_of_urgent as readonly MatrixModuleId[];
export const VERTICAL_CERTIFY_COL_IDS = launchLadder.vertical_cols as readonly string[];
export const FAST_MERGE_STATUS = launchLadder.fast_merge as string;
export const VERTICAL_CERTIFY_COL_LABEL = VERTICAL_CERTIFY_COL_IDS.join(" → ");

/**
 * Owner urgency order — VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md §2 (historical P10).
 * Launch sort uses URGENT_6 then REST_OF_URGENT, not this list.
 */
export const PRIORITY_10_MODULE_IDS: readonly MatrixModuleId[] = [
  "lists",
  "accounting",
  "dispatch",
  "settlements",
  "factoring",
  "banking",
  "customers",
  "vendors",
  "drivers",
  "safety",
] as const;

export const FULLY_WIRED_SYSTEM_COLS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "fw1_place", label: "1 Place" },
  { id: "fw2_canonical", label: "2 Canonical" },
  { id: "fw3_money", label: "3 Money" },
  { id: "fw4_fwd", label: "4 Fwd" },
  { id: "fw5_rev", label: "5 Rev" },
  { id: "fw6_matrix", label: "6 Matrix" },
  { id: "fw7_surface", label: "7 Surface" },
  { id: "fw8_chrome", label: "8 Chrome" },
  { id: "fw9_pickers", label: "9 Pickers" },
  { id: "fw10_rls", label: "10 RLS" },
  { id: "fw11_guard", label: "11 Guard" },
  { id: "fw12_live", label: "12 Clicked" },
];

/** Owner 2026-08-19: 16 modules, A–Z by matrix id (legal + finance hub included). */
export const URGENT_16_MODULE_IDS: readonly MatrixModuleId[] = [
  "accounting",
  "banking",
  "cash-flow",
  "customers",
  "dispatch",
  "drivers",
  "factoring",
  "finance",
  "fleet",
  "insurance",
  "legal",
  "lists",
  "maintenance",
  "safety",
  "settlements",
  "vendors",
] as const;

/** @deprecated use URGENT_16_MODULE_IDS */
export const URGENT_14_MODULE_IDS = URGENT_16_MODULE_IDS;

export function isUrgent16Module(id: string): boolean {
  return (URGENT_16_MODULE_IDS as readonly string[]).includes(id);
}

export function isUrgent6Module(id: string): boolean {
  return (URGENT_6_MODULE_IDS as readonly string[]).includes(id);
}

export function isRestOfUrgentModule(id: string): boolean {
  return (REST_OF_URGENT_MODULE_IDS as readonly string[]).includes(id);
}

export function launchWaveForModule(id: string): "U6" | "REST" | "WAVE2" {
  if (isUrgent6Module(id)) return "U6";
  if (isRestOfUrgentModule(id)) return "REST";
  return "WAVE2";
}

export function isUrgent14Module(id: string): boolean {
  return isUrgent16Module(id);
}

export function isPriority10Module(id: string): boolean {
  return (PRIORITY_10_MODULE_IDS as readonly string[]).includes(id);
}

/** Sort: Urgent 6 locked order → rest of urgent → remaining modules A–Z by label. */
export function sortModulesPriority10First<T extends { module: string }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.module, r]));
  const out: T[] = [];
  for (const id of [...URGENT_6_MODULE_IDS, ...REST_OF_URGENT_MODULE_IDS]) {
    const hit = byId.get(id);
    if (hit) {
      out.push(hit);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) =>
    matrixModuleLabel(a.module as MatrixModuleId).localeCompare(
      matrixModuleLabel(b.module as MatrixModuleId),
      "en",
      { sensitivity: "base" },
    ),
  );
  return out.concat(rest);
}
