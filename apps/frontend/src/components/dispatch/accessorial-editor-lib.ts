export type AccessorialRow = {
  id: string;
  code: string;
  description: string;
  amount_cents: number;
  taxable: boolean;
};

export type AccessorialSeedPreset = "detention" | "layover" | "lumper" | "tonu" | "misc_accessorial";

const SEED_DEFAULTS: Record<AccessorialSeedPreset, { code: string; description: string }> = {
  detention: { code: "DETENTION", description: "Detention" },
  layover: { code: "LAYOVER", description: "Layover" },
  lumper: { code: "LUMPER", description: "Lumper" },
  tonu: { code: "TONU", description: "TONU" },
  misc_accessorial: { code: "MISC", description: "Misc accessorial" },
};

export function newAccessorialRowId(): string {
  return `acc-${crypto.randomUUID()}`;
}

export function createEmptyAccessorialRow(): AccessorialRow {
  return {
    id: newAccessorialRowId(),
    code: "",
    description: "",
    amount_cents: 0,
    taxable: false,
  };
}

export function seedAccessorialRow(
  preset: AccessorialSeedPreset,
  opts?: { amount_cents?: number; description?: string }
): AccessorialRow {
  const defaults = SEED_DEFAULTS[preset];
  return {
    id: newAccessorialRowId(),
    code: defaults.code,
    description: opts?.description ?? defaults.description,
    amount_cents: Math.max(0, Number(opts?.amount_cents ?? 0)),
    taxable: false,
  };
}

export function sumAccessorialCents(rows: AccessorialRow[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount_cents || 0)), 0);
}

export function computeBookLoadSectionTotalCents(
  linehaulCents: number,
  fuelSurchargeCents: number,
  accessorialRows: AccessorialRow[]
): number {
  return (
    Math.max(0, Number(linehaulCents || 0)) +
    Math.max(0, Number(fuelSurchargeCents || 0)) +
    sumAccessorialCents(accessorialRows)
  );
}

export type BookLoadChargeLine = { code: string; amount_cents: number };

export function buildBookLoadChargeLines(input: {
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_rows: AccessorialRow[];
}): BookLoadChargeLine[] {
  const lines: BookLoadChargeLine[] = [
    { code: "linehaul", amount_cents: Math.max(0, Number(input.linehaul_cents || 0)) },
    { code: "fuel_surcharge", amount_cents: Math.max(0, Number(input.fuel_surcharge_cents || 0)) },
  ];
  for (const row of input.accessorial_rows) {
    const amount = Math.max(0, Number(row.amount_cents || 0));
    if (amount <= 0) continue;
    const code = String(row.code || "accessorial").trim() || "accessorial";
    lines.push({ code: code.toLowerCase(), amount_cents: amount });
  }
  return lines;
}

/** Detention accrual: bill-customer ¢/hr × expected hours (rounded). */
export function computeDetentionAccrualCents(hours: number, billCustomerPerHourCents: number): number {
  const h = Math.max(0, Number(hours || 0));
  const rate = Math.max(0, Number(billCustomerPerHourCents || 0));
  if (h <= 0 || rate <= 0) return 0;
  return Math.round(h * rate);
}

export function rowFromLegacyAccessorialCents(accessorialCents: number): AccessorialRow[] {
  const cents = Math.max(0, Number(accessorialCents || 0));
  if (cents <= 0) return [];
  return [seedAccessorialRow("misc_accessorial", { amount_cents: cents })];
}
