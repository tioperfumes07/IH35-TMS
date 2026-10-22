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

  it("LEAD 443.219 G-ERR — the cursor is the row's exact timestamp + id (a ms-truncated Date re-sent the last row every poll)", () => {
    expect(streamRoutes).toContain("created_at::text AS cursor_at");
    expect(streamRoutes).toContain("(created_at, id) > ($2::timestamptz, $3::uuid)");
    expect(streamRoutes).toContain("ORDER BY created_at ASC, id ASC");
  });
});
