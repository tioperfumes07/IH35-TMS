/**
 * GAP-70 — Outbound X12 990 Response to Load Tender builder.
 */

export type Outbound990Input = {
  isa_id: string;
  gs_id: string;
  control_number: string;
  tender_ref: string;
  accepted: boolean;
  response_date: string;
};

export function buildX12990(input: Outbound990Input): string {
  const date = input.response_date.slice(0, 10).replace(/-/g, "");
  const code = input.accepted ? "A" : "D";

  return [
    `ISA*00*          *00*          *ZZ*${input.isa_id.padEnd(15)}*ZZ*RECEIVER       *${date}*1200*^*00501*${input.control_number}*0*P*:~`,
    `GS*GF*${input.gs_id}*RECEIVER*${date}*1200*1*X*005010~`,
    `ST*990*0001~`,
    `B1*${input.tender_ref}*${code}~`,
    `SE*2*0001~`,
    `GE*1*1~`,
    `IEA*1*${input.control_number}~`,
  ].join("");
}
