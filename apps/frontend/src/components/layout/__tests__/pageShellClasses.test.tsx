import { describe, expect, it } from "vitest";
import { MODAL_PANEL_NARROW_CLASS, MODAL_PANEL_WIDE_CLASS, PAGE_SHELL_CLASS } from "../pageShellClasses";

describe("pageShellClasses", () => {
  it("PAGE_SHELL uses 2xl cap and responsive horizontal padding", () => {
    expect(PAGE_SHELL_CLASS).toContain("max-w-screen-2xl");
    expect(PAGE_SHELL_CLASS).toContain("mx-auto");
    expect(PAGE_SHELL_CLASS).toContain("px-4");
    expect(PAGE_SHELL_CLASS).toContain("sm:px-6");
    expect(PAGE_SHELL_CLASS).toContain("lg:px-8");
  });

  it("MODAL_PANEL_WIDE caps at 1260px and viewport minus gutter", () => {
    expect(MODAL_PANEL_WIDE_CLASS).toContain("1260px");
    expect(MODAL_PANEL_WIDE_CLASS).toContain("100vw-2rem");
  });

  it("MODAL_PANEL_NARROW caps at 720px and viewport minus gutter", () => {
    expect(MODAL_PANEL_NARROW_CLASS).toContain("720px");
    expect(MODAL_PANEL_NARROW_CLASS).toContain("100vw-2rem");
  });
});
