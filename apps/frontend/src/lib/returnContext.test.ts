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

  it("Fuel By-truck period+q → History → Back restores origin cohort", () => {
    const origin = currentOriginHref("/fuel/by-truck", "?period=oct&q=unit-12");
    const history = withReturnContext(
      "/fuel/history?unit_id=u1&from=2026-10-01&to=2026-10-31",
      origin,
    );
    const params = new URLSearchParams(history.slice(history.indexOf("?") + 1));
    expect(params.get("unit_id")).toBe("u1");
    expect(
      resolveBackHref({
        searchParams: params,
        pathname: "/fuel/history",
        fallback: "/fuel",
      }),
    ).toBe("/fuel/by-truck?period=oct&q=unit-12");
  });

  it("Fuel History transaction_id drill keeps History filters in ret for Back", () => {
    const historyOrigin = currentOriginHref(
      "/fuel/history",
      "?unit_id=u1&from=2026-10-01&to=2026-10-31&q=diesel",
    );
    const deep = withReturnContext(
      "/fuel/history?transaction_id=tx-9&unit_id=u1&from=2026-10-01&to=2026-10-31&q=diesel",
      historyOrigin,
    );
    const params = new URLSearchParams(deep.slice(deep.indexOf("?") + 1));
    expect(params.get("transaction_id")).toBe("tx-9");
    expect(
      resolveBackHref({
        searchParams: params,
        pathname: "/fuel/history",
        fallback: "/fuel",
      }),
    ).toBe("/fuel/history?unit_id=u1&from=2026-10-01&to=2026-10-31&q=diesel");
  });
});
