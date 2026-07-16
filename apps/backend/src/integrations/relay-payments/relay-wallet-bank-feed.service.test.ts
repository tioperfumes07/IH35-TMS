import { describe, expect, it } from "vitest";
import {
  findPromptValue,
  relayWalletSourceRef,
  RELAY_WALLET_SOURCE_REF_PREFIX,
} from "./relay-wallet-bank-feed.service.js";

describe("relay-wallet-bank-feed helpers", () => {
  it("builds stable source_ref for idempotent upsert", () => {
    expect(relayWalletSourceRef("txn_AoHBcvx777MZEY")).toBe(
      `${RELAY_WALLET_SOURCE_REF_PREFIX}txn_AoHBcvx777MZEY`,
    );
  });

  it("finds trailer/reefer prompts case-insensitively", () => {
    expect(
      findPromptValue(
        [
          { label: "Truck #", value: "T172" },
          { label: "Reefer #", value: "R44" },
        ],
        ["Trailer #", "Reefer #", "Reefer"],
      ),
    ).toBe("R44");
  });

  it("returns null when prompt missing", () => {
    expect(findPromptValue([{ label: "Truck #", value: "T172" }], ["Trailer #"])).toBeNull();
  });
});
