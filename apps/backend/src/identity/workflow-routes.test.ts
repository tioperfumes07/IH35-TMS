import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkflowRoutes } from "./workflow-routes.js";

// USER-S02-BACKEND: the Change Role approver ceremony (Users.tsx + PR #5346) was UI-only -- the
// backend never required or checked required_approver_user_id. Live-found 2026-08-29 via a real
// identity.workflow_requests row (WF-064-IDENT-002, new_role=Owner) with no approver in its
// payload. These tests exercise the server-side enforcement added to close that gap.

const REQUESTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_APPROVER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NON_ADMIN_APPROVER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_ADMIN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type UserRow = { id: string; role: string; deactivated_at: string | null };

const usersFixture: Record<string, UserRow> = {
  [TARGET_ID]: { id: TARGET_ID, role: "Driver", deactivated_at: null },
  [ADMIN_APPROVER_ID]: { id: ADMIN_APPROVER_ID, role: "Administrator", deactivated_at: null },
  [OTHER_ADMIN_ID]: { id: OTHER_ADMIN_ID, role: "Owner", deactivated_at: null },
  [NON_ADMIN_APPROVER_ID]: { id: NON_ADMIN_APPROVER_ID, role: "Dispatcher", deactivated_at: null },
};

type WorkflowRow = {
  id: string;
  action_code: string;
  status: string;
  requested_by: string;
  target_user: string;
  payload: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

const pendingWorkflow = { row: null as WorkflowRow | null };

function makeWorkflowRow(overrides: Partial<WorkflowRow>): WorkflowRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    action_code: "WF-064-IDENT-002",
    status: "Pending",
    requested_by: REQUESTER_ID,
    target_user: TARGET_ID,
    payload: { new_role: "Owner" },
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

const queryMock = vi.fn(async (sql: string, values: unknown[] = []) => {
  if (sql.includes("FROM identity.users WHERE id = $1")) {
    const row = usersFixture[values[0] as string];
    return { rows: row ? [row] : [] };
  }
  if (sql.includes("SELECT audit.append_event")) {
    return { rows: [] };
  }
  if (sql.includes("INSERT INTO identity.workflow_requests")) {
    const row = makeWorkflowRow({
      action_code: values[0] as string,
      requested_by: values[1] as string,
      target_user: values[2] as string,
      payload: JSON.parse(values[3] as string),
    });
    return { rows: [row] };
  }
  if (sql.includes("FROM identity.workflow_requests") && sql.includes("FOR UPDATE")) {
    return { rows: pendingWorkflow.row ? [pendingWorkflow.row] : [] };
  }
  if (sql.includes("UPDATE identity.users SET role")) {
    return { rows: [] };
  }
  if (sql.includes("UPDATE identity.workflow_requests") && sql.includes("status = 'Approved'")) {
    const row = { ...(pendingWorkflow.row as WorkflowRow), status: "Approved", decided_by: values[1] as string };
    return { rows: [row] };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("identity workflow routes -- USER-S02 approver ceremony (server-side)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    queryMock.mockClear();
    pendingWorkflow.row = null;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(authUser: { uuid: string; role: string }) {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = authUser;
    });
    await registerWorkflowRoutes(app);
    return app;
  }

  describe("POST /api/v1/identity/workflow-requests (create)", () => {
    it("rejects an Owner role-change request with no required_approver_user_id", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: { action_code: "WF-064-IDENT-002", target_user: TARGET_ID, payload: { new_role: "Owner" } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "role_change_requires_approver" });
    });

    it("rejects the target user as their own approver", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: {
          action_code: "WF-064-IDENT-002",
          target_user: TARGET_ID,
          payload: { new_role: "Administrator", required_approver_user_id: TARGET_ID },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "role_change_approver_cannot_be_target" });
    });

    it("rejects the requester as their own approver", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: {
          action_code: "WF-064-IDENT-002",
          target_user: TARGET_ID,
          payload: { new_role: "Owner", required_approver_user_id: REQUESTER_ID },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "role_change_approver_cannot_be_requester" });
    });

    it("rejects a non-admin-role user as the named approver", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: {
          action_code: "WF-064-IDENT-002",
          target_user: TARGET_ID,
          payload: { new_role: "Owner", required_approver_user_id: NON_ADMIN_APPROVER_ID },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "role_change_approver_not_eligible" });
    });

    it("accepts an Owner role-change request with an eligible, distinct admin approver", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: {
          action_code: "WF-064-IDENT-002",
          target_user: TARGET_ID,
          payload: { new_role: "Owner", required_approver_user_id: ADMIN_APPROVER_ID },
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ status: "Pending" });
    });

    it("does not require an approver for a non-admin new_role", async () => {
      const app = await buildApp({ uuid: REQUESTER_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/identity/workflow-requests",
        payload: {
          action_code: "WF-064-IDENT-002",
          target_user: TARGET_ID,
          payload: { new_role: "Dispatcher" },
        },
      });
      expect(response.statusCode).toBe(201);
    });
  });

  describe("POST /api/v1/identity/workflow-requests/:id/approve", () => {
    it("blocks approval of an admin-level role change with no approver on the payload (legacy row)", async () => {
      pendingWorkflow.row = makeWorkflowRow({ payload: { new_role: "Owner" } });
      const app = await buildApp({ uuid: OTHER_ADMIN_ID, role: "Administrator" });
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/identity/workflow-requests/${pendingWorkflow.row.id}/approve`,
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "role_change_missing_approver" });
    });

    it("rejects approval by an admin who is not the named approver", async () => {
      pendingWorkflow.row = makeWorkflowRow({
        payload: { new_role: "Owner", required_approver_user_id: ADMIN_APPROVER_ID },
      });
      const app = await buildApp({ uuid: OTHER_ADMIN_ID, role: "Owner" });
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/identity/workflow-requests/${pendingWorkflow.row.id}/approve`,
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "role_change_wrong_approver" });
    });

    it("accepts approval by the named approver", async () => {
      pendingWorkflow.row = makeWorkflowRow({
        payload: { new_role: "Owner", required_approver_user_id: ADMIN_APPROVER_ID },
      });
      const app = await buildApp({ uuid: ADMIN_APPROVER_ID, role: "Administrator" });
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/identity/workflow-requests/${pendingWorkflow.row.id}/approve`,
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "Approved" });
    });
  });
});
