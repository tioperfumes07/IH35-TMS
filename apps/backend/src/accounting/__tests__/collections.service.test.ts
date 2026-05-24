import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionTaskStatus } from "../collections.service.js";

type TestTask = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  invoice_id: string;
  owed_cents: number;
  days_overdue: number;
  aging_bucket: string;
  status: CollectionTaskStatus;
  resolution: string | null;
  closed_at: string | null;
};

type TestContact = {
  id: string;
  task_id: string;
  contact_type: string;
  notes: string;
  next_action_date: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

let activeClient: {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const appendCrudAuditMock = vi.fn(async () => undefined);

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (client: typeof activeClient) => Promise<unknown>) => fn(activeClient),
  withCurrentUser: async (_userId: string, fn: (client: typeof activeClient) => Promise<unknown>) => fn(activeClient),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAuditMock(...args),
}));

import { logCollectionContact, resolveCollectionTask, syncCollectionTasks } from "../collections.service.js";

function createSyncClient(data: {
  invoices: Array<{ invoice_id: string; customer_id: string; owed_cents: number; days_overdue: number; status: string }>;
  tasks: TestTask[];
}) {
  const tasks = data.tasks;
  let seq = 0;
  const query = async <T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> => {
    if (sql.includes("FROM accounting.invoices i")) {
      return { rows: data.invoices as unknown as T[] };
    }
    if (sql.includes("FROM accounting.ar_collection_tasks") && sql.includes("WHERE operating_company_id = $1::uuid")) {
      return { rows: tasks.map((task) => ({ id: task.id, invoice_id: task.invoice_id, status: task.status })) as unknown as T[] };
    }
    if (sql.includes("INSERT INTO accounting.ar_collection_tasks")) {
      const [operatingCompanyId, customerId, invoiceId, owedCents, daysOverdue, agingBucket] = values as [string, string, string, number, number, string];
      const existing = tasks.find((task) => task.operating_company_id === operatingCompanyId && task.invoice_id === invoiceId);
      if (existing) {
        existing.customer_id = customerId;
        existing.owed_cents = Number(owedCents);
        existing.days_overdue = Number(daysOverdue);
        existing.aging_bucket = agingBucket;
        if (existing.status === "resolved") {
          existing.status = "open";
          existing.resolution = null;
          existing.closed_at = null;
        }
        return { rows: [{ id: existing.id, inserted: false, prior_status: existing.status }] as unknown as T[] };
      }
      const created: TestTask = {
        id: `task-${++seq}`,
        operating_company_id: operatingCompanyId,
        customer_id: customerId,
        invoice_id: invoiceId,
        owed_cents: Number(owedCents),
        days_overdue: Number(daysOverdue),
        aging_bucket: agingBucket,
        status: "open",
        resolution: null,
        closed_at: null,
      };
      tasks.push(created);
      return { rows: [{ id: created.id, inserted: true, prior_status: null }] as unknown as T[] };
    }
    if (sql.includes("UPDATE accounting.ar_collection_tasks") && sql.includes("resolution = COALESCE(resolution, 'paid')")) {
      const [taskId, owedCents, daysOverdue, agingBucket] = values as [string, number, number, string];
      const task = tasks.find((row) => row.id === taskId);
      if (task) {
        task.status = "resolved";
        task.resolution = task.resolution ?? "paid";
        task.closed_at = task.closed_at ?? "2026-01-15T00:00:00.000Z";
        task.owed_cents = Number(owedCents);
        task.days_overdue = Number(daysOverdue);
        task.aging_bucket = agingBucket;
      }
      return { rows: [] as T[] };
    }
    if (sql.includes("SELECT COUNT(*)::int AS open_count")) {
      return { rows: [{ open_count: tasks.filter((task) => task.status !== "resolved").length }] as unknown as T[] };
    }
    if (sql.includes("set_config('app.operating_company_id'")) {
      return { rows: [] as T[] };
    }
    throw new Error(`unhandled sync SQL: ${sql.slice(0, 80)}`);
  };
  return { query, tasks };
}

function createContactClient(seedTask: TestTask) {
  const contacts: TestContact[] = [];
  const task = seedTask;
  const query = async <T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] as T[] };
    if (sql.includes("SELECT id::text, invoice_id::text")) {
      const [taskId] = values as [string];
      if (taskId !== task.id) return { rows: [] as T[] };
      return { rows: [{ id: task.id, invoice_id: task.invoice_id }] as unknown as T[] };
    }
    if (sql.includes("INSERT INTO accounting.ar_collection_contacts")) {
      const [taskId, contactType, notes, nextActionDate, createdByUserId] = values as [string, string, string, string | null, string];
      const row: TestContact = {
        id: "contact-1",
        task_id: taskId,
        contact_type: contactType,
        notes,
        next_action_date: nextActionDate,
        created_at: "2026-01-01T00:00:00.000Z",
        created_by_user_id: createdByUserId,
      };
      contacts.push(row);
      return { rows: [row] as unknown as T[] };
    }
    if (sql.includes("SET\n          status = CASE WHEN status = 'resolved' THEN status ELSE 'contacted' END")) {
      task.status = task.status === "resolved" ? "resolved" : "contacted";
      return { rows: [] as T[] };
    }
    if (sql.includes("SELECT audit.append_event")) return { rows: [] as T[] };
    if (sql.includes("UPDATE accounting.ar_collection_tasks") && sql.includes("RETURNING id::text")) {
      const [taskId, , resolution] = values as [string, string, string];
      if (taskId !== task.id) return { rows: [] as T[] };
      task.status = "resolved";
      task.resolution = resolution;
      task.closed_at = "2026-01-02T00:00:00.000Z";
      return { rows: [{ id: task.id, invoice_id: task.invoice_id, closed_at: task.closed_at }] as unknown as T[] };
    }
    throw new Error(`unhandled contact SQL: ${sql.slice(0, 80)}`);
  };
  return { query, contacts, task };
}

describe("collections.service", () => {
  beforeEach(() => {
    appendCrudAuditMock.mockClear();
  });

  it("syncCollectionTasks creates task when invoice crosses 30 days", async () => {
    const client = createSyncClient({
      invoices: [{ invoice_id: "inv-1", customer_id: "cust-1", owed_cents: 15_000, days_overdue: 30, status: "sent" }],
      tasks: [],
    });
    activeClient = { query: client.query };

    const result = await syncCollectionTasks({ operatingCompanyId: "11111111-1111-1111-1111-111111111111", actorUserId: "user-1" });

    expect(result.created).toBe(1);
    expect(client.tasks).toHaveLength(1);
    expect(client.tasks[0]?.aging_bucket).toBe("1_30");
  });

  it("syncCollectionTasks closes task when invoice is paid", async () => {
    const client = createSyncClient({
      invoices: [{ invoice_id: "inv-1", customer_id: "cust-1", owed_cents: 0, days_overdue: 61, status: "paid" }],
      tasks: [
        {
          id: "task-1",
          operating_company_id: "11111111-1111-1111-1111-111111111111",
          customer_id: "cust-1",
          invoice_id: "inv-1",
          owed_cents: 15_000,
          days_overdue: 61,
          aging_bucket: "61_90",
          status: "open",
          resolution: null,
          closed_at: null,
        },
      ],
    });
    activeClient = { query: client.query };

    const result = await syncCollectionTasks({ operatingCompanyId: "11111111-1111-1111-1111-111111111111", actorUserId: "user-1" });

    expect(result.resolved).toBe(1);
    expect(client.tasks[0]?.status).toBe("resolved");
    expect(client.tasks[0]?.resolution).toBe("paid");
  });

  it("syncCollectionTasks does not create duplicate task for same invoice", async () => {
    const client = createSyncClient({
      invoices: [{ invoice_id: "inv-1", customer_id: "cust-1", owed_cents: 20_000, days_overdue: 45, status: "partial" }],
      tasks: [
        {
          id: "task-1",
          operating_company_id: "11111111-1111-1111-1111-111111111111",
          customer_id: "cust-1",
          invoice_id: "inv-1",
          owed_cents: 10_000,
          days_overdue: 30,
          aging_bucket: "1_30",
          status: "open",
          resolution: null,
          closed_at: null,
        },
      ],
    });
    activeClient = { query: client.query };

    const result = await syncCollectionTasks({ operatingCompanyId: "11111111-1111-1111-1111-111111111111", actorUserId: "user-1" });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(client.tasks).toHaveLength(1);
    expect(client.tasks[0]?.owed_cents).toBe(20_000);
  });

  it("logCollectionContact appends to ar_collection_contacts", async () => {
    const client = createContactClient({
      id: "task-1",
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      customer_id: "cust-1",
      invoice_id: "inv-1",
      owed_cents: 12_000,
      days_overdue: 35,
      aging_bucket: "31_60",
      status: "open",
      resolution: null,
      closed_at: null,
    });
    activeClient = { query: client.query };

    const result = await logCollectionContact({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      taskId: "task-1",
      contactType: "call",
      notes: "Spoke with AP, promised Friday payment",
      nextActionDate: "2026-01-20",
    });

    expect(result?.contact_type).toBe("call");
    expect(client.contacts).toHaveLength(1);
    expect(client.task.status).toBe("contacted");
  });

  it("resolveCollectionTask sets closed_at and emits audit event", async () => {
    const client = createContactClient({
      id: "task-1",
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      customer_id: "cust-1",
      invoice_id: "inv-1",
      owed_cents: 12_000,
      days_overdue: 35,
      aging_bucket: "31_60",
      status: "contacted",
      resolution: null,
      closed_at: null,
    });
    activeClient = { query: client.query };

    const result = await resolveCollectionTask({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      taskId: "task-1",
      resolution: "disputed",
    });

    expect(result?.closed_at).toBeTruthy();
    expect(client.task.closed_at).toBeTruthy();
    expect(appendCrudAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "collection.task_resolved",
      expect.objectContaining({ task_id: "task-1", resolution: "disputed" }),
      "info",
      expect.any(String)
    );
  });
});
