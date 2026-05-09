import { emailShell, textShell } from "./shared.js";

type IftaQuarterlyInput = {
  generatedAt: string;
  summary: string;
  data: {
    quarter_label: string;
    rows: Array<{ state: string; stop_events: number; estimated_miles: number; estimated_gallons: number }>;
    total_estimated_miles: number;
    total_estimated_gallons: number;
  };
};

export function iftaQuarterlyHtml(input: IftaQuarterlyInput) {
  const rows = input.data.rows
    .map(
      (row) =>
        `<tr><td style="padding:8px;border:1px solid #e2e8f0;">${row.state}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${row.stop_events}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${row.estimated_miles}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${row.estimated_gallons}</td></tr>`
    )
    .join("");
  const table = `<p style="margin:0 0 10px;"><strong>Quarter:</strong> ${input.data.quarter_label}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr><th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">State</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Stops</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Estimated Miles</th><th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Estimated Gallons</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return emailShell(
    "Quarterly IFTA State-by-State",
    input.generatedAt,
    input.summary,
    table,
    "Mileage/fuel estimates are placeholders until full IFTA ledger integration is delivered."
  );
}

export function iftaQuarterlyText(input: IftaQuarterlyInput) {
  return textShell(
    "Quarterly IFTA State-by-State",
    input.generatedAt,
    input.summary,
    [
      `Quarter: ${input.data.quarter_label}`,
      ...input.data.rows.map((row) => `${row.state}: stops ${row.stop_events}, est miles ${row.estimated_miles}, est gallons ${row.estimated_gallons}`),
    ],
    "Mileage/fuel estimates are placeholders until full IFTA ledger integration is delivered."
  );
}

