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
