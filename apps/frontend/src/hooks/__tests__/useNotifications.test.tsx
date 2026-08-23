import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "../useNotifications";

// CC3-NOTIFICATIONS-EVENTSOURCE-WRONG-ORIGIN-20260822 regression:
// the live-push EventSource must resolve through resolveApiUrl() (the same split-host
// routing every other network call uses), not a bare relative path that the browser
// resolves against the STATIC SPA HOST on prod. See GUARD-WORKORDERS.md
// SYS-F5984-NOTIFICATIONS-EVENTSOURCE-HITS-WRONG-ORIGIN-NEVER-CONNECTS.

vi.mock("../../api/client", () => ({
  apiRequest: vi.fn(async (path: string) => {
    if (path.includes("unread-count")) return { unread_count: 0 };
    return { notifications: [] };
  }),
  resolveApiUrl: (path: string) =>
    `https://api.ih35dispatch.com${path}`,
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {}
}

describe("useNotifications", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    // @ts-expect-error -- test stub, not a full EventSource implementation
    global.EventSource = FakeEventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the live stream against the real API host, never a bare relative path", async () => {
    const { result } = renderHook(() => useNotifications({ enableStream: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(FakeEventSource.instances).toHaveLength(1);
    const streamedUrl = FakeEventSource.instances[0].url;
    expect(streamedUrl).toBe("https://api.ih35dispatch.com/api/v1/notifications/stream");
    // The historical bug: a bare relative path with no host, left for the browser to resolve
    // against window.location.origin (the static SPA host on prod).
    expect(streamedUrl).not.toBe("/api/v1/notifications/stream");
  });
});
