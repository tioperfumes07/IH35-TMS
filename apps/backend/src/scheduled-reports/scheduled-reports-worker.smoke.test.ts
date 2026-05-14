import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { withLuciaBypass } from "../auth/db.js";

vi.mock("./report-delivery.js", () => ({
  deliverScheduledReportToEmail: vi.fn(async () => ({
    email_queue_id: null,
    generated_file_r2_path: "scheduled-reports/smoke/object.pdf",
    file_size_bytes: 32,
    subject: "smoke-subject",
    period_label: "smoke-period",
    summary: "smoke-summary",
  })),
}));

import { deliverScheduledReportToEmail } from "./report-delivery.js";
import { initializeScheduledReportsWorker, stopScheduledReportsWorker } from "./scheduled-reports-worker.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("scheduled-reports-worker smoke (always-on)", () => {
  it("short-circuits when ENABLE_SCHEDULED_REPORTS_WORKER=false", () => {
    const prev = process.env.ENABLE_SCHEDULED_REPORTS_WORKER;
    process.env.ENABLE_SCHEDULED_REPORTS_WORKER = "false";
    const info = vi.fn();
    const log = { info, error: vi.fn(), warn: vi.fn() } as unknown as FastifyInstance["log"];
    initializeScheduledReportsWorker({ log } as unknown as FastifyInstance);
    expect(info.mock.calls.flat().some((arg) => String(arg).includes("disabled"))).toBe(true);
    stopScheduledReportsWorker();
    if (prev === undefined) delete process.env.ENABLE_SCHEDULED_REPORTS_WORKER;
    else process.env.ENABLE_SCHEDULED_REPORTS_WORKER = prev;
  });

  it("stopScheduledReportsWorker() is idempotent when timer not started", () => {
    stopScheduledReportsWorker();
    stopScheduledReportsWorker();
    expect(true).toBe(true);
  });
});

describeIntegration("scheduled-reports-worker smoke (integration)", () => {
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    process.env.ENABLE_SCHEDULED_REPORTS_WORKER = "true";
    process.env.SCHEDULED_REPORTS_WORKER_INTERVAL_MS = "600000";
  });

  afterAll(() => {
    stopScheduledReportsWorker();
    delete process.env.SCHEDULED_REPORTS_WORKER_INTERVAL_MS;
  });

  it("processes a due schedule row and records a successful run (mocked delivery)", async () => {
    vi.mocked(deliverScheduledReportToEmail).mockClear();

    let scheduleId = "";
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) throw new Error("reporting.scheduled_reports missing (run migrations)");

      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO reporting.scheduled_reports (
            operating_company_id,
            report_id,
            report_params,
            frequency,
            cron_expression,
            run_time,
            run_day_of_week,
            run_day_of_month,
            timezone,
            recipients_to,
            subject_template,
            format,
            status,
            created_by_user_id,
            next_run_at
          )
          VALUES (
            $1::uuid,
            'profit-per-truck',
            '{"smoke":"scheduled-reports-worker-smoke"}'::jsonb,
            'cron',
            '*/1 * * * *',
            '06:00'::time,
            NULL,
            NULL,
            'America/Chicago',
            ARRAY['smoke@test.invalid']::text[],
            'Smoke {report_name}',
            'pdf',
            'active',
            $2::uuid,
            now() - interval '1 minute'
          )
          RETURNING id
        `,
        [companyId, TEST_OWNER_USER_ID]
      );
      scheduleId = String(ins.rows[0]?.id ?? "");
    });

    expect(scheduleId.length).toBeGreaterThan(10);

    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      child: vi.fn(function childStub() {
        return this;
      }),
    } as unknown as FastifyInstance["log"];

    initializeScheduledReportsWorker({ log } as unknown as FastifyInstance);
    await new Promise((resolve) => setTimeout(resolve, 750));
    stopScheduledReportsWorker();

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const runs = await client.query(
        `
          SELECT status, generated_file_r2_path
          FROM reporting.scheduled_report_runs
          WHERE scheduled_report_id = $1::uuid
          ORDER BY run_at DESC
          LIMIT 1
        `,
        [scheduleId]
      );
      expect(String(runs.rows[0]?.status ?? "")).toBe("success");
      expect(String(runs.rows[0]?.generated_file_r2_path ?? "")).toContain("scheduled-reports/smoke");

      await client.query(`DELETE FROM reporting.scheduled_reports WHERE id = $1::uuid`, [scheduleId]);
    });

    expect(vi.mocked(deliverScheduledReportToEmail).mock.calls.length).toBeGreaterThan(0);
  });
});
