import { describe, expect, it } from "vitest";
import { PAY_COMPONENT_ITEM_NAMES, payComponentOfLine, resolvePayComponentItem } from "../pay-component-items.js";

// RULING 443.67 #1e — the ONE pay-component -> item map.
describe("pay-component items", () => {
  it("maps earnings / deadhead / salaried lines to their component", () => {
    expect(payComponentOfLine("earnings", "Loaded Miles 1180 @ 0.45")).toBe("loaded");
    expect(payComponentOfLine("deadhead_pay", "Empty Miles 12 @ 0.45")).toBe("empty");
    expect(payComponentOfLine("earnings", "Local driver — weekly salary (owner ruling)")).toBe("salary");
    expect(payComponentOfLine("earnings", "Salaried 0-rate")).toBe("salary");
  });
  it("never guesses an extra-pay / detention / reimbursement item", () => {
    for (const t of ["extra_pay", "detention_pay", "reimbursement", "escrow_contribution"]) expect(payComponentOfLine(t, "x")).toBeNull();
  });
  it("resolves exactly one active item by name, else null", async () => {
    const q = (rows: Array<{ id: string }>) => ({ query: async () => ({ rows }) }) as never;
    expect(await resolvePayComponentItem(q([{ id: "i1" }]), "co", "loaded")).toBe("i1");
    expect(await resolvePayComponentItem(q([]), "co", "loaded")).toBeNull();
    expect(await resolvePayComponentItem(q([{ id: "a" }, { id: "b" }]), "co", "loaded")).toBeNull();
    expect(PAY_COMPONENT_ITEM_NAMES.loaded).toBe("Driver Pay-Mexico-B1 Driver-Loaded Miles");
  });
});
