/** Pure lease escalation math — leaf module to break the lease engine cycle. */
export function escalatedAmount(baseCents: number, commencement: string, periodStart: string, bps: number | null, everyMonths: number | null): number {
  if (!bps || !everyMonths || everyMonths <= 0) return baseCents;
  const [y0, m0] = commencement.split("-").map(Number);
  const [y1, m1] = periodStart.split("-").map(Number);
  const elapsed = Math.max(0, (y1 - y0) * 12 + (m1 - m0));
  const steps = Math.floor(elapsed / everyMonths);
  return Math.round(baseCents * Math.pow(1 + bps / 10000, steps));
}
