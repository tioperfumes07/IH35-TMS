export type AccessorialChargeInput = {
  code: string;
  amount_cents: number;
};

export function sumChargeLinesCents(charges: AccessorialChargeInput[]): number {
  return charges.reduce((sum, line) => sum + Math.max(0, Number(line.amount_cents ?? 0)), 0);
}

export function mergeBookLoadCharges(input: {
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_lines: AccessorialChargeInput[];
}): AccessorialChargeInput[] {
  const lines: AccessorialChargeInput[] = [
    { code: "linehaul", amount_cents: Math.max(0, Number(input.linehaul_cents || 0)) },
    { code: "fuel_surcharge", amount_cents: Math.max(0, Number(input.fuel_surcharge_cents || 0)) },
  ];
  for (const line of input.accessorial_lines) {
    const amount = Math.max(0, Number(line.amount_cents || 0));
    if (amount <= 0) continue;
    const code = String(line.code || "accessorial").trim() || "accessorial";
    lines.push({ code, amount_cents: amount });
  }
  return lines;
}

export function bookLoadRateTotalCents(charges: AccessorialChargeInput[]): number {
  return sumChargeLinesCents(charges);
}
