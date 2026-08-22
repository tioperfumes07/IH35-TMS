import { describe, expect, it } from "vitest";
import manifestSource from "../manifest.tsx?raw";

// modsweep-lists-1: the bare /lists/chart-of-accounts path fell through the dynamic /lists/:domain route and
// rendered nothing (LISTS-1). An explicit redirect Route to the canonical /lists/accounting/chart-of-accounts
// fixed it. This regression test keeps that redirect present so the fall-through can't silently return.
describe("/accounting/chart-of-accounts redirect (Live Chrome CoA fall-through)", () => {
  it("redirects /accounting/chart-of-accounts to the canonical lists CoA (does not fall through to Home)", () => {
    const redirectRoute =
      manifestSource.match(/path="\/accounting\/chart-of-accounts"[\s\S]{0,600}?\/>/)?.[0] ?? "";
    expect(redirectRoute).not.toBe("");
    expect(redirectRoute).toContain("Navigate");
    expect(redirectRoute).toMatch(/to="\/lists\/accounting\/chart-of-accounts"/);
    expect(redirectRoute).toContain("replace");
  });
});

describe("/lists/chart-of-accounts redirect (LISTS-1 regression)", () => {
  it("redirects the bare /lists/chart-of-accounts to the canonical /lists/accounting/chart-of-accounts", () => {
    const redirectRoute = manifestSource.match(/path="\/lists\/chart-of-accounts"[\s\S]{0,200}?\/>/)?.[0] ?? "";
    expect(redirectRoute).not.toBe("");
    expect(redirectRoute).toContain("Navigate");
    expect(redirectRoute).toMatch(/to="\/lists\/accounting\/chart-of-accounts"/);
    expect(redirectRoute).toContain("replace");
  });
});
