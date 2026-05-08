// TODO: extract to packages/shared-types in T11.15.4
export type SettlementStatus = "draft" | "presettle" | "acked" | "locked" | "paid" | "held" | "cancelled";

export type EarningsLoad = {
  id: string;
  load_display_id: string;
  miles: number;
  gross_cents: number;
  status: SettlementStatus;
};

export type CycleEarnings = {
  cycle_id: string;
  period_start: string;
  period_end: string;
  loads_completed: number;
  miles_driven: number;
  gross_cents: number;
  advances_cents: number;
  deductions_cents: number;
  escrow_cents: number;
  net_preview_cents: number;
  final_settlement_cents: number | null;
  loads: EarningsLoad[];
};

// TODO: wire to /api/driver/earnings/current-cycle in P3-T11.15.4
export async function getMyCurrentCycle(): Promise<CycleEarnings> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  return {
    cycle_id: "cycle-current",
    period_start: start.toISOString(),
    period_end: now.toISOString(),
    loads_completed: 4,
    miles_driven: 1842,
    gross_cents: 462300,
    advances_cents: 60000,
    deductions_cents: 37250,
    escrow_cents: 25000,
    net_preview_cents: 340050,
    final_settlement_cents: null,
    loads: [
      { id: "load-1002", load_display_id: "LD-1002", miles: 1065, gross_cents: 341500, status: "presettle" },
      { id: "load-1003", load_display_id: "LD-1003", miles: 777, gross_cents: 120800, status: "acked" },
    ],
  };
}

// TODO: wire to /api/driver/earnings/past-cycles in P3-T11.15.4
export async function getMyPastCycles(): Promise<CycleEarnings[]> {
  const base = Date.now();
  return Array.from({ length: 4 }, (_, idx) => {
    const end = new Date(base - idx * 7 * 24 * 3600_000);
    const start = new Date(end.getTime() - 6 * 24 * 3600_000);
    return {
      cycle_id: `cycle-${idx + 1}`,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      loads_completed: 3 + idx,
      miles_driven: 1400 + idx * 120,
      gross_cents: 380000 + idx * 12000,
      advances_cents: 45000,
      deductions_cents: 29000 + idx * 1000,
      escrow_cents: 22000,
      net_preview_cents: 284000 + idx * 10000,
      final_settlement_cents: 282000 + idx * 9500,
      loads: [],
    };
  });
}
