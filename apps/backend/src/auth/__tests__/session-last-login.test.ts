import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, createSessionMock, withLuciaBypassMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  createSessionMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../lucia.js", () => ({
  lucia: {
    createSession: createSessionMock,
  },
}));

import {
  LAST_LOGIN_UPDATE_SQL,
  createSessionWithLastLogin,
  touchUserLastLoginAt,
} from "../session-create.js";

describe("session create last_login_at", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({ id: "sess-1" });
    withLuciaBypassMock.mockImplementation(
      async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock })
    );
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("updates last_login_at to now() when a session is created", async () => {
    await createSessionWithLastLogin("user-1", {});

    expect(createSessionMock).toHaveBeenCalledWith("user-1", {});
    expect(queryMock).toHaveBeenCalledWith(LAST_LOGIN_UPDATE_SQL, ["user-1"]);
  });

  it("touchUserLastLoginAt runs the last_login_at update SQL", async () => {
    await touchUserLastLoginAt({ query: queryMock }, "user-2");
    expect(queryMock).toHaveBeenCalledWith(LAST_LOGIN_UPDATE_SQL, ["user-2"]);
  });
});
