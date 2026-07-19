import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeQboSyncHealth } from "../../../api/home";
import { QboSyncHealthCard } from "../QboSyncHealthCard";

function renderCard(data: HomeQboSyncHealth) {
  render(
    <MemoryRouter>
      <QboSyncHealthCard data={data} isLoading={false} isError={false} onRetry={vi.fn()} />
    </MemoryRouter>
  );
}

describe("QboSyncHealthCard freshness", () => {
  beforeEach(() => {
    // Pin wall clock so formatRelative(last run) matches the fixture age (62d), independent of CI date.
    vi.useFakeTimers({ now: new Date("2026-07-18T20:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never displays Healthy when the backend marks the last successful sync stale", () => {
    renderCard({
      latest_run: {
        status: "success",
        started_at: "2026-05-17T00:50:00.000Z",
        completed_at: "2026-05-17T00:52:05.416Z",
        run_kind: "vendor",
      },
      last_success_at: "2026-05-17T00:52:05.416Z",
      last_success_source: "master_data_cdc",
      last_success_age_seconds: 62 * 24 * 60 * 60,
      stale_after_seconds: 24 * 60 * 60,
      freshness_status: "stale",
      is_stale: true,
      open_alerts_count: 0,
      failed_outbox_count: 0,
      high_severity_alerts_count: 0,
      last_updated: "2026-07-18T20:00:00.000Z",
    });

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
    expect(screen.getAllByText("62d ago")).toHaveLength(2);
    expect(screen.getByText("Master-data CDC")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
  });

  it("keeps failed runs critical even when an older success is fresh", () => {
    renderCard({
      latest_run: {
        status: "failed",
        started_at: "2026-07-18T19:59:00.000Z",
        completed_at: "2026-07-18T20:00:00.000Z",
        run_kind: "full",
      },
      last_success_at: "2026-07-18T19:30:00.000Z",
      last_success_source: "qbo_sync_runs",
      last_success_age_seconds: 30 * 60,
      stale_after_seconds: 24 * 60 * 60,
      freshness_status: "fresh",
      is_stale: false,
      open_alerts_count: 0,
      failed_outbox_count: 0,
      high_severity_alerts_count: 0,
      last_updated: "2026-07-18T20:00:00.000Z",
    });

    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
