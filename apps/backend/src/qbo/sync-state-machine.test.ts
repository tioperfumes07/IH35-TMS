import { describe, expect, it, vi } from "vitest";
import {
  transitionTerminalToPending,
  transitionToFailed,
  transitionToSucceeded,
} from "./sync-state-machine.js";

function mockClient() {
  return {
    query: vi.fn(async () => ({ rows: [{ id: "run-1" }] })),
  };
}

describe("qbo sync state machine repair guards", () => {
  it("reopens only dead_letter runs for manual repair", async () => {
    const client = mockClient();
    await transitionTerminalToPending(client as never, {
      syncRunId: "00000000-0000-4000-8000-000000000001",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
    });
    const sql = String(client.query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND status = 'dead_letter'");
    expect(sql).toContain("completed_at = NULL");
  });

  it("marks success only from running state", async () => {
    const client = mockClient();
    await transitionToSucceeded(client as never, {
      syncRunId: "00000000-0000-4000-8000-000000000002",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
    });
    const sql = String(client.query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND status = 'running'");
  });

  it("marks failure only from running state", async () => {
    const client = mockClient();
    await transitionToFailed(client as never, {
      syncRunId: "00000000-0000-4000-8000-000000000003",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
      attemptCountAfterFailure: 1,
      errorMessage: "boom",
    });
    const sql = String(client.query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND status = 'running'");
  });
});
