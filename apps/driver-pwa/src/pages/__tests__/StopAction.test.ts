import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const stopActionPath = resolve(import.meta.dirname, "../StopAction.tsx");

describe("StopAction (INFRA-3)", () => {
  const src = readFileSync(stopActionPath, "utf8");

  it("delivery stop shows POD capture CTA when arrived without document", () => {
    expect(src).toContain('status === "arrived" && !hasDoc && resolvedStop.type === "delivery" && !podOpen');
    expect(src).toContain('t("pod.capture_cta")');
    expect(src).not.toMatch(/resolvedStop\.stop_type/);
  });

  it("pickup stop shows upload BOL/POD when arrived without document", () => {
    expect(src).toContain('status === "arrived" && !hasDoc && resolvedStop.type !== "delivery"');
    expect(src).toContain('t("stop.upload_bol_pod")');
    expect(src).toContain("setUploadOpen(true)");
  });

  it("delivery stop renders PodCapture when pod flow is open", () => {
    expect(src).toContain('status === "arrived" && podOpen && resolvedStop.type === "delivery"');
    expect(src).toContain("<PodCapture");
    expect(src).toContain("onCaptured");
  });
});
