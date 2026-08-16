/**
 * LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES — finance.forecast_scenarios / finance.forecast_lines
 * persistence (real Postgres). Proves createScenario writes a versioned scenario + line items,
 * activateScenario atomically supersedes the prior active scenario (never deletes it), and
 * recordLineActual + getActiveScenarioSummary round-trip correctly. Runs only in CI
 * (GITHUB_ACTIONS=true) — mirrors finance/amortization/__tests__/amortization.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import {
  activateScenario,
  createScenario,
  getActiveScenarioSummary,
  getScenarioDetail,
  recordLineActual,
} from "../scenarios.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("LV-FINANCE-PLANNING finance scenarios persistence (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const userId = "00000000-0000-4000-8000-0000000000fb";
  const createdScenarioIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await fn(); await db.query("COMMIT"); return r; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `fin-scenario-${randomUUID()}@test.local`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM finance.forecast_lines WHERE scenario_id = ANY($1::uuid[])`, [createdScenarioIds]);
        await db.query(`DELETE FROM finance.forecast_scenarios WHERE id = ANY($1::uuid[])`, [createdScenarioIds]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("creates a scenario + expands line_templates × period_count into forecast_lines", async () => {
    const result = await bypass(() =>
      createScenario(db, userId, {
        operating_company_id: companyId,
        name: `Test Scenario ${randomUUID().slice(0, 6)}`,
        period_basis: "monthly",
        period_start: "2027-01-01",
        period_count: 3,
        notes: "db test",
        line_templates: [
          { category_kind: "revenue", category_label: "Line-haul", assumption_note: "flat", monthly_estimate_cents: 500000 },
          { category_kind: "expense", category_label: "Fuel", assumption_note: "flat", monthly_estimate_cents: 150000 },
        ],
      })
    );
    createdScenarioIds.push(result.scenario.id);

    expect(result.scenario.status).toBe("draft");
    expect(result.lines).toHaveLength(6); // 2 templates x 3 periods
    expect(result.lines.filter((l) => l.category_kind === "revenue")).toHaveLength(3);
    expect(result.lines.map((l) => l.period_label).sort()).toEqual(["2027-01", "2027-01", "2027-02", "2027-02", "2027-03", "2027-03"]);

    const reread = await bypass(() => getScenarioDetail(db, companyId, result.scenario.id));
    expect(reread?.lines).toHaveLength(6);
  });

  it("activating a second scenario atomically supersedes the first — never deletes it", async () => {
    const first = await bypass(() =>
      createScenario(db, userId, {
        operating_company_id: companyId,
        name: `Test Scenario A ${randomUUID().slice(0, 6)}`,
        period_basis: "monthly",
        period_start: "2027-01-01",
        period_count: 1,
        line_templates: [{ category_kind: "revenue", category_label: "Rev", assumption_note: "x", monthly_estimate_cents: 100000 }],
      })
    );
    createdScenarioIds.push(first.scenario.id);
    await bypass(() => activateScenario(db, userId, companyId, first.scenario.id));

    const second = await bypass(() =>
      createScenario(db, userId, {
        operating_company_id: companyId,
        name: `Test Scenario B ${randomUUID().slice(0, 6)}`,
        period_basis: "monthly",
        period_start: "2027-01-01",
        period_count: 1,
        line_templates: [{ category_kind: "revenue", category_label: "Rev", assumption_note: "x", monthly_estimate_cents: 200000 }],
      })
    );
    createdScenarioIds.push(second.scenario.id);
    const activated = await bypass(() => activateScenario(db, userId, companyId, second.scenario.id));
    expect(activated.status).toBe("active");

    // The first scenario must still EXIST (void/supersede-not-delete), now marked superseded.
    const firstReread = await bypass(() => getScenarioDetail(db, companyId, first.scenario.id));
    expect(firstReread).not.toBeNull();
    expect(firstReread?.scenario.status).toBe("superseded");
    expect(firstReread?.scenario.superseded_by_scenario_id).toBe(second.scenario.id);
    expect(firstReread?.lines).toHaveLength(1); // lines untouched

    const summary = await bypass(() => getActiveScenarioSummary(db, companyId));
    expect(summary?.scenario.id).toBe(second.scenario.id);
    expect(summary?.totals.estimate_revenue_cents).toBe(200000);
  });

  it("records a manual actual and rolls it into the active-scenario summary", async () => {
    const result = await bypass(() =>
      createScenario(db, userId, {
        operating_company_id: companyId,
        name: `Test Scenario Actual ${randomUUID().slice(0, 6)}`,
        period_basis: "monthly",
        period_start: "2027-01-01",
        period_count: 1,
        line_templates: [
          { category_kind: "revenue", category_label: "Rev", assumption_note: "x", monthly_estimate_cents: 300000 },
          { category_kind: "expense", category_label: "Exp", assumption_note: "x", monthly_estimate_cents: 100000 },
        ],
      })
    );
    createdScenarioIds.push(result.scenario.id);
    await bypass(() => activateScenario(db, userId, companyId, result.scenario.id));

    const revenueLine = result.lines.find((l) => l.category_kind === "revenue");
    if (!revenueLine) throw new Error("revenue line missing");
    const updated = await bypass(() => recordLineActual(db, userId, companyId, revenueLine.id, 320000));
    expect(updated.actual_amount_cents).toBe(320000);
    expect(updated.actual_source).toBe("manual");
    expect(updated.actual_recorded_at).not.toBeNull();

    const summary = await bypass(() => getActiveScenarioSummary(db, companyId));
    expect(summary?.totals.actual_revenue_cents).toBe(320000);
    expect(summary?.totals.has_any_actuals).toBe(true);
  });
});
