import { describe, expect, it } from "vitest";
import { mapAggregateToQueueEntity } from "../outbox-dispatcher.js";

describe("outbox dispatcher aggregate mapping", () => {
  it("maps known aggregates case-insensitively", () => {
    expect(mapAggregateToQueueEntity(" Invoice ")).toBe("invoice");
    expect(mapAggregateToQueueEntity("BANK_TRANSACTION")).toBe("bank_transaction");
  });

  it("returns null for unsupported aggregates", () => {
    expect(mapAggregateToQueueEntity("unknown")).toBeNull();
    expect(mapAggregateToQueueEntity("")).toBeNull();
  });
});
