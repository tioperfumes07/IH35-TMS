import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFaultCodesFromPayload,
  processVehicleFaultCodeWebhookEvent,
} from "../../src/integrations/samsara/fault-code-processor.service.js";

describe("fault code processor", () => {
  it("extracts fault codes from Samsara payload paths", () => {
    const codes = extractFaultCodesFromPayload({
      data: {
        faultCodes: [{ code: "SPN-110", description: "Coolant temp high" }],
        dtc_codes: [{ dtc_code: "P0128", message: "Thermostat" }],
      },
    });
    assert.equal(codes.length, 2);
    assert.equal(codes[0]?.code, "SPN-110");
  });

  it("skips auto-WO when table missing", async () => {
    const query = async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      return { rows: [] };
    };
    const result = await processVehicleFaultCodeWebhookEvent(
      { query },
      {
        id: "evt-1",
        operating_company_id: "11111111-1111-1111-1111-111111111111",
        event_type: "vehicle.fault",
        samsara_event_id: "sam-1",
        signature_valid: true,
        payload: { data: { faultCodes: [{ code: "SPN-615" }] } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      },
      "22222222-2222-2222-2222-222222222222"
    );
    assert.equal(result.faults_processed, 1);
    assert.equal(result.draft_wos_created, 0);
  });
});
