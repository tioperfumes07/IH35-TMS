import type { StateTaxRow } from "./ifta-tax-calculator.js";

export type IftaCsvInput = {
  carrierIftaNumber: string;
  quarter: number;
  year: number;
  stateTaxRows: StateTaxRow[];
};

const CSV_HEADERS = [
  "Carrier IFTA #",
  "Quarter",
  "Year",
  "State",
  "Total Miles",
  "Taxable Miles",
  "Taxable Gallons",
  "Tax-Paid Gallons",
  "Net Taxable Gallons",
  "Tax Rate",
  "Tax/Credit",
] as const;

function csvEscape(value: string | number) {
  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildIftaCsvContent(input: IftaCsvInput): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of input.stateTaxRows) {
    lines.push(
      [
        input.carrierIftaNumber,
        input.quarter,
        input.year,
        row.state,
        row.miles_in_state,
        row.miles_in_state,
        row.taxable_gallons,
        row.gallons_purchased_in_state,
        row.net_taxable_gallons,
        row.tax_rate_per_gallon,
        row.tax_owed,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildIftaCsvObjectKey(operatingCompanyId: string, preparationId: string, quarter: number, year: number) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `ifta/quarterly/${operatingCompanyId}/${year}-Q${quarter}/${preparationId}-${ts}.csv`;
}
