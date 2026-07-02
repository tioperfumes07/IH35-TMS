// IMPORT-P0 — unit tests for the SHARED JE→QBO push gate + a wiring assertion that BOTH live push paths
// consult it (the immediate best-effort push AND the queue-drain outbound sync). The second half closes
// the false-assurance gap: it is not enough to prove the gate logic — both real paths must call it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const isEnabledMock = vi.fn();
vi.mock("../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

import { evaluateJeQboPushGate } from "./qbo-je-push-gate.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const JE = "11111111-1111-4111-8111-111111111111";

function clientReturning(sourceSystem: string | null) {
  return { query: vi.fn(async () => ({ rows: sourceSystem === undefined ? [] : [{ source_system: sourceSystem }] })) };
}

describe("evaluateJeQboPushGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a QBO-origin source (import) regardless of the flag, without checking the flag", async () => {
    const client = clientReturning("tms");
    const res = await evaluateJeQboPushGate(client, OC, JE, { sourceSystem: "qbo" });
    expect(res.decision).toBe("import_source");
    expect(isEnabledMock).not.toHaveBeenCalled(); // short-circuits before LAYER 1
  });

  it("refuses a future 'qbo_import' source too", async () => {
    const client = clientReturning("tms");
    const res = await evaluateJeQboPushGate(client, OC, JE, { sourceSystem: "qbo_import" });
    expect(res.decision).toBe("import_source");
  });

  it("allows a TMS-origin JE when the flag is ON", async () => {
    isEnabledMock.mockResolvedValue(true);
    const res = await evaluateJeQboPushGate(clientReturning("tms"), OC, JE, { sourceSystem: "tms" });
    expect(res.decision).toBe("allow");
  });

  it("flag_off for a TMS-origin JE when the flag is OFF", async () => {
    isEnabledMock.mockResolvedValue(false);
    const res = await evaluateJeQboPushGate(clientReturning("tms"), OC, JE, { sourceSystem: "tms" });
    expect(res.decision).toBe("flag_off");
  });

  it("fetches source_system from the DB when not provided (and refuses a QBO row)", async () => {
    const client = clientReturning("qbo");
    const res = await evaluateJeQboPushGate(client, OC, JE);
    expect(res.decision).toBe("import_source");
    expect(client.query).toHaveBeenCalledTimes(1); // it did the source_system SELECT
  });
});

describe("IMPORT-P0 wiring — BOTH live push paths consult the shared gate", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const readSrc = (rel: string) => readFileSync(path.resolve(here, rel), "utf8");

  it("the immediate best-effort push service consults evaluateJeQboPushGate", () => {
    const src = readSrc("./journal-entry-qbo-push.service.ts");
    expect(src.includes("evaluateJeQboPushGate")).toBe(true);
  });

  it("the queue-drain outbound sync gates journal_entry via evaluateJeQboPushGate BEFORE fetching a token", () => {
    const src = readSrc("../integrations/qbo/sync-outbound-accounting.ts");
    expect(src.includes("evaluateJeQboPushGate")).toBe(true);
    const gateIdx = src.indexOf("evaluateJeQboPushGate");
    const tokenIdx = src.indexOf("getValidAccessToken(opts.operating_company_id)");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(tokenIdx); // gate runs before any QBO call
  });
});
