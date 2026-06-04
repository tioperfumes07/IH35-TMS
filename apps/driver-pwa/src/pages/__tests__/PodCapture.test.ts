import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPodCaptureComplete } from "../../components/PodCapture";

describe("PodCapture (B21-D10)", () => {
  const componentPath = resolve(import.meta.dirname, "../../components/PodCapture.tsx");
  const apiPath = resolve(import.meta.dirname, "../../api/pod.ts");

  it("exports PodCapture with photo, signature, and submit flow", () => {
    const src = readFileSync(componentPath, "utf8");
    expect(src).toContain("export function PodCapture");
    expect(src).toContain("SignaturePad");
    expect(src).toContain("capture=\"environment\"");
    expect(src).toContain("data-testid=\"pod-capture-panel\"");
    expect(src).toContain("submitPodCapture");
  });

  it("requires signature before POD submission and posts to driver API", () => {
    expect(isPodCaptureComplete("", null)).toBe(false);
    expect(isPodCaptureComplete("data:image/png;base64,abc", null)).toBe(true);
    const api = readFileSync(apiPath, "utf8");
    expect(api).toContain("/api/v1/driver/loads/");
    expect(api).toContain("/pod");
    expect(api).toContain("signature_base64");
  });
});
