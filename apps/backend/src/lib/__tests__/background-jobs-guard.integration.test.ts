import { describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../auth/db.js";
import { wrapBackgroundJobTick } from "../background-jobs.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("background job guard failure recording", () => {
  it("records scheduler guard failures in _system.background_jobs", async () => {
    const jobName = "test.scheduler_tenant_context_guard";
    await wrapBackgroundJobTick(jobName, async () => {
      throw new Error("[test] invalid tenant context");
    });

    const row = await withLuciaBypass(async (client) => {
      const exists = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;
      const res = await client.query<{
        job_name: string;
        last_error_message: string | null;
        last_failed_run_at: string | null;
      }>(
        `
          SELECT job_name::text, last_error_message, last_failed_run_at::text
          FROM _system.background_jobs
          WHERE job_name = $1
          LIMIT 1
        `,
        [jobName]
      );
      return res.rows[0] ?? null;
    });

    expect(row).not.toBeNull();
    expect(row?.job_name).toBe(jobName);
    expect(row?.last_error_message).toContain("invalid tenant context");
    expect(row?.last_failed_run_at).toBeTruthy();
  });
});
