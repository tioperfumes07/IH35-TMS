/**
 * P0 REGRESSION — a tracker payload missing `hops`/`scenarios` must NOT crash the page that hosts it.
 *
 * HISTORY (why this file exists here, and why it is not the old one): the original P0 was
 * ScenarioTrackerPanel mounted unconditionally on OwnerHome — an unguarded spread of a payload that
 * legitimately omits those arrays (the endpoint omits them when audit.scenario_status has no current
 * rows) threw, escaped to the page error boundary, and took the ENTIRE owner homepage down in
 * production. Its regression test lived in components/home/ScenarioTrackerPanel.test.tsx.
 *
 * The owner moved the tracker off Home entirely (2026-08-05), which orphaned that component, so it
 * and its test were removed. That is exactly the moment a protection gets silently dropped — the
 * crash class does not disappear just because the component did: ScenarioTrackerHome consumes the
 * SAME payload shape and is now mounted on /program. So the protection moves with the behaviour.
 *
 * NOT A COPY OF THE OLD TEST, AND THE OLD BREAKAGE WAS MINE. I reported those 3 failures as
 * "pre-existing, not mine" after stashing my changes and re-running on origin/main. That check was
 * WRONG: main already contained my merged #4475, which added `import { Link } from "react-router-dom"`
 * to the panel (verified: `git show 2228b99f0^:...ScenarioTrackerPanel.tsx` has NO router usage;
 * `git show 2228b99f0:...` has it). The panel test rendered without a MemoryRouter, so every test in
 * it died on "Cannot destructure property 'basename'" — including the P0 crash test. Adding a <Link>
 * to a component silently took its whole test file down, and stashing cannot detect a cause that is
 * already merged.
 *
 * Hence the MemoryRouter wrapper below — the fix the old file never got — and hence this note: the
 * old test was deleted with its component, not because it was inconvenient.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ScenarioTrackerHome, allHopsGreen } from "./ScenarioTrackerHome";
import * as api from "./api";

function renderWithClient() {
  // retry:false — a failed query must surface immediately instead of stalling the assertion.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // MemoryRouter is REQUIRED: the component renders <Link>s, and react-router throws
  // "Cannot destructure property 'basename'" without a router context. This is exactly what broke
  // the old panel test — see the header note.
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ScenarioTrackerHome />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ScenarioTrackerHome", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("P0: renders without throwing when the payload omits hops/scenarios", async () => {
    // The real shape the endpoint returns when audit.scenario_status has no current rows.
    vi.spyOn(api, "fetchScenarioTracker").mockResolvedValue({
      generated_at_utc: new Date(0).toISOString(),
      generated_at_ct: "01/01/1970 12:00 AM CT",
      max_age_seconds: 20,
      entity_scope: "ALL",
      source_health: [],
    } as never);

    renderWithClient();

    // The page frame must still be there — degraded to empty, never crashed.
    await waitFor(() => expect(screen.getByText(/Scenario Tracker/i)).toBeTruthy());
  });

  it("does not treat an empty payload as all-green (that would stop polling on a failed read)", () => {
    expect(allHopsGreen(undefined)).toBe(false);
    expect(allHopsGreen({ hops: [], scenarios: [] } as never)).toBe(false);
  });

  it("is all-green only when every hop AND scenario has reached passed/complete and is done", () => {
    const green = { key: "k", title: "t", lane: "money", stage: "passed", state: "done" };
    const amber = { key: "k2", title: "t2", lane: "money", stage: "merged", state: "go" };
    expect(allHopsGreen({ hops: [green], scenarios: [green] } as never)).toBe(true);
    expect(allHopsGreen({ hops: [green], scenarios: [amber] } as never)).toBe(false);
    // 'fix' at a green stage is still not green — a regressed hop must resume polling.
    expect(
      allHopsGreen({ hops: [{ ...green, state: "fix" }], scenarios: [green] } as never)
    ).toBe(false);
  });
});
