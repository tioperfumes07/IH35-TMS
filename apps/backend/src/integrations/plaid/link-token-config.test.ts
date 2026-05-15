import { Products } from "plaid";
import { describe, expect, it } from "vitest";
import { buildLinkTokenCreateCore } from "./link-token-config.js";

describe("buildLinkTokenCreateCore", () => {
  it("bank prefers ACH-capable accounts via Auth + Transactions and checking/savings filters", () => {
    const cfg = buildLinkTokenCreateCore("bank");
    expect(cfg.products).toContain(Products.Auth);
    expect(cfg.products).toContain(Products.Transactions);
    expect(cfg.account_filters?.depository?.account_subtypes?.length).toBeGreaterThan(0);
    expect(cfg.account_filters?.credit).toBeUndefined();
  });

  it("credit_card omits Auth and scopes credit cards only", () => {
    const cfg = buildLinkTokenCreateCore("credit_card");
    expect(cfg.products).toEqual([Products.Transactions]);
    expect(cfg.account_filters?.credit?.account_subtypes?.length).toBe(1);
    expect(cfg.account_filters?.depository).toBeUndefined();
  });

  it("all connects broadly via Transactions without subtype filters", () => {
    const cfg = buildLinkTokenCreateCore("all");
    expect(cfg.products).toEqual([Products.Transactions]);
    expect(cfg.account_filters).toBeUndefined();
  });
});
