import { describe, expect, it, beforeEach } from "vitest";
import {
  clearPartyCreateParams,
  partyBoardReturnHref,
  partyCreateParams,
  rememberPartyBoardReturn,
} from "./partyBoardReturn";

describe("partyBoardReturn", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("Create from board preserves chip and stamps view+create", () => {
    const next = partyCreateParams(new URLSearchParams("chip=factored&range=ytd"));
    expect(next.get("chip")).toBe("factored");
    expect(next.get("range")).toBe("ytd");
    expect(next.get("view")).toBe("detail");
    expect(next.get("create")).toBe("1");
  });

  it("Close Create drops view+create and keeps chip", () => {
    const next = clearPartyCreateParams(new URLSearchParams("chip=open_bills&view=detail&create=1"));
    expect(next.get("create")).toBeNull();
    expect(next.get("view")).toBeNull();
    expect(next.get("chip")).toBe("open_bills");
  });

  it("detail Back restores remembered board chip URL", () => {
    rememberPartyBoardReturn("customers", "/customers?chip=factored");
    expect(partyBoardReturnHref("customers")).toBe("/customers?chip=factored");
    rememberPartyBoardReturn("vendors", "/vendors?chip=open_bills");
    expect(partyBoardReturnHref("vendors")).toBe("/vendors?chip=open_bills");
  });

  it("rejects off-kind hrefs and falls back", () => {
    rememberPartyBoardReturn("customers", "/vendors?chip=open_bills");
    expect(partyBoardReturnHref("customers")).toBe("/customers");
  });
});
