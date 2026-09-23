#!/usr/bin/env node
/**
 * verify-draft-load-saves-and-is-visible.mjs
 *
 * ROUND 24.3 (owner, 2026-09-14, correcting an earlier wrong instruction of the owner's own):
 * "SAVE DRAFT" EXISTS AND WRITES NOTHING. "Save draft" was wrapped in `form.handleSubmit` — the
 * FULL book_dispatch validation gate. A half-finished load is the entire reason the button exists,
 * so it always failed validation and never wrote a row. Measured live: 0 status='draft' loads,
 * 0 is_quicksave_draft=true loads across 114 USMCA loads with a Save draft button on every booking.
 *
 * Three checks, matching the owner's own spec verbatim:
 *   1. STRUCTURAL — "draft" does not appear in the Kanban "assigned" lane's statuses array (it has
 *      its own "drafts" lane instead). apps/frontend/src/components/dispatch/DispatchKanban.tsx.
 *   2. INTEGRATION — "a draft save with the minimum fields persists a row (integration, not unit
 *      mock)". Requires apps/backend/src/dispatch/__tests__/book-load-save-draft.db.test.ts to
 *      exist with specific required assertions (a real Postgres round-trip through bookLoad()
 *      itself, not a mocked client — the `.db.test.ts` naming + `describeIntegration` convention
 *      already established across this repo), then actually runs it. Locally (no GITHUB_ACTIONS)
 *      that file's own gate skips it gracefully — real in CI's ephemeral Postgres, same as every
 *      other `.db.test.ts` in this repo.
 *   3. LIVE (graceful skip without DATABASE_URL) — no is_quicksave_draft=true USMCA load has an
 *      invoice, a driver bill, or a revenue-recognition GL posting. THE BYPASS TRAP (ROUND 24.1,
 *      "produced a false green three times today"): every bypass CTE below is MATERIALIZED and
 *      referenced in its own WHERE clause, or it silently returns 0 rows under FORCED RLS.
 *
 * Static + optional live read. No writes. Self-test: node scripts/verify-draft-load-saves-and-is-visible.mjs --selftest
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-draft-load-saves-and-is-visible";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const KANBAN_REL = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const DB_TEST_REL = "apps/backend/src/dispatch/__tests__/book-load-save-draft.db.test.ts";

/**
 * Pure evaluation core (unit-testable / self-testable).
 * @param {{kanbanSrc: string, dbTestSrc: string, dbTestExists: boolean}} input
 * @returns {string[]} failures (empty => pass)
 */
export function assertGuard({ kanbanSrc, dbTestSrc, dbTestExists }) {
  const failures = [];

  // --- (1) STRUCTURAL: "draft" removed from the "assigned" lane, has its own "drafts" lane ---
  const assignedLaneMatch = kanbanSrc.match(/key:\s*"assigned",\s*title:\s*"Assigned",\s*statuses:\s*\[([^\]]*)\]/);
  if (!assignedLaneMatch) {
    failures.push(`${KANBAN_REL} — could not find the "assigned" lane definition (extraction pattern is stale)`);
  } else if (/"draft"/.test(assignedLaneMatch[1])) {
    failures.push(`${KANBAN_REL} — the "assigned" lane's statuses still include "draft" (an unfinished booking must not sit next to dispatchable loads)`);
  }
  if (!/key:\s*"drafts"/.test(kanbanSrc)) {
    failures.push(`${KANBAN_REL} — no dedicated "drafts" lane found`);
  } else {
    if (!/key:\s*"drafts"[\s\S]{0,200}statuses:\s*\["draft"\]/.test(kanbanSrc)) {
      failures.push(`${KANBAN_REL} — the "drafts" lane does not carry statuses: ["draft"]`);
    }
    if (!/key:\s*"drafts"[\s\S]{0,200}derivedOnly:\s*true/.test(kanbanSrc)) {
      failures.push(`${KANBAN_REL} — the "drafts" lane is not derivedOnly:true (a card must not be draggable into/out of it — see FAIL-K1)`);
    }
  }

  // --- (2) INTEGRATION: the real Postgres round-trip test must exist and prove the real thing ---
  if (!dbTestExists) {
    failures.push(`MISSING test file: ${DB_TEST_REL} (no integration coverage proving a draft save actually persists a row)`);
  } else {
    const required = [
      ["describe.skipIf", "must use the established .db.test.ts convention (real Postgres in CI, gracefully skipped locally) — a plain unit test with a mocked client would not prove the write actually reaches the database"],
      ["bookLoad(", "must call bookLoad() itself — the real create path every caller (HTTP route, this test) goes through — not a re-implementation of its logic"],
      ['save_mode: "draft"', "must exercise the actual draft save mode"],
      ["is_quicksave_draft", "must assert the persisted row's is_quicksave_draft flag"],
      ["accounting.invoices", "must assert a draft mints no invoice"],
      ["driver_finance.driver_bills", "must assert a draft mints no driver bill"],
      ["load_revenue_recognition_postings", "must assert a draft mints no GL posting"],
      ["quicksave_completed_at", "must assert completion stamping when a draft is finished"],
    ];
    for (const [needle, why] of required) {
      if (!dbTestSrc.includes(needle)) {
        failures.push(`${DB_TEST_REL} missing assertion: "${needle}" (${why})`);
      }
    }
  }

  return failures;
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("verify-draft-load-saves-and-is-visible: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const totalRes = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT count(*) AS n FROM mdata.loads l
        WHERE (SELECT v FROM b)='lucia' AND l.operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live USMCA mdata.loads rows; completeness discriminator says this is an instrument problem, not a real zero`);
      return false;
    }
    console.log(`${LABEL}: completeness discriminator OK — ${total} live USMCA loads visible.`);

    const draftCountRes = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT count(*) AS n FROM mdata.loads l
        WHERE (SELECT v FROM b)='lucia' AND l.operating_company_id = $1::uuid AND l.is_quicksave_draft = true`,
      [USMCA_COMPANY_ID]
    );
    console.log(`${LABEL}: ${draftCountRes.rows[0].n} live USMCA is_quicksave_draft=true load(s) found.`);

    let failures = 0;
    const money = [
      ["invoice", "accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id"],
      ["driver bill", "driver_finance.driver_bills db ON db.load_id = l.id AND db.operating_company_id = l.operating_company_id"],
      ["GL posting", "accounting.load_revenue_recognition_postings p ON p.load_id = l.id AND p.operating_company_id = l.operating_company_id"],
    ];
    for (const [label, join] of money) {
      const res = await client.query(
        `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
         SELECT l.load_number FROM mdata.loads l
           JOIN ${join}
          WHERE (SELECT v FROM b)='lucia' AND l.operating_company_id = $1::uuid AND l.is_quicksave_draft = true`,
        [USMCA_COMPANY_ID]
      );
      if (res.rows.length > 0) {
        console.error(`${LABEL}: LIVE FAIL — ${res.rows.length} draft load(s) minted a ${label}: ${res.rows.map((r) => r.load_number).join(", ")}`);
        failures++;
      }
    }
    if (failures > 0) return false;
    console.log(`${LABEL}: LIVE PASS — 0 draft loads mint money.`);
    return true;
  } finally {
    await client.end();
  }
}

function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function runReal() {
  const kanbanSrc = readRepo(KANBAN_REL);
  const dbTestPath = path.join(ROOT, DB_TEST_REL);
  const dbTestExists = fs.existsSync(dbTestPath);
  const dbTestSrc = dbTestExists ? fs.readFileSync(dbTestPath, "utf8") : "";

  const failures = assertGuard({ kanbanSrc, dbTestSrc, dbTestExists });
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL (static checks):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  try {
    execSync(`npx vitest run ${DB_TEST_REL.replace(/^apps\/backend\//, "")}`, {
      cwd: path.join(ROOT, "apps/backend"),
      stdio: "inherit",
    });
  } catch {
    console.error(`[${LABEL}] FAIL — vitest run failed for ${DB_TEST_REL}`);
    process.exit(1);
  }

  const liveOk = await liveCheck();
  if (!liveOk) {
    console.error(`[${LABEL}] FAIL — live check failed`);
    process.exit(1);
  }

  console.log(
    `[${LABEL}] PASS — "draft" is not in the Kanban Assigned lane (has its own lane), a real Postgres round-trip proves a minimum-fields draft save persists a row and mints no money, and completion stamping is proven`
  );
}

function runSelftest() {
  const goodKanban = `
    const KANBAN_STATUS_GROUPS = [
      { key: "drafts", title: "Drafts", statuses: ["draft"], dropStatus: "draft", derivedOnly: true },
      { key: "assigned", title: "Assigned", statuses: ["planned", "unassigned", "booked", "assigned", "assigned_not_dispatched"], dropStatus: "assigned" },
    ];
  `;
  const goodDbTest = `
    const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
    describeIntegration("...", () => {
      it("persists", async () => {
        const result = await bookLoad(draftInput({ save_mode: "draft" }));
        expect(result.row.is_quicksave_draft).toBe(true);
        const invoices = await db.query("SELECT id FROM accounting.invoices WHERE source_load_id = $1", [loadId]);
        const bills = await db.query("SELECT id FROM driver_finance.driver_bills WHERE load_id = $1", [loadId]);
        const postings = await db.query("SELECT id FROM accounting.load_revenue_recognition_postings WHERE load_id = $1", [loadId]);
      });
      it("completes", async () => {
        expect(after.rows[0].quicksave_completed_at).not.toBeNull();
      });
    });
  `;

  const cases = [
    {
      name: "healthy: draft has its own lane, no longer in assigned; real integration test present",
      input: { kanbanSrc: goodKanban, dbTestSrc: goodDbTest, dbTestExists: true },
      expectPass: true,
    },
    {
      name: "regression: \"draft\" back in the assigned lane's statuses",
      input: {
        kanbanSrc: goodKanban.replace('statuses: ["planned"', 'statuses: ["draft", "planned"'),
        dbTestSrc: goodDbTest,
        dbTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: drafts lane exists but is not derivedOnly (would be draggable, letting a real load get demoted to a draft by mistake)",
      input: {
        kanbanSrc: goodKanban.replace(', derivedOnly: true },\n      { key: "assigned"', ' },\n      { key: "assigned"'),
        dbTestSrc: goodDbTest,
        dbTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: no dedicated drafts lane at all",
      input: {
        kanbanSrc: goodKanban.replace('{ key: "drafts", title: "Drafts", statuses: ["draft"], dropStatus: "draft", derivedOnly: true },', ""),
        dbTestSrc: goodDbTest,
        dbTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: no integration test file at all",
      input: { kanbanSrc: goodKanban, dbTestSrc: "", dbTestExists: false },
      expectPass: false,
    },
    {
      name: "regression: test exists but is a unit-mock test, not describe.skipIf real-Postgres integration (would not have caught the original defect)",
      input: {
        kanbanSrc: goodKanban,
        dbTestSrc: goodDbTest.replace('describe.skipIf(process.env.GITHUB_ACTIONS !== "true")', "describe"),
        dbTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: test proves the save but never proves no money minted",
      input: {
        kanbanSrc: goodKanban,
        dbTestSrc: goodDbTest
          .replace("accounting.invoices", "x")
          .replace("driver_finance.driver_bills", "x")
          .replace("load_revenue_recognition_postings", "x"),
        dbTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: test never proves completion stamping on resume",
      input: { kanbanSrc: goodKanban, dbTestSrc: goodDbTest.replace(/quicksave_completed_at/g, "x"), dbTestExists: true },
      expectPass: false,
    },
  ];

  let ok = true;
  for (const c of cases) {
    const failures = assertGuard(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`[${LABEL}] --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  await runReal();
}
