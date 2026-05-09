import { centsToUsd, emailShell, textShell } from "./shared.js";

type ProfitPerTruckWeeklyInput = {
  generatedAt: string;
  summary: string;
  data: { rows: Array<{ unit_number: string; revenue_cents: number; wo_cost_cents: number; profit_cents: number }> };
};

export function profitPerTruckWeeklyHtml(input: ProfitPerTruckWeeklyInput) {
  const rows = input.data.rows
    .map(
      (row) =>
        `<tr><td style="padding:8px;border:1px solid #e2e8f0;">${row.unit_number}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(row.revenue_cents)}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(row.wo_cost_cents)}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(row.profit_cents)}</td></tr>`
    )
    .join("");
  const table = `<table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr><th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Unit</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Revenue</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">WO Cost</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Profit</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return emailShell("Weekly Profit per Truck", input.generatedAt, input.summary, table);
}

export function profitPerTruckWeeklyText(input: ProfitPerTruckWeeklyInput) {
  return textShell(
    "Weekly Profit per Truck",
    input.generatedAt,
    input.summary,
    input.data.rows.map((row) => `${row.unit_number}: revenue ${centsToUsd(row.revenue_cents)}, WO cost ${centsToUsd(row.wo_cost_cents)}, profit ${centsToUsd(row.profit_cents)}`)
  );
}

