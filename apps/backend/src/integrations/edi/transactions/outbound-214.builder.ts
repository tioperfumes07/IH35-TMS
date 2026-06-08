/**
 * GAP-70 — Outbound X12 214 Shipment Status builder.
 */

export type LoadStatus214 =
  | "assigned"
  | "in_transit"
  | "at_pickup"
  | "departed_pickup"
  | "at_delivery"
  | "delivered";

const STATUS_CODE_MAP: Record<LoadStatus214, string> = {
  assigned: "AA",
  in_transit: "X1",
  at_pickup: "X3",
  departed_pickup: "AF",
  at_delivery: "X6",
  delivered: "D1",
};

export type Outbound214Input = {
  isa_id: string;
  gs_id: string;
  control_number: string;
  load_ref: string;
  status: LoadStatus214;
  status_at: string;
  city?: string | null;
  state?: string | null;
};

export function buildX12214(input: Outbound214Input): string {
  const statusCode = STATUS_CODE_MAP[input.status] ?? "X1";
  const date = input.status_at.slice(0, 10).replace(/-/g, "");
  const time = input.status_at.slice(11, 16).replace(/:/g, "") || "1200";
  const city = input.city ?? "";
  const state = input.state ?? "";

  return [
    `ISA*00*          *00*          *ZZ*${input.isa_id.padEnd(15)}*ZZ*RECEIVER       *${date}*${time}*^*00501*${input.control_number}*0*P*:~`,
    `GS*QM*${input.gs_id}*RECEIVER*${date}*${time}*1*X*005010~`,
    `ST*214*0001~`,
    `B10*${input.load_ref}*${statusCode}~`,
    `MS1*${city}*${state}~`,
    `AT7*${statusCode}*NS***${date}*${time}*CT~`,
    `SE*4*0001~`,
    `GE*1*1~`,
    `IEA*1*${input.control_number}~`,
  ].join("");
}

export function statusTriggers214(loadStatus: string): boolean {
  return ["assigned", "in_transit", "at_pickup", "departed_pickup", "at_delivery", "delivered"].includes(
    loadStatus
  );
}
