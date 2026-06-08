import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FreshnessIndicator,
  formatFreshnessAge,
  freshnessColor,
  tierLabel,
} from "./FreshnessIndicator";

const NOW = Date.parse("2026-06-07T12:00:00.000Z");

describe("FreshnessIndicator (GAP-24)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("renders green for L1 data younger than 30s", () => {
    render(
      <FreshnessIndicator
        lastFetchedAt="2026-06-07T11:59:45.000Z"
        cacheTier={1}
      />
    );
    const pill = screen.getByTitle(/Samsara data: 15s ago \(L1\)/);
    expect(pill).toHaveAttribute("data-freshness-color", "green");
    expect(pill).toHaveTextContent("L1");
    expect(pill).toHaveTextContent("15s");
  });

  it("renders amber for L3 tier within 2 minutes", () => {
    render(
      <FreshnessIndicator
        lastFetchedAt="2026-06-07T11:59:00.000Z"
        cacheTier={3}
      />
    );
    const pill = screen.getByTitle(/Samsara data: 1m ago \(L3\)/);
    expect(pill).toHaveAttribute("data-freshness-color", "amber");
    expect(pill).toHaveTextContent("L3");
    expect(pill).toHaveTextContent("1m");
  });

  it("renders red for data older than 2 minutes", () => {
    render(
      <FreshnessIndicator
        lastFetchedAt="2026-06-07T11:57:00.000Z"
        cacheTier={2}
      />
    );
    const pill = screen.getByTitle(/Samsara data: 3m ago \(L2\)/);
    expect(pill).toHaveAttribute("data-freshness-color", "red");
  });

  it("renders red for L4 tier or unknown freshness", () => {
    render(<FreshnessIndicator lastFetchedAt="2026-06-07T11:59:50.000Z" cacheTier={4} />);
    expect(screen.getByTitle(/Samsara data: 10s ago \(L4\)/)).toHaveAttribute("data-freshness-color", "red");

    render(<FreshnessIndicator lastFetchedAt={null} cacheTier={2} />);
    expect(screen.getAllByTitle(/Samsara data: stale/)[0]).toHaveAttribute("data-freshness-color", "red");
  });
});

describe("freshnessColor thresholds", () => {
  it("classifies L2 under 30s as green", () => {
    expect(
      freshnessColor("2026-06-07T11:59:40.000Z", 2, NOW)
    ).toBe("green");
  });

  it("classifies L2 between 30s and 2min as amber", () => {
    expect(
      freshnessColor("2026-06-07T11:59:20.000Z", 2, NOW)
    ).toBe("amber");
  });

  it("classifies stale timestamps and null tier as red", () => {
    expect(freshnessColor(null, 1, NOW)).toBe("red");
    expect(freshnessColor("2026-06-07T11:59:50.000Z", null, NOW)).toBe("red");
    expect(freshnessColor("2026-06-07T11:57:00.000Z", 3, NOW)).toBe("red");
  });
});

describe("freshness helpers", () => {
  it("formats age in seconds and minutes", () => {
    expect(formatFreshnessAge("2026-06-07T11:59:50.000Z", NOW)).toBe("10s");
    expect(formatFreshnessAge("2026-06-07T11:58:00.000Z", NOW)).toBe("2m");
    expect(formatFreshnessAge(null, NOW)).toBe("stale");
  });

  it("labels cache tiers L1-L4", () => {
    expect(tierLabel(1)).toBe("L1");
    expect(tierLabel(4)).toBe("L4");
    expect(tierLabel(null)).toBe("L?");
  });
});
