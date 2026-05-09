import { centsToUsd, emailShell, textShell } from "./shared.js";

type DriverSettlementsWeeklyInput = {
  generatedAt: string;
  summary: string;
  data: {
    rows: Array<{ driver_name: string; status: string; net_cents: number }>;
    total_open_cents: number;
  };
};

export function driverSettlementsWeeklyHtml(input: DriverSettlementsWeeklyInput) {
  const rows = input.data.rows
    .map(
      (row) =>
        `<tr><td style="padding:8px;border:1px solid #e2e8f0;">${row.driver_name}</td><td style="padding:8px;border:1px solid #e2e8f0;">${row.status}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(row.net_cents)}</td></tr>`
    )
    .join("");
  const table = `<table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr><th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Driver</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Status</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Net</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2" style="padding:8px;border:1px solid #e2e8f0;"><strong>Total open</strong></td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;"><strong>${centsToUsd(input.data.total_open_cents)}</strong></td></tr></tfoot>
  </table>`;
  return emailShell("Weekly Driver Settlements", input.generatedAt, input.summary, table);
}

export function driverSettlementsWeeklyText(input: DriverSettlementsWeeklyInput) {
  return textShell(
    "Weekly Driver Settlements",
    input.generatedAt,
    input.summary,
    [
      ...input.data.rows.map((row) => `${row.driver_name} (${row.status}): ${centsToUsd(row.net_cents)}`),
      `Total open: ${centsToUsd(input.data.total_open_cents)}`,
    ]
  );
}

