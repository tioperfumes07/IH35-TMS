import Fastify from "fastify";
import { registerMaintenanceTriageRoutes } from "../apps/backend/src/maintenance/triage.routes.js";

async function run() {
  const app = Fastify();
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);
  app.addHook("preHandler", async (req) => {
    req.user = {
      uuid: "11111111-1111-4111-8111-111111111111",
      email: "dev@example.com",
      role: "Owner",
    };
    req.session = { id: "sess-1" };
  });

  await registerMaintenanceTriageRoutes(app);
  const issueId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const companyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/maintenance/triage/${issueId}/convert-to-damage?operating_company_id=${companyId}`,
    payload: {
      damage_category: "collision",
      additional_notes: "stub check",
    },
  });

  console.log("status", response.statusCode);
  console.log(response.body);
  await app.close();
}

await run();
