import { beforeEach, describe, expect, it, vi } from "vitest";

const { isEnabledMock } = vi.hoisted(() => ({ isEnabledMock: vi.fn() }));
vi.mock("../../lib/feature-flags/service.js", () => ({
  isEnabled: isEnabledMock,
}));

import { runScenarioProbe } from "../scenario-probe.service.js";
import { SCENARIO_REGISTRY } from "../scenario-registry.js";

const def = SCENARIO_REGISTRY.find((item) => item.key === "scenario.parts_receive");
if (!def?.probe?.flag_gate) throw new Error("scenario.parts_receive flag-gated probe missing");

describe("runScenarioProbe flag-gated counts", () => {
  beforeEach(() => isEnabledMock.mockReset());

  it("uses the receipt count when the per-entity posting flag is off", async () => {
    isEnabledMock.mockResolvedValue(false);
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ n: "2", posting_n: "0" }] }) };

    await expect(runScenarioProbe(client, def, "company-1")).resolves.toEqual({
      ok: true,
      evidence: "2 live parts receipt(s)",
    });
    expect(isEnabledMock).toHaveBeenCalledWith(client, "PARTS_PURCHASE_GL_POSTING_ENABLED", {
      operating_company_id: "company-1",
    });
  });

  it("requires the balanced-posting count when the per-entity flag is on", async () => {
    isEnabledMock.mockResolvedValue(true);
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ n: "2", posting_n: "0" }] }) };

    await expect(runScenarioProbe(client, def, "company-1")).resolves.toEqual({
      ok: false,
      evidence: "0 live parts receipt(s) with balanced posted JE(s)",
    });
  });

  it("does not collapse multiple company flag states into an all-entity answer", async () => {
    const client = { query: vi.fn() };

    await expect(runScenarioProbe(client, def, null)).resolves.toEqual({
      ok: false,
      evidence: "PARTS_PURCHASE_GL_POSTING_ENABLED is per-entity — select an entity to resolve",
    });
    expect(isEnabledMock).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("binds the actual registry SQL to receipt and balanced-posting counts without raw flag reads", () => {
    expect(def.probe?.sql).toContain("AS posting_n");
    expect(def.probe?.sql).toContain("accounting.parts_purchase_postings");
    expect(def.probe?.sql).not.toMatch(/FROM\s+lib\.feature_flag/i);
  });
});
