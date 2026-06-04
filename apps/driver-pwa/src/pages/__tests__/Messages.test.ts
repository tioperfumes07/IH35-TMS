import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const messagesPage = readFileSync(resolve(root, "Messages.tsx"), "utf8");
const messagesApi = readFileSync(resolve(root, "../api/messages.ts"), "utf8");
const appRoutes = readFileSync(resolve(root, "../App.tsx"), "utf8");

describe("Driver PWA messages (A24-10)", () => {
  it("exposes Messages page with reply affordance", () => {
    expect(messagesPage).toContain("MessagesPage");
    expect(messagesPage).toContain("pwa-message-reply");
    expect(messagesPage).toContain("replyDriverPwaMessage");
  });

  it("wires /messages route in App", () => {
    expect(appRoutes).toContain('path="/messages"');
    expect(appRoutes).toContain("MessagesPage");
    expect(messagesApi).toContain("/api/v1/driver/messages");
  });
});
