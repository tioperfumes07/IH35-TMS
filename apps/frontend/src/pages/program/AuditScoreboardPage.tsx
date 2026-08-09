/**
 * Program module home — Scenario Tracker ONLY.
 *
 * Owner 2026-08-08: strip blocks / tabs / 13-gate certification chrome from /program.
 * Keep the live end-to-end scenario tracker. Legacy certification board stays at
 * /program/legacy-scoreboard until the new scoreboard design is planned and built.
 */
import { ScenarioTrackerHome } from "./scenario-tracker/ScenarioTrackerHome";

export function AuditScoreboardPage() {
  return <ScenarioTrackerHome />;
}

export default AuditScoreboardPage;
