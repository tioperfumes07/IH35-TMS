export type GateContext = {
  operating_company_id: string;
  action_slug: string;
  load_uuid?: string | null;
  unit_uuid?: string | null;
  driver_uuid?: string | null;
  trailer_uuid?: string | null;
};

export type GateResultItem = {
  workflow: string;
  kind: "blocker" | "warning" | "info";
  message: string;
  evidence?: Record<string, unknown>;
};

export type GateCheckResult = {
  pass: boolean;
  blockers: GateResultItem[];
  warnings: GateResultItem[];
  info: GateResultItem[];
};

export type GateFn = (ctx: GateContext, client: { query: <T=Record<string,unknown>>(sql:string,values?:unknown[])=>Promise<{rows:T[]}> }) => Promise<GateResultItem[]>;

const registry = new Map<string, GateFn[]>();

export function registerGate(actionSlug: string, gateFn: GateFn) {
  const list = registry.get(actionSlug) ?? [];
  list.push(gateFn);
  registry.set(actionSlug, list);
}

export async function checkGates(ctx: GateContext, client: Parameters<GateFn>[1]): Promise<GateCheckResult> {
  const gates = registry.get(ctx.action_slug) ?? [];
  const blockers: GateResultItem[] = [];
  const warnings: GateResultItem[] = [];
  const info: GateResultItem[] = [];
  for (const gate of gates) {
    for (const item of await gate(ctx, client)) {
      if (item.kind === "blocker") blockers.push(item);
      else if (item.kind === "warning") warnings.push(item);
      else info.push(item);
    }
  }
  return { pass: blockers.length === 0, blockers, warnings, info };
}

export const DISPATCH_MUTATION_ACTIONS = ["book_load", "assign_driver", "quick_assign"] as const;

export function registerDefaultDispatchGates() {
  // populated by gate modules on import
}
