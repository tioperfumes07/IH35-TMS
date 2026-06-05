import puppeteer from "puppeteer";

export type Form2290VehicleInput = {
  unitId: string;
  unitNumber: string;
  vin: string;
  grossWeightLbs: number;
  firstUsedMonth: string | null;
  suspensionClaimed: boolean;
};

export type Form2290VehicleComputed = Form2290VehicleInput & {
  grossWeightCategory: string;
  annualTax: number;
  taxDue: number;
};

const ANNUAL_TAX_BY_CATEGORY: Record<string, number> = {
  A: 100,
  B: 122,
  C: 144,
  D: 166,
  E: 188,
  F: 210,
  G: 232,
  H: 254,
  I: 276,
  J: 298,
  K: 320,
  L: 342,
  M: 364,
  N: 386,
  O: 408,
  P: 430,
  Q: 452,
  R: 474,
  S: 496,
  T: 518,
  U: 550,
  V: 550,
  W: 0,
};

export function grossWeightCategoryFromLbs(lbs: number): string {
  if (lbs < 55_000) return "W";
  if (lbs >= 75_000) return "V";
  const index = Math.min(21, Math.floor((lbs - 55_000) / 1_000));
  return String.fromCharCode(65 + index);
}

export function annualTaxForCategory(category: string): number {
  return ANNUAL_TAX_BY_CATEGORY[category] ?? 550;
}

/** Partial-year proration by month first used in the July–June tax period. */
export function partialYearTaxFactor(firstUsedMonth: string | null, taxPeriodStart: string): number {
  if (!firstUsedMonth) return 1;
  const used = new Date(`${firstUsedMonth}T00:00:00Z`);
  const periodStart = new Date(`${taxPeriodStart}T00:00:00Z`);
  if (Number.isNaN(used.getTime()) || used <= periodStart) return 1;
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  periodEnd.setUTCMonth(5);
  periodEnd.setUTCDate(30);
  const months =
    (periodEnd.getUTCFullYear() - used.getUTCFullYear()) * 12 +
    (periodEnd.getUTCMonth() - used.getUTCMonth()) +
    1;
  return Math.min(1, Math.max(1 / 12, months / 12));
}

export function computeForm2290Vehicles(
  vehicles: Form2290VehicleInput[],
  taxPeriodStart: string
): Form2290VehicleComputed[] {
  return vehicles.map((vehicle) => {
    const category = vehicle.suspensionClaimed ? "W" : grossWeightCategoryFromLbs(vehicle.grossWeightLbs);
    const annualTax = annualTaxForCategory(category);
    const factor = vehicle.suspensionClaimed ? 0 : partialYearTaxFactor(vehicle.firstUsedMonth, taxPeriodStart);
    const taxDue = Math.round(annualTax * factor * 100) / 100;
    return {
      ...vehicle,
      grossWeightCategory: category,
      annualTax,
      taxDue,
    };
  });
}

export function upcomingForm2290Deadline(reference = new Date()): { deadline: string; daysRemaining: number } {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const deadlineYear = month >= 7 ? year + 1 : year;
  const deadline = new Date(Date.UTC(deadlineYear, 7, 31));
  const daysRemaining = Math.ceil((deadline.getTime() - reference.getTime()) / 86_400_000);
  return { deadline: deadline.toISOString().slice(0, 10), daysRemaining };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function renderForm2290Pdf(input: {
  ein: string;
  companyName: string;
  taxPeriodStart: string;
  taxPeriodEnd: string;
  vehicles: Form2290VehicleComputed[];
  totalTaxDue: number;
}) {
  const scheduleRows = input.vehicles
    .map(
      (v) =>
        `<tr><td>${escapeHtml(v.vin)}</td><td>${escapeHtml(v.unitNumber)}</td><td>${v.grossWeightCategory}</td><td>$${v.taxDue.toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Form 2290 Draft</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
  h1 { font-size: 16px; } table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
  th { background: #f3f4f6; }
</style></head><body>
  <h1>IRS Form 2290 — Heavy Highway Vehicle Use Tax (Draft)</h1>
  <p><strong>${escapeHtml(input.companyName)}</strong> · EIN ${escapeHtml(input.ein)}</p>
  <p>Tax period: ${escapeHtml(input.taxPeriodStart)} through ${escapeHtml(input.taxPeriodEnd)}</p>
  <p>Total tax due: <strong>$${input.totalTaxDue.toFixed(2)}</strong></p>
  <h2>Schedule 1 — VIN list</h2>
  <table><thead><tr><th>VIN</th><th>Unit</th><th>Category</th><th>Tax</th></tr></thead><tbody>${scheduleRows}</tbody></table>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return { pdfBuffer: Buffer.from(pdf), html };
  } finally {
    await browser.close();
  }
}
