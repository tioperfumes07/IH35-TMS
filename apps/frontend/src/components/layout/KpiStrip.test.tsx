import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KpiStrip } from "./KpiStrip";

afterEach(cleanup);

describe("KpiStrip responsive rows", () => {
  it("allows all responsive rows to contribute to the strip height", () => {
    render(<KpiStrip>{Array.from({ length: 6 }, (_, index) => <div key={index}>Metric {index}</div>)}</KpiStrip>);
    const strip = screen.getByTestId("kpi-strip");
    expect(strip.style.maxHeight).toBe("");
    expect(strip.className).toContain("grid-cols-2");
    expect(strip.className).toContain("sm:grid-cols-3");
    expect(strip.className).toContain("lg:grid-cols-6");
    expect(strip.children).toHaveLength(6);
  });
});
