import { describe, expect, it, vi } from "vitest";
import { createEmailProviderFromEnv } from "../factory.js";
import { computeNextRetryAt } from "../queue.service.js";
import { renderEmailTemplate } from "../render.js";

describe("email queue backoff", () => {
  it("computeNextRetryAt uses exponential minute backoff", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(computeNextRetryAt(base, 1).getTime() - base.getTime()).toBe(60_000);
    expect(computeNextRetryAt(base, 2).getTime() - base.getTime()).toBe(120_000);
    expect(computeNextRetryAt(base, 3).getTime() - base.getTime()).toBe(240_000);
  });
});

describe("email provider factory", () => {
  it("defaults to console when EMAIL_PROVIDER unset", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    const provider = createEmailProviderFromEnv();
    expect(provider.kind).toBe("console");
  });
});

describe("email templates (eta)", () => {
  it("renders driver-invite with escaped values", () => {
    const rendered = renderEmailTemplate("driver-invite", {
      driverName: "Ada<script>",
      loginUrl: "https://example.test/login",
      ownerName: "IH35",
      supportEmail: "help@example.test",
    });
    expect(rendered.html).toContain("Ada&lt;script&gt;");
    expect(rendered.html).toContain("https://example.test/login");
  });

  it("renders report-cadence with raw htmlBody", () => {
    const rendered = renderEmailTemplate("report-cadence", {
      subject: "Daily report",
      htmlBody: "<table><tr><td><b>OK</b></td></tr></table>",
      textBody: "OK",
    });
    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain("<b>OK</b>");
  });
});
