export type AccessorialRow = {
  id: string;
  additional_charge_id: string;
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
    additional_charge_id: "",
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
    additional_charge_id: "",
    code: defaults.code,
    description: opts?.description ?? defaults.description,
    amount_cents: Number(opts?.amount_cents ?? 0),
    taxable: false,
  };
}

export function sumAccessorialCents(rows: AccessorialRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
}

export const LINEHAUL_NEGATIVE_ERROR =
  "Linehaul cannot be negative. Use an accessorial adjustment for a reduction.";
export const FUEL_SURCHARGE_NEGATIVE_ERROR =
  "Fuel surcharge cannot be negative. Use an accessorial adjustment for a reduction.";

export function linehaulFuelError(field: "linehaul" | "fuel_surcharge", cents: number): string | null {
  if (Number(cents || 0) < 0) {
    return field === "linehaul" ? LINEHAUL_NEGATIVE_ERROR : FUEL_SURCHARGE_NEGATIVE_ERROR;
  }
  return null;
}

function nonNegativeOrZeroWithError(cents: number): number {
  const n = Number(cents || 0);
  return n < 0 ? 0 : n;
}

export function computeBookLoadSectionTotalCents(
  linehaulCents: number,
  fuelSurchargeCents: number,
  accessorialRows: AccessorialRow[]
): number {
  return (
    nonNegativeOrZeroWithError(linehaulCents) +
    nonNegativeOrZeroWithError(fuelSurchargeCents) +
    sumAccessorialCents(accessorialRows)
  );
}

export type BookLoadChargeLine = { code: string; additional_charge_id?: string; description?: string; amount_cents: number };

export function buildBookLoadChargeLines(input: {
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_rows: AccessorialRow[];
}): BookLoadChargeLine[] {
  const lines: BookLoadChargeLine[] = [
    { code: "linehaul", amount_cents: nonNegativeOrZeroWithError(input.linehaul_cents) },
    { code: "fuel_surcharge", amount_cents: nonNegativeOrZeroWithError(input.fuel_surcharge_cents) },
  ];
  for (const row of input.accessorial_rows) {
    const amount = Number(row.amount_cents || 0);
    if (amount === 0) continue;
    const code = String(row.code || "accessorial").trim() || "accessorial";
    lines.push({
      code: code.toLowerCase(),
      ...(row.additional_charge_id ? { additional_charge_id: row.additional_charge_id } : {}),
      ...(row.description ? { description: row.description } : {}),
      amount_cents: amount,
    });
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
