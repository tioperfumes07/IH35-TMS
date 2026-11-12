import { describe, expect, it } from "vitest";
import {
  RETURN_PARAM,
  currentOriginHref,
  decodeReturnContext,
  encodeReturnContext,
  mergeUrlBoardState,
  resolveBackHref,
  withReturnContext,
} from "./returnContext";

describe("returnContext (ROUND 8.17 class R)", () => {
  it("encodes and decodes origin with tab/filters/period", () => {
    const origin = "/cash-flow?tab=rolling&rl_from=2026-11-03&scenario=base";
    const encoded = encodeReturnContext(origin);
    expect(decodeReturnContext(encoded)).toBe(origin);
  });

  it("rejects unsafe decoded values", () => {
    expect(decodeReturnContext(encodeURIComponent("https://evil.example/x"))).toBeNull();
    expect(decodeReturnContext(encodeURIComponent("//evil.example"))).toBeNull();
    expect(decodeReturnContext("not-encoded-%")).toBeNull();
  });

  it("withReturnContext attaches ret and preserves other params + hash", () => {
    const out = withReturnContext(
      "/accounting/invoices/abc?tab=payments#apps",
      "/cash-flow?tab=rolling&week=2026-11-03",
    );
    expect(out).toContain("/accounting/invoices/abc?");
    expect(out).toContain("tab=payments");
    expect(out).toContain(`${RETURN_PARAM}=`);
    expect(out.endsWith("#apps")).toBe(true);
    const q = new URLSearchParams(out.slice(out.indexOf("?") + 1, out.indexOf("#")));
    expect(decodeReturnContext(q.get(RETURN_PARAM))).toBe("/cash-flow?tab=rolling&week=2026-11-03");
  });

  it("resolveBackHref prefers ret even across modules (Cash Flow → Invoice)", () => {
    const origin = "/cash-flow?tab=rolling&rl_from=2026-11-03&scenario=base";
    const params = new URLSearchParams();
    params.set(RETURN_PARAM, encodeReturnContext(origin));
    expect(
      resolveBackHref({
        searchParams: params,
        pathname: "/accounting/invoices/abc",
        fallback: "/accounting/invoices",
      }),
    ).toBe(origin);
  });

  it("resolveBackHref falls back to in-module parent when ret absent", () => {
    expect(
      resolveBackHref({
        searchParams: new URLSearchParams(),
        pathname: "/accounting/invoices/abc",
        fallback: "/accounting/invoices",
      }),
    ).toBe("/accounting/invoices");
  });

  it("currentOriginHref + mergeUrlBoardState keep filters in the URL", () => {
    expect(currentOriginHref("/reports/driver-settlements", "?group=driver&status=unpaid")).toBe(
      "/reports/driver-settlements?group=driver&status=unpaid",
    );
    expect(mergeUrlBoardState("?group=driver", { status: "unpaid", group: null })).toBe("?status=unpaid");
  });
});
