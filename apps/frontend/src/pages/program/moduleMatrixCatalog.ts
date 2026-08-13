/**
 * Matrix module rail order — locked to sidebar (owner 2026-08-10).
 * Source: docs/specs/scoreboard/matrix-module-order.json
 */
import matrixOrder from "@scoreboard/matrix-module-order.json";

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
  claim: "CLAIM",
  work_order: "WO",
  accident: "ACCDNT",
  policy: "POLICY",
  settlement: "SETL",
  legal_matter: "LEGAL",
  invoice: "AR/INV",
  bank: "BANK",
};

const MATRIX_GROUP_SHORT: Record<string, string> = {
  linkage: "LINK",
  money: "MONEY",
  chrome: "CHROME",
  wiring: "WIRE",
  process: "PROC",
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
 * Owner urgency order — VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md §2.
 * All-modules system board lists these first, then remaining sidebar modules.
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

export function isPriority10Module(id: string): boolean {
  return (PRIORITY_10_MODULE_IDS as readonly string[]).includes(id);
}

/** Sort module rows: priority 10 (locked order) first, then remaining sidebar order. */
export function sortModulesPriority10First<T extends { module: string }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.module, r]));
  const out: T[] = [];
  for (const id of PRIORITY_10_MODULE_IDS) {
    const hit = byId.get(id);
    if (hit) {
      out.push(hit);
      byId.delete(id);
    }
  }
  for (const m of MATRIX_MODULES_SIDEBAR_ORDER) {
    const hit = byId.get(m.id);
    if (hit) {
      out.push(hit);
      byId.delete(m.id);
    }
  }
  for (const leftover of byId.values()) out.push(leftover);
  return out;
}
