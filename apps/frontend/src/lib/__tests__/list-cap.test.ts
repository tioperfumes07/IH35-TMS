import { describe, expect, it } from "vitest";
import { capNotice, listCapInfo } from "../list-cap";

describe("listCapInfo — exact branch (server returned a total)", () => {
  it("reports truncation and the exact hidden count", () => {
    const info = listCapInfo(500, 500, 4213);
    expect(info).toMatchObject({ truncated: true, exact: true, total: 4213, hiddenCount: 3713 });
  });

  it("is NOT truncated when the total fits inside the page", () => {
    const info = listCapInfo(12, 500, 12);
    expect(info).toMatchObject({ truncated: false, exact: true, hiddenCount: 0 });
    expect(capNotice(info)).toBeNull();
  });

  // The heuristic branch would call this truncated; the total proves it is not. This is the whole
  // reason `total` is preferred over `received >= limit`.
  it("a full page that is genuinely the whole set is NOT truncated when a total says so", () => {
    const info = listCapInfo(500, 500, 500);
    expect(info.truncated).toBe(false);
    expect(info.exact).toBe(true);
  });
});

describe("listCapInfo — heuristic branch (no total available)", () => {
  it("infers truncation when the page came back full", () => {
    const info = listCapInfo(500, 500);
    expect(info).toMatchObject({ truncated: true, exact: false, total: null, hiddenCount: null });
  });

  it("does not infer truncation on a short page", () => {
    expect(listCapInfo(37, 500).truncated).toBe(false);
  });

  // DOCUMENTED BLIND SPOT, asserted so it cannot regress into a false promise.
  // If the client asks for 500 and the server silently caps at 200, `received=200 / limit=500` is
  // indistinguishable from "there were only 200 rows". No amount of arithmetic on these two numbers
  // recovers the difference — it needs a server `total` (or the server echoing its effective cap).
  // The helper therefore reports NOT truncated here, and that is the honest answer, not a bug.
  it("CANNOT detect a server-side lower cap without a total — and reports so honestly", () => {
    const info = listCapInfo(200, 500);
    expect(info.truncated).toBe(false);
    expect(info.exact).toBe(false);
    // The same case WITH a total is caught exactly — which is why `total` is always preferred.
    expect(listCapInfo(200, 500, 4213).truncated).toBe(true);
  });

  it("treats a null/undefined total as no-total rather than zero", () => {
    expect(listCapInfo(10, 500, null).exact).toBe(false);
    expect(listCapInfo(10, 500, undefined).exact).toBe(false);
  });
});

describe("capNotice", () => {
  it("names the real numbers when they are known", () => {
    expect(capNotice(listCapInfo(500, 500, 4213), "customers")).toBe(
      "Showing 500 of 4213 customers. 3713 not shown — search to narrow.",
    );
  });

  // Guard against inventing a count we do not have — the heuristic wording must stay vague.
  it("does NOT state a hidden count when the number is unknown", () => {
    const notice = capNotice(listCapInfo(500, 500), "units");
    expect(notice).toBe("Showing the first 500 units. There may be more — search to narrow.");
    expect(notice).not.toMatch(/\d+ not shown/);
  });

  it("returns null when nothing is hidden, so callers render nothing", () => {
    expect(capNotice(listCapInfo(3, 500, 3))).toBeNull();
  });
});
