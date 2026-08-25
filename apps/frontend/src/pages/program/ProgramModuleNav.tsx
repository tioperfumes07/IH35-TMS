/**
 * Program module top-bar tabs — PROG-NAV-01 door for every Program surface.
 *
 * Sidebar PROGRAM lands on /program (Scenario Tracker). Without this row, Module matrix
 * (/program/matrix) is URL-only — the exact defect the owner hit 2026-08-08.
 *
 * Links use literal string paths in `to="..."` (not `to={var}`) so verify-scenario-tracker-reachable can
 * prove the door exists with a static regex — same pattern as PROG-NAV-01's original fix.
 */
import { Link, useNavigate } from "react-router-dom";
import "./program-module-nav.css";
import { hasInAppHistory } from "../../lib/smart-back";

export type ProgramNavTab =
  | "scenario"
  | "matrix"
  | "legacy"
  | "tracker"
  | "modules"
  | "final";

export function ProgramModuleNav({ active }: { active: ProgramNavTab }) {
  const navigate = useNavigate();
  return (
    <nav className="program-module-nav" data-testid="program-module-nav" aria-label="Program module">
      {/*
        UI-BACK-BUTTON-MISSING-ENTIRELY: none of the 3 pages that render this shared nav strip
        (ScenarioTrackerHome, ModuleMatrixPreviewPage, LegacyAuditScoreboardPage) had any back
        control -- added here, once, instead of in each page, since this nav is already the one
        thing all of them share. Existing tab <Link>s keep their literal to="..." strings unchanged
        (verify-scenario-tracker-reachable depends on that static shape).
      */}
      <button
        type="button"
        aria-label="Back"
        onClick={() => {
          if (hasInAppHistory(window.history.state)) {
            navigate(-1);
            return;
          }
          navigate("/home");
        }}
        className="program-module-nav__tab"
        style={{ border: 0, background: "transparent", cursor: "pointer" }}
      >
        ← Back
      </button>
      {active === "scenario" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-scenario">
          Scenario tracker
        </span>
      ) : (
        <Link className="program-module-nav__tab" to="/program" data-testid="program-nav-scenario">
          Scenario tracker
        </Link>
      )}
      {active === "matrix" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-matrix">
          Module matrix
        </span>
      ) : (
        <Link className="program-module-nav__tab" to="/program/matrix" data-testid="program-nav-matrix">
          Module matrix
        </Link>
      )}
      {active === "legacy" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-legacy">
          Legacy certification board
        </span>
      ) : (
        <Link
          className="program-module-nav__tab"
          to="/program/legacy-scoreboard"
          data-testid="program-nav-legacy"
        >
          Legacy certification board
        </Link>
      )}
      {active === "tracker" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-tracker">
          Build progress
        </span>
      ) : (
        <Link className="program-module-nav__tab" to="/program/tracker" data-testid="program-nav-tracker">
          Build progress
        </Link>
      )}
      {active === "modules" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-modules">
          Module completion
        </span>
      ) : (
        <Link className="program-module-nav__tab" to="/program/modules" data-testid="program-nav-modules">
          Module completion
        </Link>
      )}
      {active === "final" ? (
        <span className="program-module-nav__tab is-active" data-testid="program-nav-final">
          Final additions
        </span>
      ) : (
        <Link
          className="program-module-nav__tab"
          to="/program/final-additions"
          data-testid="program-nav-final"
        >
          Final additions
        </Link>
      )}
    </nav>
  );
}
