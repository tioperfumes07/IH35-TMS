import { emailShell, textShell } from "./shared.js";

type DispatchBoardDailyInput = {
  generatedAt: string;
  summary: string;
  data: { by_status: Array<{ status: string; count: number }>; total_open: number };
};

export function dispatchBoardDailyHtml(input: DispatchBoardDailyInput) {
  const rows = input.data.by_status
    .map((row) => `<tr><td style="padding:8px;border:1px solid #e2e8f0;">${row.status}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${row.count}</td></tr>`)
    .join("");
  const table = `<table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr><th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Load Status</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Count</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return emailShell("Daily Dispatch Board", input.generatedAt, input.summary, table);
}

export function dispatchBoardDailyText(input: DispatchBoardDailyInput) {
  const lines = input.data.by_status.map((row) => `- ${row.status}: ${row.count}`);
  return textShell("Daily Dispatch Board", input.generatedAt, input.summary, lines);
}

