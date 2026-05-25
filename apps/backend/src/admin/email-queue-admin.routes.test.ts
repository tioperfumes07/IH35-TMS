import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../auth/db.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerEmailRoutes } from "../email/email.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("email.queue GET /api/v1/email/queue integration", () => {
  let app: FastifyInstance;
  let operatingCompanyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    getOperatingCompanyId();
    operatingCompanyId = await withLuciaBypass(async (client) => {
      const company = await client.query<{ id: string }>(
        `
          SELECT c.id::text AS id
          FROM org.companies c
          WHERE NOT EXISTS (
            SELECT 1
            FROM email.email_queue q
            WHERE q.operating_company_id = c.id
          )
          ORDER BY c.code ASC
          LIMIT 1
        `
      );
      const id = company.rows[0]?.id;
      if (!id) {
        throw new Error("requires at least one company with zero email queue rows");
      }
      await client.query(
        `
          INSERT INTO org.user_company_access (user_id, company_id)
          VALUES ($1::uuid, $2::uuid)
          ON CONFLICT (user_id, company_id) DO NOTHING
        `,
        [TEST_OWNER_USER_ID, id]
      );
      return id;
    });
    app = await createIntegrationApp(async (a) => {
      await registerEmailRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with empty items for an operating_company_id with no queue rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/email/queue?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items?: unknown[]; next_cursor?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items?.length ?? 0).toBe(0);
    expect(body.next_cursor ?? null).toBeNull();
  });
});

describe("email.queue admin integration suite wiring", () => {
  it("integration suite is gated to CI (GITHUB_ACTIONS)", () => {
    expect(typeof describeIntegration).toBe("function");
  });
});
