/**
 * GAP-70 — Outbound X12 210 Freight Invoice builder.
 */

export type Outbound210Input = {
  isa_id: string;
  gs_id: string;
  control_number: string;
  invoice_number: string;
  load_ref: string;
  amount_cents: number;
  invoice_date: string;
};

export function buildX12210(input: Outbound210Input): string {
  const date = input.invoice_date.slice(0, 10).replace(/-/g, "");
  const amount = (input.amount_cents / 100).toFixed(2);

  return [
    `ISA*00*          *00*          *ZZ*${input.isa_id.padEnd(15)}*ZZ*RECEIVER       *${date}*1200*^*00501*${input.control_number}*0*P*:~`,
    `GS*IN*${input.gs_id}*RECEIVER*${date}*1200*1*X*005010~`,
    `ST*210*0001~`,
    `B3*${input.invoice_number}*${input.load_ref}*PP*${date}~`,
    `L3*${amount}*G***${amount}~`,
    `SE*3*0001~`,
    `GE*1*1~`,
    `IEA*1*${input.control_number}~`,
  ].join("");
}
