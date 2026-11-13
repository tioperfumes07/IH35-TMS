/**
 * Program module home — Scenario Tracker ONLY.
 *
 * Owner 2026-08-08: strip blocks / tabs / 13-gate certification chrome from /program.
 * Keep the live end-to-end scenario tracker. The legacy certification board was removed
 * (owner order 2026-11-12).
 */
import { ScenarioTrackerHome } from "./scenario-tracker/ScenarioTrackerHome";

export function AuditScoreboardPage() {
  return <ScenarioTrackerHome />;
}

export default AuditScoreboardPage;
