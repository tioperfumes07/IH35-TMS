import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const streamRoutes = fs.readFileSync(path.join(here, "stream.routes.ts"), "utf8");
const notificationsRoutes = fs.readFileSync(path.join(here, "notifications.routes.ts"), "utf8");

describe("notification stream routes (AUDIT-FIX-9)", () => {
  it("registers SSE route with CORS, flushHeaders, and interval polling", () => {
    expect(streamRoutes).toContain("/api/v1/notifications/stream");
    expect(streamRoutes).toContain("applySseCorsHeaders");
    expect(streamRoutes).toContain("text/event-stream");
    expect(streamRoutes).toContain("setInterval");
    expect(streamRoutes).toContain("notificationsTableReady");
    expect(streamRoutes).not.toMatch(/while\s*\(\s*!closed\s*\)/);
  });

  it("notifications.routes wires stream.routes instead of legacy notification-stream", () => {
    expect(notificationsRoutes).toContain("./stream.routes.js");
    expect(notificationsRoutes).toContain("registerNotificationStreamRoutes");
    expect(notificationsRoutes).not.toContain("./notification-stream.routes.js");
  });
});
