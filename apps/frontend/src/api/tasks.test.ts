import * as client from "./client";
import { createTask, createTaskType, updateTaskProgress, type CreateTaskInput } from "./tasks";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("tasks API client — request body must be a raw object (regression: double-stringify => 400)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("createTask POSTs a raw OBJECT body, not a JSON string", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ task: { task_id: "t1" } } as never);
    const input: CreateTaskInput = {
      operating_company_id: "co-1",
      category: "maintenance",
      title: "Inspect unit 1487",
      assigned_to_user_id: "user-1",
      scheduled_date: "2026-06-14",
      priority: 2,
    };
    await createTask(input);

    expect(spy).toHaveBeenCalledTimes(1);
    const [path, options] = spy.mock.calls[0];
    expect(path).toBe("/api/v1/tasks");
    expect(options?.method).toBe("POST");
    // The bug shipped a double-stringified body ('"{...}"'); the body must be a bare object so
    // apiRequest performs the single JSON.stringify (serialized body starts with '{', not '"{').
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(input);
    expect(JSON.stringify(options?.body).startsWith("{")).toBe(true);
  });

  it("createTaskType POSTs a raw OBJECT body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ type: { id: "tt1" } } as never);
    await createTaskType("co-1", "Maintenance");
    const [, options] = spy.mock.calls[0];
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual({ operating_company_id: "co-1", name: "Maintenance" });
  });

  it("updateTaskProgress PATCHes a raw OBJECT body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ task: { task_id: "t1", progress_pct: 50 } } as never);
    await updateTaskProgress("t1", 50);
    const [, options] = spy.mock.calls[0];
    expect(options?.method).toBe("PATCH");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual({ progress_pct: 50 });
  });
});
