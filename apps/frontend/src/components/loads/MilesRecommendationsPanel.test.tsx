import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MilesRecommendationsPanel } from "./MilesRecommendationsPanel";
import type { MilesRecommendations } from "../../api/milesRecommendations";

// 443.55: the Load screen renders BOTH recommendations (Historical + Google) for every miles field, says why when a source
// has no value (never blank, never 0), and a Manual value cannot be saved without a reason.

const data: MilesRecommendations = {
  load_id: "load-1",
  fields: {
    practical: {
      current: { value: 812, source: "document", chosen_by: "Owner", chosen_at: "2026-10-11T12:00:00Z", reason: null },
      historical: { value: 805, n_loads: 14, min: 790, max: 830, last_seen: "2026-10-01", confidence: "High", autofill_allowed: true, untrustworthy_reason: null },
      historical_missing_reason: null,
      google: { value: 798.4, fetched_at: "2026-10-11T12:00:00Z" },
      google_missing_reason: null,
      difference: -6.6,
      default_source: "document",
    },
    short: {
      current: null,
      historical: null,
      historical_missing_reason: "no history for this lane",
      google: { value: 760, fetched_at: "2026-10-11T12:00:00Z" },
      google_missing_reason: null,
      difference: null,
      default_source: "google",
    },
    empty: {
      current: null,
      historical: { value: 42, n_loads: 3, min: 30, max: 55, last_seen: null, confidence: "Thin", autofill_allowed: false, untrustworthy_reason: null },
      historical_missing_reason: null,
      google: null,
      google_missing_reason: "Google had no route",
      difference: null,
      default_source: "historical",
    },
  },
};

describe("MilesRecommendationsPanel (443.55)", () => {
  it("renders the Historical and Google blocks for each of Practical, Short and Empty/Deadhead", () => {
    render(<MilesRecommendationsPanel data={data} onChoose={vi.fn()} />);
    for (const f of ["practical", "short", "empty"]) {
      expect(screen.getByTestId(`miles-historical-${f}`)).toBeTruthy();
      expect(screen.getByTestId(`miles-google-${f}`)).toBeTruthy();
    }
    expect(within(screen.getByTestId("miles-historical-practical")).getByText("avg of 14 loads")).toBeTruthy();
    expect(within(screen.getByTestId("miles-google-practical")).getByText("798.4 mi")).toBeTruthy();
  });

  it("shows the missing-source reason instead of a blank or a zero", () => {
    render(<MilesRecommendationsPanel data={data} onChoose={vi.fn()} />);
    expect(within(screen.getByTestId("miles-historical-short")).getByText("no history for this lane")).toBeTruthy();
    expect(within(screen.getByTestId("miles-google-empty")).getByText("Google had no route")).toBeTruthy();
    expect(within(screen.getByTestId("miles-google-empty")).queryByText(/^0/)).toBeNull();
    expect((screen.getByTestId("miles-pick-short-historical") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("miles-pick-empty-google") as HTMLButtonElement).disabled).toBe(true);
  });

  it("picks a source per field", () => {
    const onChoose = vi.fn();
    render(<MilesRecommendationsPanel data={data} onChoose={onChoose} />);
    fireEvent.click(screen.getByTestId("miles-pick-short-google"));
    fireEvent.click(screen.getByTestId("miles-pick-practical-historical"));
    expect(onChoose).toHaveBeenCalledWith({ field: "short", source: "google" });
    expect(onChoose).toHaveBeenCalledWith({ field: "practical", source: "historical" });
  });

  it("refuses a Manual value without a reason", () => {
    const onChoose = vi.fn();
    render(<MilesRecommendationsPanel data={data} onChoose={onChoose} />);
    fireEvent.click(screen.getByTestId("miles-pick-empty-manual"));
    fireEvent.change(screen.getByLabelText("Empty / Deadhead manual miles"), { target: { value: "61" } });
    fireEvent.click(screen.getByTestId("miles-manual-save-empty"));
    expect(screen.getByRole("alert").textContent).toMatch(/reason is required/i);
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Empty / Deadhead manual reason"), { target: { value: "yard move" } });
    fireEvent.click(screen.getByTestId("miles-manual-save-empty"));
    expect(onChoose).toHaveBeenCalledWith({ field: "empty", source: "manual", manual_value: 61, reason: "yard move" });
  });

  it("read-only shows both recommendations without the selector", () => {
    render(<MilesRecommendationsPanel data={data} readOnly />);
    expect(screen.queryByTestId("miles-pick-practical-google")).toBeNull();
    expect(screen.getByTestId("miles-google-short")).toBeTruthy();
  });

  it("shows an error state when the endpoint fails", () => {
    render(<MilesRecommendationsPanel data={undefined} error="404" />);
    expect(screen.getByTestId("miles-recs-error").textContent).toMatch(/unavailable/);
  });
});
