/**
 * P0 REGRESSION — a tracker payload missing `hops`/`scenarios` must NOT crash the page hosting it.
 *
 * THE P0: the endpoint legitimately omits those arrays when `audit.scenario_status` has no current
 * rows. Spreading them unguarded threw, escaped to the page error boundary, and took the ENTIRE owner
 * homepage down in production. The regression test for it lived in
 * components/home/ScenarioTrackerPanel.test.tsx.
 *
 * WHY IT IS BEING RE-ESTABLISHED HERE, AND WHOSE FAULT THAT IS — MINE:
 * PR #4475 added `import { Link } from "react-router-dom"` to ScenarioTrackerPanel. That panel's test
 * rendered it with NO router context, so react-router threw
 *   "Cannot destructure property 'basename' of useContext(...) as it is null"
 * and ALL THREE of its tests died — including the P0 case. Verified by diffing across that merge:
 *   git show 2228b99f0^:apps/frontend/src/components/home/ScenarioTrackerPanel.tsx  -> no router refs
 *   git show 2228b99f0:apps/frontend/src/components/home/ScenarioTrackerPanel.tsx   -> Link imported
 * I first reported those failures as "pre-existing, not mine" after stashing my working changes and
 * re-running against origin/main. That method CANNOT detect a cause that is already merged, and mine
 * was. The P0 therefore sat unprotected, by my hand, while I logged it as someone else's breakage.
 * The durable lesson is the method: to attribute a failure, diff the component across the suspect
 * merge commit — do not stash-and-rerun.
 *
 * This asserts the invariant against ScenarioTrackerHome, which consumes the SAME payload shape and
 * is the surface the owner is standardising on. MemoryRouter is mandatory here: this component
 * renders <Link>s, and its absence is precisely what silently killed the previous file.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScenarioTrackerHome } from "./ScenarioTrackerHome";
import * as api from "./api";

function renderTracker() {
  return render(
    <MemoryRouter>
      <ScenarioTrackerHome />
    </MemoryRouter>
  );
}

describe("ScenarioTrackerHome — P0 payload resilience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders without throwing when the payload omits hops/scenarios", async () => {
    vi.spyOn(api, "fetchScenarioTracker").mockResolvedValue({
      generated_at_utc: new Date().toISOString(),
      generated_at_ct: "01/01/2026 12:00 AM CT",
      max_age_seconds: 20,
      entity_scope: "ALL",
      source_health: [],
    } as never);

    renderTracker();

    // Degraded to empty, never crashed — the page frame must still be present.
    await waitFor(() => expect(screen.getByText(/Scenario Tracker/i)).toBeTruthy());
  });

  it("renders without throwing when the fetch itself rejects", async () => {
    // The other half of the same class: a failed read must not take the host page down either.
    vi.spyOn(api, "fetchScenarioTracker").mockRejectedValue(new Error("endpoint down"));

    renderTracker();

    await waitFor(() => expect(screen.getByText(/Scenario Tracker/i)).toBeTruthy());
  });
});
