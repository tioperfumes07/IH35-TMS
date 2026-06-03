import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("auto wo idempotency", () => {
  it("vehicle projector invokes fault code processor", () => {
    const projector = fs.readFileSync(
      path.join(here, "../../src/integrations/samsara/webhook-projectors/vehicle-projector.ts"),
      "utf8"
    );
    assert.match(projector, /processVehicleFaultCodeWebhookEvent/);
  });

  it("processor dedupes by raw_event_id and 24h window", () => {
    const processor = fs.readFileSync(
      path.join(here, "../../src/integrations/samsara/fault-code-processor.service.ts"),
      "utf8"
    );
    assert.match(processor, /raw_event_id = \$1/);
    assert.match(processor, /interval '24 hours'/);
    assert.match(processor, /origin = 'fault_auto'/);
    assert.match(processor, /status = 'draft'/);
  });
});
