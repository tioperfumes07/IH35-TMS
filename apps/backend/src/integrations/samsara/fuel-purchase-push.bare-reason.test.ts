import { describe, expect, it } from "vitest";
import { BARE_HTTP_REASON } from "./fuel-purchase-push.service";

// E-23: a failure without Samsara's reason is retried once (so the reason is captured); one WITH the reason is final.
describe("E-23 fuel push — which 4xx failures are final", () => {
  it("the pre-#29687 bare status text is NOT final", () => {
    expect(BARE_HTTP_REASON.test("samsara_fuel_purchase_http_400:http_400")).toBe(true);
    expect(BARE_HTTP_REASON.test("samsara_fuel_purchase_http_400")).toBe(true);
  });
  it("a failure carrying Samsara's own reason is final", () => {
    expect(BARE_HTTP_REASON.test("samsara_fuel_purchase_http_400: transactionReference already exists:http_400")).toBe(false);
  });
});
