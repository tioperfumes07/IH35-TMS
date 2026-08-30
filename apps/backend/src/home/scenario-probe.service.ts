import { isEnabled } from "../lib/feature-flags/service.js";
import { probeHolds, type ScenarioDefinition } from "./scenario-registry.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Execute one registry probe through the same request-time contract used by the certifier.
 * Flag-gated probes resolve the company override through the canonical feature-flag service and
 * select the corresponding count from the one scoped query row. An all-entity request cannot have
 * one flag answer, so it remains unproved instead of collapsing multiple company settings.
 */
export async function runScenarioProbe(
  client: QueryClient,
  def: ScenarioDefinition,
  entity: string | null,
): Promise<{ ok: boolean; evidence: string } | null> {
  if (!def.probe) return null;

  let countColumn = "n";
  let describe = def.probe.describe;
  if (def.probe.flag_gate) {
    if (!entity) {
      return {
        ok: false,
        evidence: `${def.probe.flag_gate.key} is per-entity — select an entity to resolve`,
      };
    }
    const enabled = await isEnabled(client as never, def.probe.flag_gate.key, {
      operating_company_id: entity,
    });
    if (enabled) {
      countColumn = def.probe.flag_gate.enabled_count_column;
      describe = def.probe.flag_gate.enabled_describe;
    }
  }

  const res = await client.query<Record<string, unknown>>(def.probe.sql, [entity]);
  const n = Number(res.rows[0]?.[countColumn] ?? 0);
  return { ok: probeHolds(n), evidence: describe(n) };
}
