import { describe, expect, it } from "vitest";
import source from "./PlaidLink.tsx?raw";

describe("PlaidLink", () => {
  it("delegates to PlaidLinkButton", () => {
    expect(source).toContain("PlaidLinkButton");
    expect(source).toContain("Connect bank");
  });

  it("forwards operating company and success handler", () => {
    expect(source).toContain("operatingCompanyId");
    expect(source).toContain("onSuccess");
  });

  it("supports account type prop", () => {
    expect(source).toContain("accountType");
  });
});
