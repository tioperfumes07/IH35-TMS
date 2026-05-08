export type ReportCategory = "all" | "operations" | "financial" | "drivers" | "fleet" | "fuel" | "safety" | "compliance" | "saved";

export type FrequentlyRunReport = {
  id: string;
  name: string;
  filters: string;
  runs: number;
};

export type ScheduledReport = {
  id: string;
  cadence: string;
  name: string;
  recipients: string;
};

export type IftaStatus = {
  currentQuarter: string;
  filedAt: string | null;
  nextDueAt: string;
  daysUntilDue: number;
  step1Ready: boolean;
  step2Ready: boolean;
  step3Ready: boolean;
  step4WaitsClose: boolean;
};

export async function getFrequentlyRun(): Promise<FrequentlyRunReport[]> {
  return [
    {
      id: "profit-truck-mtd",
      name: "Profit per truck · MTD",
      filters: "100 units · current month · in-house, external, roadside cost split",
      runs: 14,
    },
    {
      id: "driver-settlement",
      name: "Driver settlement summary",
      filters: "last cycle Sun-Sat · advances + deductions + escrow + minus run",
      runs: 12,
    },
    { id: "ar-aging", name: "A/R aging", filters: "customer · current / 30 / 31-60 / 61+ · with debt by", runs: 9 },
    { id: "fuel-savings", name: "Fuel savings · rec vs actual", filters: "recommendation accuracy · driver / unit · variance %", runs: 8 },
    { id: "maint-cost-unit", name: "Maintenance cost per unit", filters: "all WO costs · in-house + external + roadside", runs: 6 },
    { id: "detention-claims", name: "Detention claims", filters: "customer · time · billed · collected", runs: 5 },
    { id: "driver-pay-history", name: "Driver pay history", filters: "all settlements + advances + deductions", runs: 4 },
    { id: "csa-fleet", name: "CSA fleet score", filters: "FMCSA categories · vs threshold · trend", runs: 3 },
  ];
}

export async function getScheduledReports(): Promise<ScheduledReport[]> {
  return [
    { id: "s1", cadence: "Daily 7:00a", name: "Dispatch board · units & loads", recipients: "→ owner" },
    { id: "s2", cadence: "Daily 6:00p", name: "Cash position + AR aging", recipients: "→ owner, acctg" },
    { id: "s3", cadence: "Mon 8:00a", name: "Profit per truck · last week", recipients: "→ owner" },
    { id: "s4", cadence: "Fri 5:00p", name: "Driver settlements ready", recipients: "→ acctg" },
    { id: "s5", cadence: "Mon weekly", name: "Maintenance + open WOs", recipients: "→ safety" },
    { id: "s6", cadence: "Quarterly", name: "IFTA state-by-state · CSV", recipients: "→ safety" },
  ];
}

export async function getIftaStatus(): Promise<IftaStatus> {
  return {
    currentQuarter: "Q2",
    filedAt: "2026-04-28",
    nextDueAt: "2026-05-30",
    daysUntilDue: 28,
    step1Ready: true,
    step2Ready: true,
    step3Ready: true,
    step4WaitsClose: true,
  };
}
