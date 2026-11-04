/**
 * Rows 24 (R217) — the close engine refuses an EMPTY settlement by name. A line is live only when active AND not voided;
 * a settlement whose every line is voided (but left is_active = true) is empty and must never close at $0.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "settlement-payrun-close.service.ts"), "utf8");

describe("rows 24 — empty settlement refused at close", () => {
  it("counts live lines as active AND not voided", () => {
    expect(SRC).toMatch(/const liveLineCount = await client\.query[\s\S]{0,400}AND \$\{activeSettlementLine\("sl", "s_live"\)\}`/);
  });
  it("refuses by name, with the settlement's id in the message", () => {
    expect(SRC).toMatch(/"SETTLEMENT_HAS_NO_LIVE_LINES",\s*`Settlement \$\{settlement\.display_id \?\? settlement\.id\} has no active settlement lines/);
  });
  it("the only $0 close is the owner's weekly-salary ruling (every linked load on the 0-rate Salaried override)", () => {
    const at = SRC.indexOf("if (Number(liveLineCount.rows[0]?.n ?? 0) === 0)");
    const block = SRC.slice(at, at + 4000);
    expect(block).toContain("driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)'");
    expect(block.indexOf("SETTLEMENT_HAS_NO_LIVE_LINES")).toBeGreaterThan(block.indexOf("salariedOnly && input.previewOnly !== true"));
  });
});
