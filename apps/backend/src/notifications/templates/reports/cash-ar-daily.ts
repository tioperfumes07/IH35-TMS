import { centsToUsd, emailShell, textShell } from "./shared.js";

type CashArDailyInput = {
  generatedAt: string;
  summary: string;
  data: {
    cash_received_last_24h_cents: number;
    ar_current_cents: number;
    ar_1_30_cents: number;
    ar_31_60_cents: number;
    ar_61_90_cents: number;
    ar_91_plus_cents: number;
    ar_total_open_cents: number;
    open_invoice_count: number;
  };
};

export function cashArDailyHtml(input: CashArDailyInput) {
  const d = input.data;
  const table = `<table style="border-collapse:collapse;width:100%;font-size:13px;">
    <tbody>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Cash received (24h)</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.cash_received_last_24h_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">A/R Current</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.ar_current_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">A/R 1-30</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.ar_1_30_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">A/R 31-60</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.ar_31_60_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">A/R 61-90</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.ar_61_90_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">A/R 91+</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${centsToUsd(d.ar_91_plus_cents)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;"><strong>A/R Total Open</strong></td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;"><strong>${centsToUsd(d.ar_total_open_cents)}</strong></td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Open invoices</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${d.open_invoice_count}</td></tr>
    </tbody>
  </table>`;
  return emailShell("Daily Cash Position + AR Aging", input.generatedAt, input.summary, table);
}

export function cashArDailyText(input: CashArDailyInput) {
  const d = input.data;
  return textShell("Daily Cash Position + AR Aging", input.generatedAt, input.summary, [
    `Cash received (24h): ${centsToUsd(d.cash_received_last_24h_cents)}`,
    `A/R Current: ${centsToUsd(d.ar_current_cents)}`,
    `A/R 1-30: ${centsToUsd(d.ar_1_30_cents)}`,
    `A/R 31-60: ${centsToUsd(d.ar_31_60_cents)}`,
    `A/R 61-90: ${centsToUsd(d.ar_61_90_cents)}`,
    `A/R 91+: ${centsToUsd(d.ar_91_plus_cents)}`,
    `A/R Total Open: ${centsToUsd(d.ar_total_open_cents)}`,
    `Open invoices: ${d.open_invoice_count}`,
  ]);
}

