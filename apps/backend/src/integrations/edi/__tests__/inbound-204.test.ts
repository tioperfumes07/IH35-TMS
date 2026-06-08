import { describe, expect, it, vi } from "vitest";
import {
  createDraftLoadFrom204,
  extractControlNumber,
  handleInbound204,
  parseX12204Payload,
} from "../transactions/inbound-204.handler.js";
import { buildX12214 } from "../transactions/outbound-214.builder.js";
import { buildX12210 as build210 } from "../transactions/outbound-210.builder.js";
import { buildX12990 as build990 } from "../transactions/outbound-990.builder.js";

const SAMPLE_204 = [
  "ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260607*1200*^*00501*000000001*0*P*:~",
  "GS*SM*SENDER*RECEIVER*20260607*1200*1*X*005010~",
  "ST*204*0001~",
  "B2**SCAC**BROKERREF123~",
  "G62*10*20260608~",
  "N1*SH*SHIPPER*LAREDO*TX~",
  "N1*CN*CONSIGNEE*DALLAS*TX~",
  "L5*1*STEEL COILS~",
  "L3*1500.00~",
  "SE*7*0001~",
  "GE*1*1~",
  "IEA*1*000000001~",
].join("");

describe("parseX12204Payload", () => {
  it("extracts broker ref, stops, commodity, and rate", () => {
    const parsed = parseX12204Payload(SAMPLE_204);
    expect(parsed.broker_ref).toBe("BROKERREF123");
    expect(parsed.pickup_city).toBe("LAREDO");
    expect(parsed.pickup_state).toBe("TX");
    expect(parsed.delivery_city).toBe("DALLAS");
    expect(parsed.delivery_state).toBe("TX");
    expect(parsed.commodity).toBe("STEEL COILS");
    expect(parsed.rate_cents).toBe(150000);
    expect(parsed.pickup_date).toBe("20260608");
  });
});

describe("extractControlNumber", () => {
  it("reads ISA control number segment", () => {
    expect(extractControlNumber(SAMPLE_204)).toBe("000000001");
  });
});

describe("X12 outbound builders", () => {
  it("builds 214 status message", () => {
    const payload = buildX12214({
      isa_id: "IH35",
      gs_id: "IH35",
      control_number: "0001",
      load_ref: "LD-100",
      status: "in_transit",
      status_at: "2026-06-07T14:30:00Z",
      city: "Laredo",
      state: "TX",
    });
    expect(payload).toContain("ST*214");
    expect(payload).toContain("LD-100");
  });

  it("builds 210 invoice message", () => {
    const payload = build210({
      isa_id: "IH35",
      gs_id: "IH35",
      control_number: "0002",
      invoice_number: "INV-1",
      load_ref: "LD-100",
      amount_cents: 150000,
      invoice_date: "2026-06-07",
    });
    expect(payload).toContain("ST*210");
    expect(payload).toContain("1500.00");
  });

  it("builds 990 acceptance response", () => {
    const payload = build990({
      isa_id: "IH35",
      gs_id: "IH35",
      control_number: "0003",
      tender_ref: "TENDER-1",
      accepted: true,
      response_date: "2026-06-07",
    });
    expect(payload).toContain("ST*990");
    expect(payload).toContain("*A~");
  });
});

describe("handleInbound204", () => {
  it("stores parsed message when no customer_id mapping", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ uuid: "msg-1" }] }),
    };
    const result = await handleInbound204(client as never, {
      operating_company_id: "co-1",
      partner_uuid: "p-1",
      raw_payload: SAMPLE_204,
    });
    expect(result.status).toBe("processed");
    expect(result.message_uuid).toBe("msg-1");
    expect(result.load_uuid).toBeNull();
  });
});

describe("createDraftLoadFrom204", () => {
  it("inserts draft load and stops when customer_id provided", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "load-1" }] })
        .mockResolvedValue({ rows: [] }),
    };
    const loadId = await createDraftLoadFrom204(client as never, {
      operating_company_id: "co-1",
      customer_id: "cust-1",
      parsed: parseX12204Payload(SAMPLE_204),
    });
    expect(loadId).toBe("load-1");
    expect(client.query.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
